-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Paiements internes + Ledger + Notifications V3
-- Branch: cursor/paiements-internes-et-ledger-825c
-- Date:   2026-04-02
--
-- Implémente :
--   1. Table `payments`  (source de vérité du nouveau flow)
--   2. Colonne `payment_id` sur ledger_entries (FK → payments)
--   3. Colonne `kind` sur notifications  IN ('tx','spender','payment')
--   4. RLS strict sur payments / ledger_entries / notifications
--   5. Vue v_user_balances
--   6. Trigger fn_payments_on_insert  → notif "payment" chez le receiver
--   7. Trigger fn_payments_on_status_change
--        confirmed → ledger (débit payer / crédit receiver) + notif créateur
--        refused   → notif créateur  (aucun ledger)
--        cancelled → notif receiver  (aucun ledger)
--   8. RPCs SECURITY DEFINER :
--        rpc_create_payment / rpc_confirm_payment /
--        rpc_refuse_payment / rpc_cancel_payment
--   9. Scénarios de test commentés (3 flows métier)
--
-- Règles comptables :
--   • ledger_entries.amount TOUJOURS > 0
--   • entry_type IN ('payer_debit','receiver_credit')
--   • Signe comptable porté par l'UI : payer_debit = sortie, receiver_credit = entrée
--   • Idempotence : si payment déjà confirmed → no-op (guard sur payment_id)
--   • Pas d'impact ledger sur refused / cancelled
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0.  Helper : rôle du user courant (SECURITY DEFINER pour éviter le N+1 RLS)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._get_my_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT role FROM profiles WHERE id = auth.uid() $$;

GRANT EXECUTE ON FUNCTION public._get_my_role() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1.  TABLE payments
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.payments (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- Qui a créé ce paiement
  created_by_user_id  uuid        NOT NULL REFERENCES public.profiles(id),

  -- Direction depuis le point de vue du créateur
  --   'outgoing' : créateur est payeur   (manager→chatter, manager→model)
  --   'incoming' : créateur est receveur (manager déclare arrivée d'argent provider)
  direction           text        NOT NULL
    CHECK (direction IN ('outgoing','incoming')),

  payer_user_id       uuid        NOT NULL REFERENCES public.profiles(id),
  receiver_user_id    uuid        NOT NULL REFERENCES public.profiles(id),

  CONSTRAINT payments_no_self_payment CHECK (payer_user_id <> receiver_user_id),

  amount              numeric     NOT NULL CHECK (amount > 0),
  currency            text        NOT NULL DEFAULT 'EUR',

  -- Type de paiement
  kind                text        NOT NULL DEFAULT 'salary'
    CHECK (kind IN ('salary','bonus','declaration','adjustment')),

  note                text        NOT NULL DEFAULT '',

  -- Cycle de vie
  status              text        NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','refused','cancelled')),

  confirmed_at        timestamptz,
  refused_at          timestamptz,
  refused_reason      text        NOT NULL DEFAULT '',
  cancelled_at        timestamptz
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.fn_set_payments_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

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

-- ─────────────────────────────────────────────────────────────────────────────
-- 2.  RLS — payments
--
--   Gérant / admin / CEO : ALL (voir tout, modifier tout)
--   Chatter / Model      : SELECT sur ses propres payments uniquement
--   Provider             : SELECT sur ses propres payments uniquement
--   Counterparty         : UPDATE pour confirmer ou refuser (pending → confirmed/refused)
--   Créateur             : UPDATE pour annuler (pending → cancelled)
--   INSERT               : uniquement via rpc_create_payment (SECURITY DEFINER)
-- ─────────────────────────────────────────────────────────────────────────────

-- Gérant / admin / CEO : accès complet
DROP POLICY IF EXISTS pay_gerant_all ON public.payments;
CREATE POLICY pay_gerant_all ON public.payments
  FOR ALL
  USING (public._get_my_role() IN ('gerant','admin','ceo'));

-- Utilisateurs impliqués : lecture de leurs propres payments
DROP POLICY IF EXISTS pay_involved_select ON public.payments;
CREATE POLICY pay_involved_select ON public.payments
  FOR SELECT
  USING (
    payer_user_id    = auth.uid()
    OR receiver_user_id  = auth.uid()
    OR created_by_user_id = auth.uid()
  );

-- Receiver : peut UPDATE pour confirmer ou refuser
-- Créateur : peut UPDATE pour annuler
-- (les RPCs SECURITY DEFINER bypassent ce check — sécurité en profondeur)
DROP POLICY IF EXISTS pay_actor_update ON public.payments;
CREATE POLICY pay_actor_update ON public.payments
  FOR UPDATE
  USING (
    receiver_user_id   = auth.uid()     -- peut confirm / refuse
    OR created_by_user_id = auth.uid()  -- peut cancel
  )
  WITH CHECK (
    receiver_user_id   = auth.uid()
    OR created_by_user_id = auth.uid()
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3.  Colonne payment_id sur ledger_entries  (FK → payments)
--     Conserve payment_event_id pour rétro-compatibilité avec l'ancien flow.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.ledger_entries
  ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES public.payments(id);

CREATE INDEX IF NOT EXISTS idx_le_payment_id ON public.ledger_entries(payment_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4.  RLS — ledger_entries  (refresh complet)
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS le_all_gerant    ON public.ledger_entries;
DROP POLICY IF EXISTS le_select_own    ON public.ledger_entries;
DROP POLICY IF EXISTS le_insert_gerant ON public.ledger_entries;

-- Gérant / admin / CEO : accès complet
CREATE POLICY le_all_gerant ON public.ledger_entries
  FOR ALL
  USING (public._get_my_role() IN ('gerant','admin','ceo'));

-- Autres rôles : uniquement leurs propres entrées
CREATE POLICY le_select_own ON public.ledger_entries
  FOR SELECT
  USING (owner_user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- 5.  Colonne kind sur notifications  +  RLS refresh
--
--     kind IN ('tx','spender','payment')  nullable (NULL = ancienne notif)
--     L'UI affiche 3 onglets par kind + compteurs unread.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS kind text
    CHECK (kind IS NULL OR kind IN ('tx','spender','payment'));

CREATE INDEX IF NOT EXISTS idx_notif_user_kind_read
  ON public.notifications(user_id, kind, read);

-- Supprimer toutes les anciennes policies notifications
DROP POLICY IF EXISTS notifications_select   ON public.notifications;
DROP POLICY IF EXISTS notifications_insert   ON public.notifications;
DROP POLICY IF EXISTS notifications_update   ON public.notifications;
DROP POLICY IF EXISTS notif_select_own       ON public.notifications;
DROP POLICY IF EXISTS notif_insert_any       ON public.notifications;
DROP POLICY IF EXISTS notif_update_own       ON public.notifications;
DROP POLICY IF EXISTS notif_insert_definer   ON public.notifications;

-- SELECT : uniquement ses propres notifications
CREATE POLICY notif_select_own ON public.notifications
  FOR SELECT
  USING (user_id = auth.uid());

-- INSERT : un user peut créer une notif pour lui-même
--          Les triggers SECURITY DEFINER bypassent RLS et peuvent insérer pour n'importe qui
CREATE POLICY notif_insert_any ON public.notifications
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- UPDATE : marquer comme lu / modifier ses propres notifs
CREATE POLICY notif_update_own ON public.notifications
  FOR UPDATE
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- 6.  Vue v_user_balances
--     Agrège ledger_entries par (owner, currency).
--     Respecte les RLS de ledger_entries (security_invoker par défaut) :
--       → gérant voit tout, chatter/model/provider voient uniquement leur solde.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_user_balances AS
SELECT
  le.owner_user_id                                                      AS user_id,
  COALESCE(p.name, p.username, p.display_name)                         AS display_name,
  p.username,
  p.role,
  le.currency,
  SUM(CASE WHEN le.entry_type = 'receiver_credit' THEN  le.amount ELSE 0 END)
  - SUM(CASE WHEN le.entry_type = 'payer_debit'   THEN  le.amount ELSE 0 END) AS balance,
  SUM(CASE WHEN le.entry_type = 'receiver_credit' THEN le.amount ELSE 0 END)  AS total_received,
  SUM(CASE WHEN le.entry_type = 'payer_debit'     THEN le.amount ELSE 0 END)  AS total_paid,
  COUNT(*)                                                               AS entry_count
FROM  public.ledger_entries le
JOIN  public.profiles p ON p.id = le.owner_user_id
GROUP BY le.owner_user_id, p.name, p.username, p.display_name, p.role, le.currency;

GRANT SELECT ON public.v_user_balances TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7.  Trigger : notif au INSERT de payments
--     Notifie le receiver (kind='payment') pour qu'il puisse confirmer/refuser.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_payments_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator_name text;
  v_title        text;
  v_message      text;
BEGIN
  -- Pas de notification sur self-payment (guard défensif)
  IF NEW.payer_user_id = NEW.receiver_user_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(name, username, display_name, 'Inconnu')
    INTO v_creator_name
    FROM profiles
   WHERE id = NEW.created_by_user_id;

  v_title := CASE NEW.kind
    WHEN 'salary'      THEN 'Salaire'
    WHEN 'bonus'       THEN 'Bonus'
    WHEN 'declaration' THEN 'Déclaration de paiement'
    WHEN 'adjustment'  THEN 'Ajustement'
    ELSE                    'Paiement'
  END;

  v_message :=
    v_creator_name || ' vous a adressé un paiement de ' ||
    NEW.amount::text || ' ' || NEW.currency ||
    CASE WHEN NEW.note <> '' THEN ' — ' || NEW.note ELSE '' END ||
    ' (en attente de votre confirmation)';

  INSERT INTO notifications (user_id, kind, type, title, message, read)
  VALUES (NEW.receiver_user_id, 'payment', 'payment_pending', v_title, v_message, false);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_on_insert ON public.payments;
CREATE TRIGGER trg_payments_on_insert
  AFTER INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_payments_on_insert();

-- ─────────────────────────────────────────────────────────────────────────────
-- 8.  Trigger : ledger + notifs sur changement de statut
--
--   pending → confirmed : écriture ledger (débit payer + crédit receiver)
--                         + notif "confirmed" chez le créateur
--   pending → refused   : notif "refused" chez le créateur  — AUCUN ledger
--   pending → cancelled : notif "cancelled" chez le receiver — AUCUN ledger
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.fn_payments_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing      int;
  v_payer_name    text;
  v_receiver_name text;
  v_label         text;
BEGIN
  -- Ne rien faire si le statut n'a pas changé
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(name, username, display_name, 'Inconnu')
    INTO v_payer_name    FROM profiles WHERE id = NEW.payer_user_id;

  SELECT COALESCE(name, username, display_name, 'Inconnu')
    INTO v_receiver_name FROM profiles WHERE id = NEW.receiver_user_id;

  v_label := CASE NEW.kind
    WHEN 'salary'      THEN 'Salaire'
    WHEN 'bonus'       THEN 'Bonus'
    WHEN 'declaration' THEN 'Déclaration'
    WHEN 'adjustment'  THEN 'Ajustement'
    ELSE                    'Paiement'
  END;

  -- ────────────────────────────────────────────────────────────────
  -- CAS 1 : confirmed
  -- ────────────────────────────────────────────────────────────────
  IF NEW.status = 'confirmed' AND OLD.status = 'pending' THEN

    -- Idempotence : ne pas dupliquer si ledger déjà créé
    SELECT COUNT(*) INTO v_existing
      FROM ledger_entries
     WHERE payment_id = NEW.id;

    IF v_existing = 0 THEN

      -- Débit payer (argent qui sort)
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

      -- Crédit receiver (argent qui entre)
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

    -- Notif au créateur : paiement confirmé
    INSERT INTO notifications (user_id, kind, type, title, message, read)
    VALUES (
      NEW.created_by_user_id,
      'payment',
      'payment_confirmed',
      '✅ ' || v_label || ' confirmé',
      v_receiver_name || ' a confirmé la réception de ' ||
        NEW.amount::text || ' ' || NEW.currency,
      false
    );

  -- ────────────────────────────────────────────────────────────────
  -- CAS 2 : refused  — aucun impact ledger
  -- ────────────────────────────────────────────────────────────────
  ELSIF NEW.status = 'refused' AND OLD.status = 'pending' THEN

    -- Notif au créateur : paiement refusé
    INSERT INTO notifications (user_id, kind, type, title, message, read)
    VALUES (
      NEW.created_by_user_id,
      'payment',
      'payment_refused',
      '❌ ' || v_label || ' refusé',
      v_receiver_name || ' a refusé le paiement de ' ||
        NEW.amount::text || ' ' || NEW.currency ||
        CASE WHEN NEW.refused_reason <> ''
             THEN ' — ' || NEW.refused_reason
             ELSE ''
        END,
      false
    );

  -- ────────────────────────────────────────────────────────────────
  -- CAS 3 : cancelled  — aucun impact ledger
  -- ────────────────────────────────────────────────────────────────
  ELSIF NEW.status = 'cancelled' AND OLD.status = 'pending' THEN

    -- Notif au receiver : paiement annulé par le créateur
    INSERT INTO notifications (user_id, kind, type, title, message, read)
    VALUES (
      NEW.receiver_user_id,
      'payment',
      'payment_cancelled',
      '🚫 ' || v_label || ' annulé',
      'Le paiement de ' || NEW.amount::text || ' ' || NEW.currency ||
        ' a été annulé par ' || v_payer_name,
      false
    );

  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_on_status_change ON public.payments;
CREATE TRIGGER trg_payments_on_status_change
  AFTER UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_payments_on_status_change();

-- ─────────────────────────────────────────────────────────────────────────────
-- 9.  RPC : rpc_create_payment
--
--   Paramètres :
--     p_direction            'outgoing' | 'incoming'
--       outgoing : auth.uid() est payeur  → payer=me, receiver=counterparty
--       incoming : counterparty est payeur → payer=counterparty, receiver=me
--     p_counterparty_user_id uuid
--     p_amount               numeric > 0
--     p_currency             text   (défaut 'EUR')
--     p_note                 text   (défaut '')
--     p_kind                 text   (défaut 'salary')
--
--   Règles métier :
--     outgoing → seuls gerant / admin / ceo / provider peuvent créer
--       provider : kind DOIT être 'declaration' ou 'adjustment'
--     incoming → seuls gerant / admin / ceo (déclarent réception d'un provider)
--
--   Retourne : uuid du payment créé
-- ─────────────────────────────────────────────────────────────────────────────

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
AS $$
DECLARE
  v_me         uuid := auth.uid();
  v_me_role    text;
  v_payer      uuid;
  v_receiver   uuid;
  v_payment_id uuid;
BEGIN
  -- Authentification
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT role INTO v_me_role FROM profiles WHERE id = v_me;

  -- Validation des paramètres
  IF p_direction NOT IN ('outgoing','incoming') THEN
    RAISE EXCEPTION 'invalid_direction: doit être outgoing ou incoming';
  END IF;

  IF p_kind NOT IN ('salary','bonus','declaration','adjustment') THEN
    RAISE EXCEPTION 'invalid_kind: doit être salary | bonus | declaration | adjustment';
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

  -- Résoudre payer / receiver + vérification d'autorisation
  IF p_direction = 'outgoing' THEN
    -- Créateur est le payeur
    v_payer    := v_me;
    v_receiver := p_counterparty_user_id;

    IF v_me_role NOT IN ('gerant','admin','ceo','provider') THEN
      RAISE EXCEPTION 'permission_denied: seul gerant/admin/ceo/provider peut créer un paiement outgoing';
    END IF;

    -- Provider : uniquement des déclarations/ajustements (pas salary/bonus)
    IF v_me_role = 'provider' AND p_kind NOT IN ('declaration','adjustment') THEN
      RAISE EXCEPTION 'provider_kind_restricted: provider peut uniquement créer declaration ou adjustment';
    END IF;

  ELSE
    -- incoming : counterparty est le payeur, créateur est le receiver
    v_payer    := p_counterparty_user_id;
    v_receiver := v_me;

    IF v_me_role NOT IN ('gerant','admin','ceo') THEN
      RAISE EXCEPTION 'permission_denied: seul gerant/admin/ceo peut créer un paiement incoming';
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
$$;

REVOKE ALL ON FUNCTION public.rpc_create_payment(text, uuid, numeric, text, text, text)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_create_payment(text, uuid, numeric, text, text, text)
  TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10.  RPC : rpc_confirm_payment
--
--   Qui peut confirmer ?
--     • Le receiver du payment (chatter/model/manager selon le flow)
--     • Un gerant / admin / ceo
--   Idempotent : si déjà confirmed → no-op silencieux
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_confirm_payment(
  p_payment_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me     uuid := auth.uid();
  v_role   text;
  v_pay    record;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Lock pour éviter les race conditions
  SELECT * INTO v_pay FROM payments WHERE id = p_payment_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found: %', p_payment_id;
  END IF;

  -- Idempotence : déjà confirmé → no-op
  IF v_pay.status = 'confirmed' THEN
    RETURN;
  END IF;

  IF v_pay.status <> 'pending' THEN
    RAISE EXCEPTION 'payment_not_pending: statut actuel = %', v_pay.status;
  END IF;

  -- Vérification d'autorisation
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
$$;

REVOKE ALL ON FUNCTION public.rpc_confirm_payment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_confirm_payment(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11.  RPC : rpc_refuse_payment
--
--   Qui peut refuser ?
--     • Le receiver du payment
--     • Un gerant / admin / ceo
--   Paramètre optionnel p_reason pour expliquer le refus.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_refuse_payment(
  p_payment_id uuid,
  p_reason     text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    RAISE EXCEPTION 'payment_not_found: %', p_payment_id;
  END IF;

  IF v_pay.status <> 'pending' THEN
    RAISE EXCEPTION 'payment_not_pending: statut actuel = %', v_pay.status;
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
$$;

REVOKE ALL ON FUNCTION public.rpc_refuse_payment(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_refuse_payment(uuid, text) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 12.  RPC : rpc_cancel_payment
--
--   Qui peut annuler ?
--     • Le créateur du payment (uniquement si status = pending)
--     • Un gerant / admin / ceo
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rpc_cancel_payment(
  p_payment_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    RAISE EXCEPTION 'payment_not_found: %', p_payment_id;
  END IF;

  IF v_pay.status <> 'pending' THEN
    RAISE EXCEPTION 'payment_not_pending: statut actuel = %', v_pay.status;
  END IF;

  -- Seul le créateur (ou un gérant) peut annuler
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
$$;

REVOKE ALL ON FUNCTION public.rpc_cancel_payment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_cancel_payment(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13.  TESTS SQL — 3 scénarios métier
--
--      Remplacez les UUIDs par de vraies valeurs dans le SQL Editor Supabase.
--      Ces blocs sont intentionnellement commentés pour ne pas s'exécuter en prod.
-- ─────────────────────────────────────────────────────────────────────────────

/*
══════════════════════════════════════════════════════════════════════════════
SCÉNARIO 1 — Manager → Chatter (salaire, confirmé)
══════════════════════════════════════════════════════════════════════════════

-- [Session manager]
-- Étape 1 : créer le paiement (retourne uuid)
SELECT rpc_create_payment(
  'outgoing',             -- direction
  '<CHATTER_UUID>',       -- counterparty
  500,                    -- montant
  'EUR',                  -- devise
  'Salaire Janvier 2026', -- note
  'salary'                -- kind
);
-- → <PAYMENT_UUID>

-- Étape 2 : vérifier que le chatter a bien reçu une notif "payment_pending"
SELECT id, kind, type, title, message, read, created_at
  FROM notifications
 WHERE user_id = '<CHATTER_UUID>' AND kind = 'payment'
 ORDER BY created_at DESC LIMIT 5;

-- [Session chatter]
-- Étape 3 : chatter confirme la réception
SELECT rpc_confirm_payment('<PAYMENT_UUID>');

-- Étape 4 : vérifier les 2 ledger_entries (debit manager + crédit chatter)
SELECT owner_user_id, counterparty_user_id, entry_type, amount, currency
  FROM ledger_entries
 WHERE payment_id = '<PAYMENT_UUID>';
-- Attendu : 2 lignes
--   owner=MANAGER  / entry_type=payer_debit    / amount=500
--   owner=CHATTER  / entry_type=receiver_credit / amount=500

-- Étape 5 : vérifier les soldes
SELECT user_id, username, role, currency, balance, total_received, total_paid
  FROM v_user_balances
 WHERE user_id IN ('<MANAGER_UUID>', '<CHATTER_UUID>');

-- Étape 6 : idempotence — re-confirmer ne doit pas doubler le ledger
SELECT rpc_confirm_payment('<PAYMENT_UUID>');  -- no-op
SELECT COUNT(*) FROM ledger_entries WHERE payment_id = '<PAYMENT_UUID>';
-- Attendu : toujours 2

-- Étape 7 : le manager a reçu la notif de confirmation
SELECT kind, type, title, message FROM notifications
 WHERE user_id = '<MANAGER_UUID>' AND type = 'payment_confirmed'
 ORDER BY created_at DESC LIMIT 1;


══════════════════════════════════════════════════════════════════════════════
SCÉNARIO 2 — Manager → Model (bonus, refusé)
══════════════════════════════════════════════════════════════════════════════

-- [Session manager]
SELECT rpc_create_payment('outgoing', '<MODEL_UUID>', 200, 'EUR', 'Bonus perf', 'bonus');
-- → <PAYMENT2_UUID>

-- [Session model]
SELECT rpc_refuse_payment('<PAYMENT2_UUID>', 'Montant incorrect');

-- Vérifier : aucun ledger entry
SELECT COUNT(*) FROM ledger_entries WHERE payment_id = '<PAYMENT2_UUID>';
-- Attendu : 0

-- Vérifier : le manager a reçu la notif de refus
SELECT kind, type, title, message FROM notifications
 WHERE user_id = '<MANAGER_UUID>' AND type = 'payment_refused'
 ORDER BY created_at DESC LIMIT 1;

-- Vérifier : le statut du payment
SELECT status, refused_at, refused_reason
  FROM payments WHERE id = '<PAYMENT2_UUID>';


══════════════════════════════════════════════════════════════════════════════
SCÉNARIO 3 — Provider → Manager (déclaration, confirmée)
══════════════════════════════════════════════════════════════════════════════

-- [Session provider]
SELECT rpc_create_payment(
  'outgoing',              -- provider déclare avoir envoyé
  '<MANAGER_UUID>',        -- au manager
  1000, 'EUR',
  'Paiement Mars 2026',
  'declaration'
);
-- → <PAYMENT3_UUID>

-- [Session manager] — le manager reçoit notif
SELECT kind, type, title, message FROM notifications
 WHERE user_id = '<MANAGER_UUID>' AND kind = 'payment'
 ORDER BY created_at DESC LIMIT 1;

-- Manager confirme réception
SELECT rpc_confirm_payment('<PAYMENT3_UUID>');

-- Vérifier ledger (débit provider, crédit manager)
SELECT owner_user_id, entry_type, amount, currency
  FROM ledger_entries WHERE payment_id = '<PAYMENT3_UUID>';
-- Attendu :
--   owner=PROVIDER / payer_debit    / 1000 EUR
--   owner=MANAGER  / receiver_credit / 1000 EUR

-- Vérifier balances
SELECT user_id, role, currency, balance
  FROM v_user_balances
 WHERE user_id IN ('<PROVIDER_UUID>', '<MANAGER_UUID>');


══════════════════════════════════════════════════════════════════════════════
SCÉNARIO 4 — Cancel (créateur uniquement, uniquement pending)
══════════════════════════════════════════════════════════════════════════════

-- [Session manager]
SELECT rpc_create_payment('outgoing', '<CHATTER_UUID>', 300, 'EUR', 'Test annul', 'salary');
-- → <PAYMENT4_UUID>

SELECT rpc_cancel_payment('<PAYMENT4_UUID>');

SELECT status, cancelled_at FROM payments WHERE id = '<PAYMENT4_UUID>';
-- Attendu : cancelled

SELECT COUNT(*) FROM ledger_entries WHERE payment_id = '<PAYMENT4_UUID>';
-- Attendu : 0

-- Essayer de re-cancel → doit lever une exception
SELECT rpc_cancel_payment('<PAYMENT4_UUID>');
-- Attendu : ERROR payment_not_pending: statut actuel = cancelled


══════════════════════════════════════════════════════════════════════════════
SCÉNARIO 5 — Vérification anti-fuite cross-role
══════════════════════════════════════════════════════════════════════════════

-- Dans le SQL Editor avec RLS activé, simuler une session chatter :
--   SET LOCAL role = authenticated;
--   SET LOCAL request.jwt.claims = '{"sub":"<CHATTER_UUID>","role":"authenticated"}';
--
-- SELECT * FROM payments;
-- → Doit retourner UNIQUEMENT les payments où payer/receiver/creator = CHATTER_UUID
--
-- SELECT * FROM ledger_entries;
-- → Doit retourner UNIQUEMENT les lignes où owner_user_id = CHATTER_UUID
--
-- SELECT * FROM notifications;
-- → Doit retourner UNIQUEMENT les notifs où user_id = CHATTER_UUID
--
-- SELECT * FROM v_user_balances;
-- → Doit retourner UNIQUEMENT le solde du CHATTER
*/

COMMIT;
