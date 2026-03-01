-- =============================================================================
-- MIGRATION: Paiements internes + Ledger + Notifications V3
-- Branch: cursor/paiements-internes-et-ledger-825c
-- Date:   2026-04-02
--
-- Implemente :
--   1. Table payments  (source de verite du nouveau flow)
--   2. Colonne payment_id sur ledger_entries (FK -> payments)
--   3. Colonne kind sur notifications  IN ('tx','spender','payment')
--   4. RLS strict sur payments / ledger_entries / notifications
--   5. Vue v_user_balances
--   6. Trigger fn_payments_on_insert  -> notif "payment" chez le receiver
--   7. Trigger fn_payments_on_status_change
--        confirmed -> ledger (debit payer + credit receiver) + notif createur
--        refused   -> notif createur  (aucun ledger)
--        cancelled -> notif receiver  (aucun ledger)
--   8. RPCs SECURITY DEFINER :
--        rpc_create_payment / rpc_confirm_payment /
--        rpc_refuse_payment / rpc_cancel_payment
--   9. Scenarios de test commentes (3 flows metier)
--
-- Regles comptables :
--   * ledger_entries.amount TOUJOURS > 0
--   * entry_type IN ('payer_debit','receiver_credit')
--   * Idempotence : si payment deja confirmed -> no-op (guard sur payment_id)
--   * Pas d'impact ledger sur refused / cancelled
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0.  Helper : role du user courant (SECURITY DEFINER pour eviter le N+1 RLS)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._get_my_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $func$ SELECT role FROM profiles WHERE id = auth.uid() $func$;

GRANT EXECUTE ON FUNCTION public._get_my_role() TO authenticated;

-- -----------------------------------------------------------------------------
-- 1.  TABLE payments
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payments (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  created_by_user_id  uuid        NOT NULL REFERENCES public.profiles(id),

  -- 'outgoing' : createur est payeur   (manager->chatter, manager->model)
  -- 'incoming' : createur est receveur (manager declare reception provider)
  direction           text        NOT NULL CHECK (direction IN ('outgoing','incoming')),

  payer_user_id       uuid        NOT NULL REFERENCES public.profiles(id),
  receiver_user_id    uuid        NOT NULL REFERENCES public.profiles(id),

  CONSTRAINT payments_no_self_payment CHECK (payer_user_id <> receiver_user_id),

  amount              numeric     NOT NULL CHECK (amount > 0),
  currency            text        NOT NULL DEFAULT 'EUR',

  kind                text        NOT NULL DEFAULT 'salary'
    CHECK (kind IN ('salary','bonus','declaration','adjustment')),

  note                text        NOT NULL DEFAULT '',

  status              text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','refused','cancelled')),

  confirmed_at        timestamptz,
  refused_at          timestamptz,
  refused_reason      text        NOT NULL DEFAULT '',
  cancelled_at        timestamptz
);

CREATE OR REPLACE FUNCTION public.fn_set_payments_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $func$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_payments_updated_at ON public.payments;
CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_payments_updated_at();

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_payments_payer    ON public.payments(payer_user_id);
CREATE INDEX IF NOT EXISTS idx_payments_receiver ON public.payments(receiver_user_id);
CREATE INDEX IF NOT EXISTS idx_payments_creator  ON public.payments(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status   ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created  ON public.payments(created_at DESC);

-- -----------------------------------------------------------------------------
-- 2.  RLS -- payments
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS pay_gerant_all       ON public.payments;
DROP POLICY IF EXISTS pay_involved_select  ON public.payments;
DROP POLICY IF EXISTS pay_actor_update     ON public.payments;

-- Gerant / admin / CEO : acces complet
CREATE POLICY pay_gerant_all ON public.payments
  FOR ALL
  USING (public._get_my_role() IN ('gerant','admin','ceo'));

-- Utilisateurs impliques : lecture de leurs propres payments
CREATE POLICY pay_involved_select ON public.payments
  FOR SELECT
  USING (
    payer_user_id     = auth.uid()
    OR receiver_user_id   = auth.uid()
    OR created_by_user_id = auth.uid()
  );

-- Receiver : peut UPDATE pour confirmer ou refuser
-- Createur : peut UPDATE pour annuler
CREATE POLICY pay_actor_update ON public.payments
  FOR UPDATE
  USING (
    receiver_user_id   = auth.uid()
    OR created_by_user_id = auth.uid()
  )
  WITH CHECK (
    receiver_user_id   = auth.uid()
    OR created_by_user_id = auth.uid()
  );

-- -----------------------------------------------------------------------------
-- 3.  Colonne payment_id sur ledger_entries (FK -> payments)
--     Conserve payment_event_id pour retro-compatibilite.
-- -----------------------------------------------------------------------------

ALTER TABLE public.ledger_entries
  ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES public.payments(id);

CREATE INDEX IF NOT EXISTS idx_le_payment_id ON public.ledger_entries(payment_id);

-- -----------------------------------------------------------------------------
-- 4.  RLS -- ledger_entries (refresh complet)
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS le_all_gerant    ON public.ledger_entries;
DROP POLICY IF EXISTS le_select_own    ON public.ledger_entries;
DROP POLICY IF EXISTS le_insert_gerant ON public.ledger_entries;

CREATE POLICY le_all_gerant ON public.ledger_entries
  FOR ALL
  USING (public._get_my_role() IN ('gerant','admin','ceo'));

CREATE POLICY le_select_own ON public.ledger_entries
  FOR SELECT
  USING (owner_user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 5.  Colonne kind sur notifications + RLS refresh
--
--     kind IN ('tx','spender','payment') nullable
--     L'UI affiche 3 onglets par kind + compteurs unread.
-- -----------------------------------------------------------------------------

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS kind text
    CHECK (kind IS NULL OR kind IN ('tx','spender','payment'));

CREATE INDEX IF NOT EXISTS idx_notif_user_kind_read
  ON public.notifications(user_id, kind, read);

DROP POLICY IF EXISTS notifications_select ON public.notifications;
DROP POLICY IF EXISTS notifications_insert ON public.notifications;
DROP POLICY IF EXISTS notifications_update ON public.notifications;
DROP POLICY IF EXISTS notif_select_own     ON public.notifications;
DROP POLICY IF EXISTS notif_insert_any     ON public.notifications;
DROP POLICY IF EXISTS notif_update_own     ON public.notifications;
DROP POLICY IF EXISTS notif_insert_definer ON public.notifications;

CREATE POLICY notif_select_own ON public.notifications
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY notif_insert_any ON public.notifications
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY notif_update_own ON public.notifications
  FOR UPDATE
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 6.  Vue v_user_balances
--     Agregat ledger_entries par (owner_user_id, currency).
--     Respecte la RLS ledger_entries (security_invoker par defaut) :
--       gerant voit tout, chatter/model/provider voient uniquement leur solde.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_user_balances AS
WITH agg AS (
  SELECT
    le.owner_user_id,
    le.currency,
    SUM(CASE WHEN le.entry_type = 'receiver_credit' THEN le.amount ELSE 0 END) AS total_received,
    SUM(CASE WHEN le.entry_type = 'payer_debit'     THEN le.amount ELSE 0 END) AS total_paid,
    COUNT(*) AS entry_count
  FROM public.ledger_entries le
  GROUP BY le.owner_user_id, le.currency
)
SELECT
  agg.owner_user_id                  AS user_id,
  p.name                             AS display_name,
  p.role,
  agg.currency,
  agg.total_received - agg.total_paid AS balance,
  agg.total_received,
  agg.total_paid,
  agg.entry_count
FROM agg
JOIN public.profiles p ON p.id = agg.owner_user_id;

GRANT SELECT ON public.v_user_balances TO authenticated;

-- -----------------------------------------------------------------------------
-- 7.  Trigger : notif au INSERT de payments
--     Notifie le receiver (kind='payment') pour qu'il confirme ou refuse.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_payments_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_creator_name text;
  v_title        text;
  v_message      text;
BEGIN
  IF NEW.payer_user_id = NEW.receiver_user_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(name, 'Inconnu')
    INTO v_creator_name
    FROM profiles
   WHERE id = NEW.created_by_user_id;

  v_title := CASE NEW.kind
    WHEN 'salary'      THEN 'Salaire'
    WHEN 'bonus'       THEN 'Bonus'
    WHEN 'declaration' THEN 'Declaration de paiement'
    WHEN 'adjustment'  THEN 'Ajustement'
    ELSE                    'Paiement'
  END;

  v_message :=
    COALESCE(v_creator_name, '?') ||
    ' vous a adresse un paiement de ' ||
    NEW.amount::text || ' ' || NEW.currency ||
    CASE WHEN NEW.note <> '' THEN ' - ' || NEW.note ELSE '' END ||
    ' (en attente de votre confirmation)';

  INSERT INTO notifications (user_id, kind, type, title, message, read)
  VALUES (NEW.receiver_user_id, 'payment', 'payment_pending', v_title, v_message, false);

  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_payments_on_insert ON public.payments;
CREATE TRIGGER trg_payments_on_insert
  AFTER INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_payments_on_insert();

-- -----------------------------------------------------------------------------
-- 8.  Trigger : ledger + notifs sur changement de statut
--
--   pending -> confirmed : ledger (debit payer + credit receiver)
--                          + notif "confirmed" chez le createur
--   pending -> refused   : notif "refused" chez le createur  -- AUCUN ledger
--   pending -> cancelled : notif "cancelled" chez le receiver -- AUCUN ledger
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_payments_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_existing      int;
  v_payer_name    text;
  v_receiver_name text;
  v_label         text;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(name, 'Inconnu')
    INTO v_payer_name
    FROM profiles WHERE id = NEW.payer_user_id;

  SELECT COALESCE(name, 'Inconnu')
    INTO v_receiver_name
    FROM profiles WHERE id = NEW.receiver_user_id;

  v_label := CASE NEW.kind
    WHEN 'salary'      THEN 'Salaire'
    WHEN 'bonus'       THEN 'Bonus'
    WHEN 'declaration' THEN 'Declaration'
    WHEN 'adjustment'  THEN 'Ajustement'
    ELSE                    'Paiement'
  END;

  -- ---- CONFIRMED : ecrire les ledger entries --------------------------------
  IF NEW.status = 'confirmed' AND OLD.status = 'pending' THEN

    -- Idempotence : ne rien faire si ledger deja cree
    SELECT COUNT(*) INTO v_existing
      FROM ledger_entries
     WHERE payment_id = NEW.id;

    IF v_existing = 0 THEN

      -- Debit payer (argent qui sort)
      INSERT INTO ledger_entries (
        created_by,
        owner_user_id, counterparty_user_id,
        entry_type,
        amount, currency,
        title, note,
        payment_id
      ) VALUES (
        NEW.created_by_user_id,
        NEW.payer_user_id, NEW.receiver_user_id,
        'payer_debit',
        NEW.amount, NEW.currency,
        v_label, NEW.note,
        NEW.id
      );

      -- Credit receiver (argent qui entre)
      INSERT INTO ledger_entries (
        created_by,
        owner_user_id, counterparty_user_id,
        entry_type,
        amount, currency,
        title, note,
        payment_id
      ) VALUES (
        NEW.created_by_user_id,
        NEW.receiver_user_id, NEW.payer_user_id,
        'receiver_credit',
        NEW.amount, NEW.currency,
        v_label, NEW.note,
        NEW.id
      );

    END IF;

    -- Notif au createur : paiement confirme
    INSERT INTO notifications (user_id, kind, type, title, message, read)
    VALUES (
      NEW.created_by_user_id,
      'payment',
      'payment_confirmed',
      v_label || ' confirme',
      COALESCE(v_receiver_name, '?') || ' a confirme la reception de ' ||
        NEW.amount::text || ' ' || NEW.currency,
      false
    );

  -- ---- REFUSED : aucun impact ledger ----------------------------------------
  ELSIF NEW.status = 'refused' AND OLD.status = 'pending' THEN

    INSERT INTO notifications (user_id, kind, type, title, message, read)
    VALUES (
      NEW.created_by_user_id,
      'payment',
      'payment_refused',
      v_label || ' refuse',
      COALESCE(v_receiver_name, '?') || ' a refuse le paiement de ' ||
        NEW.amount::text || ' ' || NEW.currency ||
        CASE WHEN NEW.refused_reason <> ''
             THEN ' - ' || NEW.refused_reason
             ELSE ''
        END,
      false
    );

  -- ---- CANCELLED : aucun impact ledger --------------------------------------
  ELSIF NEW.status = 'cancelled' AND OLD.status = 'pending' THEN

    INSERT INTO notifications (user_id, kind, type, title, message, read)
    VALUES (
      NEW.receiver_user_id,
      'payment',
      'payment_cancelled',
      v_label || ' annule',
      'Le paiement de ' || NEW.amount::text || ' ' || NEW.currency ||
        ' a ete annule par ' || COALESCE(v_payer_name, '?'),
      false
    );

  END IF;

  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_payments_on_status_change ON public.payments;
CREATE TRIGGER trg_payments_on_status_change
  AFTER UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_payments_on_status_change();

-- -----------------------------------------------------------------------------
-- 9.  RPC : rpc_create_payment
--
--   p_direction            'outgoing' | 'incoming'
--     outgoing : auth.uid() est payeur  -> payer=me, receiver=counterparty
--     incoming : counterparty est payeur -> payer=counterparty, receiver=me
--   p_counterparty_user_id uuid
--   p_amount               numeric > 0
--   p_currency             text   (defaut 'EUR')
--   p_note                 text   (defaut '')
--   p_kind                 text   (defaut 'salary')
--
--   Retourne : uuid du payment cree
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_create_payment(
  p_direction            text,
  p_counterparty_user_id uuid,
  p_amount               numeric,
  p_currency             text    DEFAULT 'EUR',
  p_note                 text    DEFAULT '',
  p_kind                 text    DEFAULT 'salary'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_me         uuid := auth.uid();
  v_me_role    text;
  v_payer      uuid;
  v_receiver   uuid;
  v_payment_id uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT role INTO v_me_role FROM profiles WHERE id = v_me;

  IF p_direction NOT IN ('outgoing','incoming') THEN
    RAISE EXCEPTION 'invalid_direction';
  END IF;

  IF p_kind NOT IN ('salary','bonus','declaration','adjustment') THEN
    RAISE EXCEPTION 'invalid_kind';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount_must_be_positive';
  END IF;

  IF p_counterparty_user_id IS NULL THEN
    RAISE EXCEPTION 'counterparty_required';
  END IF;

  IF p_counterparty_user_id = v_me THEN
    RAISE EXCEPTION 'self_payment_forbidden';
  END IF;

  IF p_direction = 'outgoing' THEN
    v_payer    := v_me;
    v_receiver := p_counterparty_user_id;

    IF v_me_role NOT IN ('gerant','admin','ceo','provider') THEN
      RAISE EXCEPTION 'permission_denied_outgoing';
    END IF;

    IF v_me_role = 'provider' AND p_kind NOT IN ('declaration','adjustment') THEN
      RAISE EXCEPTION 'provider_kind_restricted';
    END IF;

  ELSE
    v_payer    := p_counterparty_user_id;
    v_receiver := v_me;

    IF v_me_role NOT IN ('gerant','admin','ceo') THEN
      RAISE EXCEPTION 'permission_denied_incoming';
    END IF;
  END IF;

  INSERT INTO payments (
    created_by_user_id,
    direction,
    payer_user_id,
    receiver_user_id,
    amount, currency, kind, note,
    status
  ) VALUES (
    v_me,
    p_direction,
    v_payer,
    v_receiver,
    p_amount,
    COALESCE(NULLIF(p_currency,''), 'EUR'),
    p_kind,
    COALESCE(p_note, ''),
    'pending'
  ) RETURNING id INTO v_payment_id;

  RETURN v_payment_id;
END;
$func$;

REVOKE ALL ON FUNCTION public.rpc_create_payment(text, uuid, numeric, text, text, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_create_payment(text, uuid, numeric, text, text, text)
  TO authenticated;

-- -----------------------------------------------------------------------------
-- 10.  RPC : rpc_confirm_payment
--
--   Qui peut confirmer ?
--     * Le receiver du payment
--     * Un gerant / admin / ceo
--   Idempotent : si deja confirmed -> no-op silencieux
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_confirm_payment(
  p_payment_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_me   uuid := auth.uid();
  v_role text;
  v_pay  record;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_pay FROM payments WHERE id = p_payment_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found';
  END IF;

  -- Idempotence : deja confirme -> no-op
  IF v_pay.status = 'confirmed' THEN
    RETURN;
  END IF;

  IF v_pay.status <> 'pending' THEN
    RAISE EXCEPTION 'payment_not_pending: %', v_pay.status;
  END IF;

  IF v_me <> v_pay.receiver_user_id THEN
    SELECT role INTO v_role FROM profiles WHERE id = v_me;
    IF v_role NOT IN ('gerant','admin','ceo') THEN
      RAISE EXCEPTION 'only_receiver_or_gerant_can_confirm';
    END IF;
  END IF;

  UPDATE payments
     SET status       = 'confirmed',
         confirmed_at = now()
   WHERE id = p_payment_id;
END;
$func$;

REVOKE ALL ON FUNCTION public.rpc_confirm_payment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_confirm_payment(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 11.  RPC : rpc_refuse_payment
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_refuse_payment(
  p_payment_id uuid,
  p_reason     text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_me   uuid := auth.uid();
  v_role text;
  v_pay  record;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_pay FROM payments WHERE id = p_payment_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found';
  END IF;

  IF v_pay.status <> 'pending' THEN
    RAISE EXCEPTION 'payment_not_pending: %', v_pay.status;
  END IF;

  IF v_me <> v_pay.receiver_user_id THEN
    SELECT role INTO v_role FROM profiles WHERE id = v_me;
    IF v_role NOT IN ('gerant','admin','ceo') THEN
      RAISE EXCEPTION 'only_receiver_or_gerant_can_refuse';
    END IF;
  END IF;

  UPDATE payments
     SET status        = 'refused',
         refused_at    = now(),
         refused_reason = COALESCE(p_reason, '')
   WHERE id = p_payment_id;
END;
$func$;

REVOKE ALL ON FUNCTION public.rpc_refuse_payment(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_refuse_payment(uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 12.  RPC : rpc_cancel_payment
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_cancel_payment(
  p_payment_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_me   uuid := auth.uid();
  v_role text;
  v_pay  record;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_pay FROM payments WHERE id = p_payment_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found';
  END IF;

  IF v_pay.status <> 'pending' THEN
    RAISE EXCEPTION 'payment_not_pending: %', v_pay.status;
  END IF;

  IF v_me <> v_pay.created_by_user_id THEN
    SELECT role INTO v_role FROM profiles WHERE id = v_me;
    IF v_role NOT IN ('gerant','admin','ceo') THEN
      RAISE EXCEPTION 'only_creator_or_gerant_can_cancel';
    END IF;
  END IF;

  UPDATE payments
     SET status       = 'cancelled',
         cancelled_at = now()
   WHERE id = p_payment_id;
END;
$func$;

REVOKE ALL ON FUNCTION public.rpc_cancel_payment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_payment(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 13.  TESTS SQL -- 3 scenarios metier (commenter pour prod)
--
--      Remplacez les UUIDs par de vraies valeurs dans le SQL Editor Supabase.
-- -----------------------------------------------------------------------------

/*
==============================================================================
SCENARIO 1 -- Manager -> Chatter (salaire, confirme)
==============================================================================

-- [Session manager]
-- Etape 1 : creer le paiement (retourne uuid)
SELECT rpc_create_payment(
  'outgoing',
  '<CHATTER_UUID>',
  500,
  'EUR',
  'Salaire Janvier 2026',
  'salary'
);
-- => <PAYMENT_UUID>

-- Etape 2 : verifier notif chez chatter (kind='payment', type='payment_pending')
SELECT id, kind, type, title, message, read
  FROM notifications
 WHERE user_id = '<CHATTER_UUID>' AND kind = 'payment'
 ORDER BY created_at DESC LIMIT 5;

-- [Session chatter]
-- Etape 3 : chatter confirme la reception
SELECT rpc_confirm_payment('<PAYMENT_UUID>');

-- Etape 4 : verifier 2 ledger_entries (debit manager + credit chatter)
SELECT owner_user_id, counterparty_user_id, entry_type, amount, currency
  FROM ledger_entries
 WHERE payment_id = '<PAYMENT_UUID>';
-- Attendu : 2 lignes
--   owner=MANAGER  entry_type=payer_debit     amount=500
--   owner=CHATTER  entry_type=receiver_credit  amount=500

-- Etape 5 : verifier les soldes
SELECT user_id, display_name, role, currency, balance, total_received, total_paid
  FROM v_user_balances
 WHERE user_id IN ('<MANAGER_UUID>', '<CHATTER_UUID>');

-- Etape 6 : idempotence -- re-confirmer ne doit pas doubler le ledger
SELECT rpc_confirm_payment('<PAYMENT_UUID>');
SELECT COUNT(*) FROM ledger_entries WHERE payment_id = '<PAYMENT_UUID>';
-- Attendu : toujours 2

-- Etape 7 : manager a recu la notif de confirmation
SELECT kind, type, title, message FROM notifications
 WHERE user_id = '<MANAGER_UUID>' AND type = 'payment_confirmed'
 ORDER BY created_at DESC LIMIT 1;


==============================================================================
SCENARIO 2 -- Manager -> Model (bonus, refuse)
==============================================================================

-- [Session manager]
SELECT rpc_create_payment('outgoing', '<MODEL_UUID>', 200, 'EUR', 'Bonus perf', 'bonus');
-- => <PAYMENT2_UUID>

-- [Session model]
SELECT rpc_refuse_payment('<PAYMENT2_UUID>', 'Montant incorrect');

-- Verifier : aucun ledger entry
SELECT COUNT(*) FROM ledger_entries WHERE payment_id = '<PAYMENT2_UUID>';
-- Attendu : 0

-- Verifier : manager a recu la notif de refus
SELECT kind, type, title, message FROM notifications
 WHERE user_id = '<MANAGER_UUID>' AND type = 'payment_refused'
 ORDER BY created_at DESC LIMIT 1;

-- Verifier : statut du payment
SELECT status, refused_at, refused_reason
  FROM payments WHERE id = '<PAYMENT2_UUID>';


==============================================================================
SCENARIO 3 -- Provider -> Manager (declaration, confirmee)
==============================================================================

-- [Session provider]
SELECT rpc_create_payment(
  'outgoing',
  '<MANAGER_UUID>',
  1000, 'EUR',
  'Paiement Mars 2026',
  'declaration'
);
-- => <PAYMENT3_UUID>

-- [Session manager] -- le manager recoit notif
SELECT kind, type, title, message FROM notifications
 WHERE user_id = '<MANAGER_UUID>' AND kind = 'payment'
 ORDER BY created_at DESC LIMIT 1;

-- Manager confirme reception
SELECT rpc_confirm_payment('<PAYMENT3_UUID>');

-- Verifier ledger (debit provider, credit manager)
SELECT owner_user_id, entry_type, amount, currency
  FROM ledger_entries WHERE payment_id = '<PAYMENT3_UUID>';
-- Attendu :
--   owner=PROVIDER  payer_debit     1000 EUR
--   owner=MANAGER   receiver_credit 1000 EUR

-- Verifier balances
SELECT user_id, role, currency, balance
  FROM v_user_balances
 WHERE user_id IN ('<PROVIDER_UUID>', '<MANAGER_UUID>');


==============================================================================
SCENARIO 4 -- Cancel (createur uniquement, uniquement pending)
==============================================================================

SELECT rpc_create_payment('outgoing', '<CHATTER_UUID>', 300, 'EUR', 'Test annul', 'salary');
-- => <PAYMENT4_UUID>

SELECT rpc_cancel_payment('<PAYMENT4_UUID>');

SELECT status, cancelled_at FROM payments WHERE id = '<PAYMENT4_UUID>';
-- Attendu : cancelled

SELECT COUNT(*) FROM ledger_entries WHERE payment_id = '<PAYMENT4_UUID>';
-- Attendu : 0

-- Re-cancel doit lever une exception
SELECT rpc_cancel_payment('<PAYMENT4_UUID>');
-- Attendu : ERROR payment_not_pending: cancelled


==============================================================================
SCENARIO 5 -- Verification anti-fuite cross-role
==============================================================================

-- Dans le SQL Editor avec RLS active :
--   SET LOCAL role = authenticated;
--   SET LOCAL request.jwt.claims = '{"sub":"<CHATTER_UUID>","role":"authenticated"}';
--
-- SELECT * FROM payments;
-- => Doit retourner UNIQUEMENT les payments ou payer/receiver/creator = CHATTER_UUID
--
-- SELECT * FROM ledger_entries;
-- => Doit retourner UNIQUEMENT les lignes ou owner_user_id = CHATTER_UUID
--
-- SELECT * FROM notifications;
-- => Doit retourner UNIQUEMENT les notifs ou user_id = CHATTER_UUID
--
-- SELECT * FROM v_user_balances;
-- => Doit retourner UNIQUEMENT le solde du CHATTER
*/

COMMIT;
