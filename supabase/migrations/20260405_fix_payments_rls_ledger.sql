-- ==========================================================================
-- FIX: payment_events RLS + ledger_entries + notifications columns
-- Dashboard-safe: NO dollar-quoting, NO BEGIN/COMMIT
-- Run each block separately OR as a single batch in the SQL Editor
-- ==========================================================================

-- --------------------------------------------------------------------------
-- 1. payment_events: add missing columns (idempotent)
-- --------------------------------------------------------------------------

ALTER TABLE public.payment_events
  ADD COLUMN IF NOT EXISTS confirmed_at    timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_at     timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_reason text,
  ADD COLUMN IF NOT EXISTS cancelled_at    timestamptz,
  ADD COLUMN IF NOT EXISTS receipt_url     text,
  ADD COLUMN IF NOT EXISTS invoice_number  text,
  ADD COLUMN IF NOT EXISTS validated_by    uuid REFERENCES public.profiles(id);

-- --------------------------------------------------------------------------
-- 2. payment_events: RLS (drop all + recreate clean)
-- --------------------------------------------------------------------------

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pe_all_gerant       ON public.payment_events;
DROP POLICY IF EXISTS pe_select_involved  ON public.payment_events;
DROP POLICY IF EXISTS pe_confirm_receiver ON public.payment_events;
DROP POLICY IF EXISTS pe_insert_receiver  ON public.payment_events;
DROP POLICY IF EXISTS pe_actor_update     ON public.payment_events;
DROP POLICY IF EXISTS pe_insert_provider  ON public.payment_events;
DROP POLICY IF EXISTS pe_update_gerant    ON public.payment_events;

-- Gerant / admin / CEO: full access (read + write)
CREATE POLICY pe_all_gerant ON public.payment_events
  FOR ALL
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid())
    IN ('gerant', 'admin', 'ceo')
  );

-- Chatter / model / provider: see own payments
CREATE POLICY pe_select_involved ON public.payment_events
  FOR SELECT
  USING (
    from_user_id = auth.uid()
    OR to_user_id   = auth.uid()
    OR created_by   = auth.uid()
  );

-- Receiver (to_user_id) can confirm/refuse
-- Creator (from_user_id / created_by) can cancel / mark paid
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

-- Any authenticated user can INSERT (gerant + provider create payments)
CREATE POLICY pe_insert_any ON public.payment_events
  FOR INSERT
  WITH CHECK (
    from_user_id = auth.uid()
    OR created_by = auth.uid()
  );

-- --------------------------------------------------------------------------
-- 3. ledger_entries: create table if absent + RLS
-- --------------------------------------------------------------------------

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
  payment_event_id     uuid        REFERENCES public.payment_events(id)
);

ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS le_all_gerant    ON public.ledger_entries;
DROP POLICY IF EXISTS le_select_own    ON public.ledger_entries;
DROP POLICY IF EXISTS le_insert_gerant ON public.ledger_entries;

CREATE POLICY le_all_gerant ON public.ledger_entries
  FOR ALL
  USING (
    (SELECT role FROM public.profiles WHERE id = auth.uid())
    IN ('gerant', 'admin', 'ceo')
  );

CREATE POLICY le_select_own ON public.ledger_entries
  FOR SELECT
  USING (owner_user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_le_owner         ON public.ledger_entries(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_le_payment_event ON public.ledger_entries(payment_event_id);

-- --------------------------------------------------------------------------
-- 4. notifications: add kind + is_read (idempotent)
-- --------------------------------------------------------------------------

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS kind    text
    CHECK (kind IS NULL OR kind IN ('tx', 'spender', 'payment')),
  ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false;

UPDATE public.notifications
   SET is_read = COALESCE("read", false)
 WHERE is_read IS DISTINCT FROM COALESCE("read", false);

CREATE INDEX IF NOT EXISTS idx_notif_user_kind_isread
  ON public.notifications(user_id, kind, is_read);

-- --------------------------------------------------------------------------
-- 5. Trigger: write ledger_entries when payment_events confirmed/paid
--
--    Uses single-quoted function body (no $$ = Dashboard-safe).
--    Internal single quotes are doubled: '' = one literal quote in PL/pgSQL.
--    Idempotent: checks COUNT before inserting.
-- --------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_pe_ledger_on_confirm ON public.payment_events;

CREATE OR REPLACE FUNCTION public.fn_pe_ledger_on_confirm()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
AS 'DECLARE
  v_cnt     int;
  v_creator uuid;
  v_label   text;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;

  IF NEW.status IN (''confirmed'', ''paid'', ''validated'')
     AND OLD.status NOT IN (''confirmed'', ''paid'', ''validated'') THEN

    SELECT COUNT(*) INTO v_cnt
      FROM public.ledger_entries
     WHERE payment_event_id = NEW.id;

    IF v_cnt = 0 THEN
      v_creator := COALESCE(NEW.created_by, NEW.from_user_id);
      v_label   := COALESCE(NEW.title, NEW.kind, ''Paiement'');

      INSERT INTO public.ledger_entries
        (created_by, owner_user_id, counterparty_user_id,
         entry_type, amount, currency, title, note, payment_event_id)
      VALUES
        (v_creator, NEW.from_user_id, NEW.to_user_id,
         ''payer_debit'', NEW.amount, NEW.currency,
         v_label, COALESCE(NEW.note, ''''), NEW.id);

      INSERT INTO public.ledger_entries
        (created_by, owner_user_id, counterparty_user_id,
         entry_type, amount, currency, title, note, payment_event_id)
      VALUES
        (v_creator, NEW.to_user_id, NEW.from_user_id,
         ''receiver_credit'', NEW.amount, NEW.currency,
         v_label, COALESCE(NEW.note, ''''), NEW.id);
    END IF;

  END IF;

  RETURN NEW;
END;';

CREATE TRIGGER trg_pe_ledger_on_confirm
  AFTER UPDATE ON public.payment_events
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_pe_ledger_on_confirm();
