-- =============================================================================
-- MIGRATION: payment_events full flow
-- Date: 2026-04-04
-- Branch: cursor/paiements-internes-et-ledger-825c
--
-- Implements:
--   A. Gerant sends salary/bonus to chatter/model (status=pending -> confirmed)
--   B. Provider declares deposit to gerant      (status=pending -> confirmed)
--   C. On confirmed: debit from_user, credit to_user in ledger_entries (idempotent)
--   D. On rejected/cancelled: notify emitter, no ledger impact
--   E. RLS: each role sees only their own payment_events
--   F. RPCs: rpc_create_payment_event / rpc_confirm_payment_event /
--            rpc_reject_payment_event  / rpc_cancel_payment_event /
--            rpc_my_payment_kpis
--
-- Idempotency:
--   * All CREATE TABLE / ADD COLUMN / CREATE INDEX use IF NOT EXISTS
--   * Ledger guard: COUNT(*) WHERE payment_event_id = NEW.id before insert
--   * Confirm RPC: returns early if already confirmed
--   * Trigger fires only on pending -> confirmed/rejected/cancelled transition
--
-- Backward compat:
--   * Keeps existing 'paid' and 'validated' statuses triggering ledger
--   * Keeps payment_event_id FK on ledger_entries (v_user_balances still works)
--   * Replaces old fn_payment_event_paid triggers with the new pair
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- 0.  Helper: _get_my_role  (safe re-create)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._get_my_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT role FROM profiles WHERE id = auth.uid() $$;

GRANT EXECUTE ON FUNCTION public._get_my_role() TO authenticated;

-- -----------------------------------------------------------------------------
-- 1.  TABLE payment_events  (create if absent, add columns if missing)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payment_events (
  id           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid        REFERENCES public.profiles(id),
  from_user_id uuid        NOT NULL REFERENCES public.profiles(id),
  to_user_id   uuid        NOT NULL REFERENCES public.profiles(id),
  amount       numeric     NOT NULL CHECK (amount > 0),
  currency     text        NOT NULL DEFAULT 'EUR',
  kind         text        NOT NULL DEFAULT 'salary',
  title        text,
  note         text        NOT NULL DEFAULT '',
  status       text        NOT NULL DEFAULT 'pending'
);

-- Extra columns (idempotent)
ALTER TABLE public.payment_events
  ADD COLUMN IF NOT EXISTS confirmed_at    timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_at     timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_reason text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS cancelled_at    timestamptz;

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pe_from_user   ON public.payment_events(from_user_id);
CREATE INDEX IF NOT EXISTS idx_pe_to_user     ON public.payment_events(to_user_id);
CREATE INDEX IF NOT EXISTS idx_pe_created_by  ON public.payment_events(created_by);
CREATE INDEX IF NOT EXISTS idx_pe_status      ON public.payment_events(status);
CREATE INDEX IF NOT EXISTS idx_pe_created_at  ON public.payment_events(created_at DESC);

-- -----------------------------------------------------------------------------
-- 2.  TABLE ledger_entries  (create if absent)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id                   uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at           timestamptz NOT NULL DEFAULT now(),
  created_by           uuid        REFERENCES public.profiles(id),
  owner_user_id        uuid        NOT NULL REFERENCES public.profiles(id),
  counterparty_user_id uuid        REFERENCES public.profiles(id),
  entry_type           text        NOT NULL,
  amount               numeric     NOT NULL CHECK (amount > 0),
  currency             text        NOT NULL DEFAULT 'EUR',
  title                text,
  note                 text        NOT NULL DEFAULT '',
  payment_event_id     uuid        REFERENCES public.payment_events(id),
  payment_id           uuid        -- FK to payments table if used
);

ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_le_owner          ON public.ledger_entries(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_le_payment_event  ON public.ledger_entries(payment_event_id);
CREATE INDEX IF NOT EXISTS idx_le_created_at     ON public.ledger_entries(created_at DESC);

-- -----------------------------------------------------------------------------
-- 3.  RLS: payment_events
-- -----------------------------------------------------------------------------

DROP POLICY IF EXISTS pe_all_gerant       ON public.payment_events;
DROP POLICY IF EXISTS pe_select_involved  ON public.payment_events;
DROP POLICY IF EXISTS pe_insert_receiver  ON public.payment_events;
DROP POLICY IF EXISTS pe_confirm_receiver ON public.payment_events;
DROP POLICY IF EXISTS pe_update_gerant    ON public.payment_events;
DROP POLICY IF EXISTS pe_insert_own       ON public.payment_events;
DROP POLICY IF EXISTS pe_actor_update     ON public.payment_events;

-- Gerant / admin / CEO: full access
CREATE POLICY pe_all_gerant ON public.payment_events
  FOR ALL
  USING (public._get_my_role() IN ('gerant','admin','ceo'));

-- Provider / chatter / model: see only where involved
CREATE POLICY pe_select_involved ON public.payment_events
  FOR SELECT
  USING (
    from_user_id = auth.uid()
    OR to_user_id = auth.uid()
    OR created_by = auth.uid()
  );

-- Receiver (to_user_id) or creator can UPDATE (confirm / reject / cancel)
-- RPCs use SECURITY DEFINER so this is defense-in-depth only
CREATE POLICY pe_actor_update ON public.payment_events
  FOR UPDATE
  USING (
    to_user_id   = auth.uid()
    OR from_user_id  = auth.uid()
    OR created_by    = auth.uid()
  )
  WITH CHECK (
    to_user_id   = auth.uid()
    OR from_user_id  = auth.uid()
    OR created_by    = auth.uid()
  );

-- -----------------------------------------------------------------------------
-- 4.  RLS: ledger_entries
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
-- 5.  Drop old payment_event triggers (replaced below)
-- -----------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_payment_event_paid        ON public.payment_events;
DROP TRIGGER IF EXISTS trg_payment_event_paid_insert ON public.payment_events;
DROP TRIGGER IF EXISTS trg_pe_on_insert              ON public.payment_events;
DROP TRIGGER IF EXISTS trg_pe_on_status_change       ON public.payment_events;

-- -----------------------------------------------------------------------------
-- 6.  Trigger: notify receiver on INSERT (status = 'pending')
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_pe_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from_name text;
  v_title     text;
  v_message   text;
BEGIN
  -- Only fire for pending inserts with distinct parties
  IF NEW.status != 'pending' OR NEW.from_user_id = NEW.to_user_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(name, username, 'Inconnu')
    INTO v_from_name
    FROM profiles WHERE id = NEW.from_user_id;

  v_title := CASE NEW.kind
    WHEN 'salary'           THEN 'Salaire'
    WHEN 'bonus'            THEN 'Bonus'
    WHEN 'adjustment'       THEN 'Ajustement'
    WHEN 'provider_deposit' THEN 'Depot provider'
    WHEN 'provider_payment' THEN 'Paiement provider'
    WHEN 'declaration'      THEN 'Declaration de paiement'
    ELSE COALESCE(NEW.title, NEW.kind, 'Paiement')
  END;

  v_message :=
    COALESCE(v_from_name, '?') ||
    ' vous a adresse un paiement de ' ||
    NEW.amount::text || ' ' || NEW.currency ||
    CASE WHEN NEW.note != '' THEN ' - ' || NEW.note ELSE '' END ||
    '. Confirmez la reception.';

  INSERT INTO notifications (user_id, kind, type, title, message, read, is_read)
  VALUES (NEW.to_user_id, 'payment', 'payment_pending', v_title, v_message, false, false);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pe_on_insert
  AFTER INSERT ON public.payment_events
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_pe_on_insert();

-- -----------------------------------------------------------------------------
-- 7.  Trigger: ledger + notifications on status transition
--
--   pending -> confirmed / paid / validated :
--     * debit from_user + credit to_user in ledger_entries (idempotent)
--     * notify from_user (creator)
--
--   pending -> rejected / cancelled :
--     * NO ledger impact
--     * notify from_user (creator)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_pe_on_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing  int;
  v_from_name text;
  v_to_name   text;
  v_label     text;
  v_creator   uuid;
BEGIN
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(name, username, 'Inconnu')
    INTO v_from_name FROM profiles WHERE id = NEW.from_user_id;
  SELECT COALESCE(name, username, 'Inconnu')
    INTO v_to_name   FROM profiles WHERE id = NEW.to_user_id;

  v_label := CASE NEW.kind
    WHEN 'salary'           THEN 'Salaire'
    WHEN 'bonus'            THEN 'Bonus'
    WHEN 'adjustment'       THEN 'Ajustement'
    WHEN 'provider_deposit' THEN 'Depot provider'
    WHEN 'provider_payment' THEN 'Paiement provider'
    WHEN 'declaration'      THEN 'Declaration'
    ELSE COALESCE(NEW.title, NEW.kind, 'Paiement')
  END;

  v_creator := COALESCE(NEW.created_by, NEW.from_user_id);

  -- ---- CONFIRMED / PAID / VALIDATED: write ledger --------------------------
  IF NEW.status IN ('confirmed','paid','validated')
     AND OLD.status NOT IN ('confirmed','paid','validated') THEN

    -- Idempotency guard: skip if ledger already written for this event
    SELECT COUNT(*) INTO v_existing
      FROM ledger_entries WHERE payment_event_id = NEW.id;

    IF v_existing = 0 THEN
      -- Debit payer
      INSERT INTO ledger_entries (
        created_by, owner_user_id, counterparty_user_id,
        entry_type, amount, currency, title, note, payment_event_id
      ) VALUES (
        v_creator, NEW.from_user_id, NEW.to_user_id,
        'payer_debit',
        NEW.amount, NEW.currency, v_label, NEW.note, NEW.id
      );

      -- Credit receiver
      INSERT INTO ledger_entries (
        created_by, owner_user_id, counterparty_user_id,
        entry_type, amount, currency, title, note, payment_event_id
      ) VALUES (
        v_creator, NEW.to_user_id, NEW.from_user_id,
        'receiver_credit',
        NEW.amount, NEW.currency, v_label, NEW.note, NEW.id
      );
    END IF;

    -- Notify creator that receiver confirmed
    IF v_creator != NEW.to_user_id THEN
      INSERT INTO notifications (user_id, kind, type, title, message, read, is_read)
      VALUES (
        v_creator, 'payment', 'payment_confirmed',
        v_label || ' confirme',
        COALESCE(v_to_name, '?') || ' a confirme la reception de ' ||
          NEW.amount::text || ' ' || NEW.currency,
        false, false
      );
    END IF;

  -- ---- REJECTED / CANCELLED: notify only -----------------------------------
  ELSIF NEW.status IN ('rejected','cancelled') AND OLD.status = 'pending' THEN

    IF v_creator != NEW.to_user_id THEN
      INSERT INTO notifications (user_id, kind, type, title, message, read, is_read)
      VALUES (
        v_creator,
        'payment',
        CASE NEW.status WHEN 'rejected' THEN 'payment_rejected' ELSE 'payment_cancelled' END,
        v_label || CASE NEW.status WHEN 'rejected' THEN ' refuse' ELSE ' annule' END,
        CASE NEW.status
          WHEN 'rejected' THEN
            COALESCE(v_to_name, '?') || ' a refuse le paiement de ' ||
            NEW.amount::text || ' ' || NEW.currency ||
            CASE WHEN NEW.rejected_reason != ''
                 THEN ' - ' || NEW.rejected_reason ELSE '' END
          ELSE
            'Paiement de ' || NEW.amount::text || ' ' || NEW.currency || ' annule'
        END,
        false, false
      );
    END IF;

  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pe_on_status_change
  AFTER UPDATE ON public.payment_events
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_pe_on_status_change();

-- -----------------------------------------------------------------------------
-- 8.  RPC: rpc_create_payment_event
--
--   Gerant/admin/ceo: all kinds
--   Provider: only provider_deposit / provider_payment / declaration
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_create_payment_event(
  p_to_user_id uuid,
  p_amount     numeric,
  p_currency   text    DEFAULT 'EUR',
  p_kind       text    DEFAULT 'salary',
  p_note       text    DEFAULT ''
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me   uuid := auth.uid();
  v_role text;
  v_id   uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'amount_must_be_positive';
  END IF;
  IF p_to_user_id IS NULL THEN
    RAISE EXCEPTION 'to_user_required';
  END IF;
  IF p_to_user_id = v_me THEN
    RAISE EXCEPTION 'self_payment_forbidden';
  END IF;

  SELECT role INTO v_role FROM profiles WHERE id = v_me;

  IF v_role IN ('gerant','admin','ceo') THEN
    -- Any valid kind
    IF p_kind NOT IN ('salary','bonus','adjustment','provider_deposit','provider_payment','declaration') THEN
      RAISE EXCEPTION 'invalid_kind';
    END IF;
  ELSIF v_role = 'provider' THEN
    -- Providers may only declare
    IF p_kind NOT IN ('provider_deposit','provider_payment','declaration') THEN
      RAISE EXCEPTION 'provider_restricted_to_declaration_kinds';
    END IF;
  ELSE
    RAISE EXCEPTION 'permission_denied: role % cannot create payment events', v_role;
  END IF;

  INSERT INTO payment_events (
    created_by, from_user_id, to_user_id,
    amount, currency, kind, note, status
  ) VALUES (
    v_me, v_me, p_to_user_id,
    p_amount,
    COALESCE(NULLIF(p_currency, ''), 'EUR'),
    p_kind,
    COALESCE(p_note, ''),
    'pending'
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_payment_event(uuid, numeric, text, text, text)
  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_create_payment_event(uuid, numeric, text, text, text)
  TO authenticated;

-- -----------------------------------------------------------------------------
-- 9.  RPC: rpc_confirm_payment_event  (idempotent)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_confirm_payment_event(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me   uuid := auth.uid();
  v_role text;
  v_pe   record;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_pe FROM payment_events WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found';
  END IF;

  -- Idempotent: already confirmed -> no-op
  IF v_pe.status = 'confirmed' THEN
    RETURN;
  END IF;

  IF v_pe.status != 'pending' THEN
    RAISE EXCEPTION 'cannot_confirm: current status is %', v_pe.status;
  END IF;

  -- Only receiver or gerant
  IF v_me != v_pe.to_user_id THEN
    SELECT role INTO v_role FROM profiles WHERE id = v_me;
    IF v_role NOT IN ('gerant','admin','ceo') THEN
      RAISE EXCEPTION 'only_receiver_or_gerant_can_confirm';
    END IF;
  END IF;

  UPDATE payment_events
     SET status       = 'confirmed',
         confirmed_at = now()
   WHERE id = p_id
     AND status = 'pending';  -- extra guard against race
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_confirm_payment_event(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_confirm_payment_event(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 10.  RPC: rpc_reject_payment_event
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_reject_payment_event(
  p_id     uuid,
  p_reason text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me   uuid := auth.uid();
  v_role text;
  v_pe   record;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_pe FROM payment_events WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found';
  END IF;
  IF v_pe.status != 'pending' THEN
    RAISE EXCEPTION 'cannot_reject: current status is %', v_pe.status;
  END IF;

  IF v_me != v_pe.to_user_id THEN
    SELECT role INTO v_role FROM profiles WHERE id = v_me;
    IF v_role NOT IN ('gerant','admin','ceo') THEN
      RAISE EXCEPTION 'only_receiver_or_gerant_can_reject';
    END IF;
  END IF;

  UPDATE payment_events
     SET status          = 'rejected',
         rejected_at     = now(),
         rejected_reason = COALESCE(p_reason, '')
   WHERE id = p_id
     AND status = 'pending';
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_reject_payment_event(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_reject_payment_event(uuid, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 11.  RPC: rpc_cancel_payment_event  (creator only)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_cancel_payment_event(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me      uuid := auth.uid();
  v_role    text;
  v_pe      record;
  v_creator uuid;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_pe FROM payment_events WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found';
  END IF;
  IF v_pe.status != 'pending' THEN
    RAISE EXCEPTION 'cannot_cancel: current status is %', v_pe.status;
  END IF;

  v_creator := COALESCE(v_pe.created_by, v_pe.from_user_id);

  IF v_me != v_creator THEN
    SELECT role INTO v_role FROM profiles WHERE id = v_me;
    IF v_role NOT IN ('gerant','admin','ceo') THEN
      RAISE EXCEPTION 'only_creator_or_gerant_can_cancel';
    END IF;
  END IF;

  UPDATE payment_events
     SET status       = 'cancelled',
         cancelled_at = now()
   WHERE id = p_id
     AND status = 'pending';
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_cancel_payment_event(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_cancel_payment_event(uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 12.  RPC: rpc_my_payment_kpis
--
--   Returns per-current-user KPIs:
--     pending_incoming_count / pending_incoming_amount
--     pending_outgoing_count
--     received_30d (confirmed receipts in last 30 days)
--     paid_30d     (confirmed sent in last 30 days)
--
--   Amounts in EUR only (multi-currency handled client-side).
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_my_payment_kpis()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'pending_incoming_count',
      COUNT(*) FILTER (
        WHERE to_user_id = auth.uid() AND status = 'pending'
      ),
    'pending_incoming_amount',
      COALESCE(SUM(amount) FILTER (
        WHERE to_user_id = auth.uid() AND status = 'pending' AND currency = 'EUR'
      ), 0),
    'pending_outgoing_count',
      COUNT(*) FILTER (
        WHERE from_user_id = auth.uid() AND status = 'pending'
      ),
    'received_30d',
      COALESCE(SUM(amount) FILTER (
        WHERE to_user_id = auth.uid()
          AND status IN ('confirmed','paid','validated')
          AND COALESCE(confirmed_at, created_at) > now() - interval '30 days'
          AND currency = 'EUR'
      ), 0),
    'paid_30d',
      COALESCE(SUM(amount) FILTER (
        WHERE from_user_id = auth.uid()
          AND status IN ('confirmed','paid','validated')
          AND COALESCE(confirmed_at, created_at) > now() - interval '30 days'
          AND currency = 'EUR'
      ), 0)
  )
  FROM payment_events
  WHERE from_user_id = auth.uid()
     OR to_user_id   = auth.uid()
     OR created_by   = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.rpc_my_payment_kpis() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.rpc_my_payment_kpis() TO authenticated;

-- -----------------------------------------------------------------------------
-- 13.  v_user_balances  (refresh -- uses ledger_entries, RLS-aware)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_user_balances AS
SELECT
  le.owner_user_id AS user_id,
  COALESCE(p.name, p.username) AS display_name,
  p.username,
  p.role,
  le.currency,
  SUM(CASE WHEN le.entry_type = 'receiver_credit' THEN le.amount ELSE 0 END)
    - SUM(CASE WHEN le.entry_type = 'payer_debit' THEN le.amount ELSE 0 END)
    AS balance,
  SUM(CASE WHEN le.entry_type = 'receiver_credit' THEN le.amount ELSE 0 END) AS total_received,
  SUM(CASE WHEN le.entry_type = 'payer_debit'     THEN le.amount ELSE 0 END) AS total_paid,
  COUNT(*) AS entry_count
FROM public.ledger_entries le
JOIN public.profiles p ON p.id = le.owner_user_id
GROUP BY le.owner_user_id, p.name, p.username, p.role, le.currency;

GRANT SELECT ON public.v_user_balances TO authenticated;

COMMIT;
