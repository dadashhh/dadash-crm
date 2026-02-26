-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: Payment System — payment_events + ledger_entries
-- Date: 2026-02-26
-- Implements: manager ↔ chatter ↔ model ↔ provider internal payments
--   - payment_events: source of truth for each payment
--   - ledger_entries: double-entry bookkeeping (payer - / receiver +)
--   - notifications: auto-notify receiver when payment is marked paid
--   - RLS: users only see their own data
-- ═══════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════
-- PART 1 — PAYMENT EVENTS TABLE
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.payment_events (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at   timestamptz DEFAULT now(),
  created_by   uuid REFERENCES public.profiles(id),
  from_user_id uuid NOT NULL REFERENCES public.profiles(id),
  to_user_id   uuid NOT NULL REFERENCES public.profiles(id),
  amount       numeric NOT NULL CHECK (amount > 0),
  currency     text NOT NULL DEFAULT 'EUR',
  kind         text NOT NULL DEFAULT 'salary',   -- salary | bonus | adjustment | provider_payment
  title        text,
  note         text,
  status       text NOT NULL DEFAULT 'pending'   -- pending | paid | cancelled
);

ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

-- Gérant: full access
DROP POLICY IF EXISTS pe_all_gerant ON public.payment_events;
CREATE POLICY pe_all_gerant ON public.payment_events FOR ALL USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'gerant'
);

-- Others: read only if involved (from/to/created_by)
DROP POLICY IF EXISTS pe_select_involved ON public.payment_events;
CREATE POLICY pe_select_involved ON public.payment_events FOR SELECT USING (
  from_user_id = auth.uid()
  OR to_user_id = auth.uid()
  OR created_by = auth.uid()
);

-- ═══════════════════════════════════════════════════════════════
-- PART 2 — LEDGER ENTRIES TABLE (if not already created)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id                   uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at           timestamptz DEFAULT now(),
  created_by           uuid REFERENCES public.profiles(id),
  owner_user_id        uuid NOT NULL REFERENCES public.profiles(id),  -- user this entry belongs to
  counterparty_user_id uuid REFERENCES public.profiles(id),           -- the other side
  entry_type           text NOT NULL,   -- payer_debit | receiver_credit | salary | bonus | ...
  amount               numeric NOT NULL, -- negative for payer, positive for receiver
  currency             text NOT NULL DEFAULT 'EUR',
  title                text,
  note                 text,
  payment_event_id     uuid REFERENCES public.payment_events(id)      -- source payment
);

ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;

-- Gérant: full access
DROP POLICY IF EXISTS le_all_gerant ON public.ledger_entries;
CREATE POLICY le_all_gerant ON public.ledger_entries FOR ALL USING (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'gerant'
);

-- Others: only own entries
DROP POLICY IF EXISTS le_select_own ON public.ledger_entries;
CREATE POLICY le_select_own ON public.ledger_entries FOR SELECT USING (
  owner_user_id = auth.uid()
);

-- Insert allowed for trigger/service role (or gérant)
DROP POLICY IF EXISTS le_insert_gerant ON public.ledger_entries;
CREATE POLICY le_insert_gerant ON public.ledger_entries FOR INSERT WITH CHECK (
  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'gerant'
);

-- ═══════════════════════════════════════════════════════════════
-- PART 3 — NOTIFICATIONS TABLE RLS (ensure correct policies)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select ON public.notifications;
DROP POLICY IF EXISTS notifications_insert ON public.notifications;
DROP POLICY IF EXISTS notifications_update ON public.notifications;

CREATE POLICY notifications_select ON public.notifications FOR SELECT USING (
  user_id = auth.uid()
);
CREATE POLICY notifications_insert ON public.notifications FOR INSERT WITH CHECK (true);
CREATE POLICY notifications_update ON public.notifications FOR UPDATE USING (
  user_id = auth.uid()
);

-- ═══════════════════════════════════════════════════════════════
-- PART 4 — TRIGGER: on payment_events status='paid' →
--   write 2 ledger_entries + 1 notification for receiver
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.fn_payment_event_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_title text;
  v_receiver_name text;
BEGIN
  -- Only fire when status changes TO 'paid'
  IF NEW.status = 'paid' AND (OLD.status IS NULL OR OLD.status <> 'paid') THEN
    v_title := COALESCE(NEW.title, NEW.kind, 'Paiement interne');

    -- 1) Ledger entry for PAYER (negative amount = money out)
    INSERT INTO public.ledger_entries (
      created_by, owner_user_id, counterparty_user_id,
      entry_type, amount, currency, title, note, payment_event_id
    ) VALUES (
      NEW.created_by, NEW.from_user_id, NEW.to_user_id,
      'payer_debit', -NEW.amount, NEW.currency,
      v_title, NEW.note, NEW.id
    );

    -- 2) Ledger entry for RECEIVER (positive amount = money in)
    INSERT INTO public.ledger_entries (
      created_by, owner_user_id, counterparty_user_id,
      entry_type, amount, currency, title, note, payment_event_id
    ) VALUES (
      NEW.created_by, NEW.to_user_id, NEW.from_user_id,
      COALESCE(NEW.kind, 'receiver_credit'), NEW.amount, NEW.currency,
      v_title, NEW.note, NEW.id
    );

    -- 3) Notification for RECEIVER
    SELECT COALESCE(full_name, username, display_name, 'Manager')
      INTO v_receiver_name
      FROM public.profiles
      WHERE id = NEW.from_user_id;

    INSERT INTO public.notifications (
      user_id, type, title, message, tx_id, read
    ) VALUES (
      NEW.to_user_id,
      COALESCE(NEW.kind, 'payment'),
      v_title || ' 💸',
      'Paiement reçu de ' || COALESCE(v_receiver_name, '?') || ' : ' ||
        NEW.amount::text || ' ' || NEW.currency,
      NULL,
      false
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_event_paid ON public.payment_events;
CREATE TRIGGER trg_payment_event_paid
  AFTER UPDATE ON public.payment_events
  FOR EACH ROW EXECUTE FUNCTION public.fn_payment_event_paid();

-- Also fire on INSERT if already paid (edge case)
DROP TRIGGER IF EXISTS trg_payment_event_paid_insert ON public.payment_events;
CREATE TRIGGER trg_payment_event_paid_insert
  AFTER INSERT ON public.payment_events
  FOR EACH ROW EXECUTE FUNCTION public.fn_payment_event_paid();
