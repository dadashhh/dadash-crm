-- ═══════════════════════════════════════════════════════════════════════════
-- FIX DÉFINITIF PAIES / LEDGER / ESPACE COMPTA — Production Ready
-- Date: 2026-03-10
-- Idempotent: safe to run multiple times
--
-- DIAGNOSTIC (causes identifiées):
-- 1. ledger_entries: contrainte amount>0 violée si anciennes migrations stockaient des négatifs
-- 2. note nullable → NOT NULL DEFAULT '' requis
-- 3. entry_type: aligner sur 'debit'|'credit' (frontend attend ces valeurs)
-- 4. Trigger: fire uniquement sur UPDATE pending→paid (OLD.status IS DISTINCT FROM 'paid')
-- 5. RLS: pas de policy INSERT sur ledger (trigger SECURITY DEFINER bypass)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- PART 1 — payment_events
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  from_user_id uuid NOT NULL REFERENCES profiles(id),
  to_user_id uuid NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'CHF',
  title text,
  note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

-- Colonnes manquantes si table existait avant (payment_system.sql a kind NOT NULL)
ALTER TABLE payment_events ADD COLUMN IF NOT EXISTS kind text DEFAULT 'salary';
ALTER TABLE payment_events ALTER COLUMN kind SET DEFAULT 'salary';
UPDATE payment_events SET kind = 'salary' WHERE kind IS NULL;
ALTER TABLE payment_events ADD COLUMN IF NOT EXISTS note text;
DO $$
BEGIN
  UPDATE payment_events SET note = '' WHERE note IS NULL;
  ALTER TABLE payment_events ALTER COLUMN note SET DEFAULT '';
  ALTER TABLE payment_events ALTER COLUMN note SET NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_payment_events_from ON payment_events(from_user_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_to ON payment_events(to_user_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_status ON payment_events(status);
CREATE INDEX IF NOT EXISTS idx_payment_events_created ON payment_events(created_at DESC);

ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pe_select_own ON payment_events;
CREATE POLICY pe_select_own ON payment_events FOR SELECT USING (
  from_user_id = auth.uid() OR to_user_id = auth.uid()
);

DROP POLICY IF EXISTS pe_insert_gerant ON payment_events;
CREATE POLICY pe_insert_gerant ON payment_events FOR INSERT WITH CHECK (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);

DROP POLICY IF EXISTS pe_update_gerant ON payment_events;
CREATE POLICY pe_update_gerant ON payment_events FOR UPDATE USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);

-- ─────────────────────────────────────────────────────────────────────────
-- PART 2 — ledger_entries (amount TOUJOURS > 0, entry_type debit|credit)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ledger_entries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  owner_user_id uuid NOT NULL,
  counterparty_user_id uuid NOT NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('debit', 'credit')),
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'CHF',
  title text,
  note text NOT NULL DEFAULT '',
  payment_event_id uuid NOT NULL REFERENCES payment_events(id)
);

-- Migrer table existante
DO $$
BEGIN
  ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS note text;
  UPDATE ledger_entries SET note = '' WHERE note IS NULL;
  ALTER TABLE ledger_entries ALTER COLUMN note SET DEFAULT '';
  ALTER TABLE ledger_entries ALTER COLUMN note SET NOT NULL;
EXCEPTION WHEN undefined_table THEN NULL;
END $$;

DO $$
BEGIN
  UPDATE ledger_entries SET amount = ABS(amount) WHERE amount < 0;
  UPDATE ledger_entries SET entry_type = 'debit' WHERE entry_type = 'payer_debit';
  UPDATE ledger_entries SET entry_type = 'credit' WHERE entry_type = 'receiver_credit';
END $$;

ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_amount_check;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_amount_check CHECK (amount > 0);

ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_entry_type_check;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_entry_type_check CHECK (entry_type IN ('debit', 'credit'));

CREATE INDEX IF NOT EXISTS idx_ledger_owner ON ledger_entries(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_owner_created ON ledger_entries(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_payment_event ON ledger_entries(payment_event_id);
CREATE INDEX IF NOT EXISTS idx_ledger_created ON ledger_entries(created_at DESC);

ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS le_select_own ON ledger_entries;
DROP POLICY IF EXISTS le_all_gerant ON ledger_entries;
DROP POLICY IF EXISTS le_insert_gerant ON ledger_entries;
CREATE POLICY le_select_own ON ledger_entries FOR SELECT USING (
  owner_user_id = auth.uid()
);
-- Pas de policy INSERT: trigger SECURITY DEFINER only

-- ─────────────────────────────────────────────────────────────────────────
-- PART 3 — notifications
-- ─────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='notifications') THEN
    CREATE TABLE notifications (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES profiles(id),
      type text,
      title text,
      message text,
      read boolean DEFAULT false,
      created_at timestamptz DEFAULT now()
    );
  END IF;
END $$;

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read boolean DEFAULT false;

DROP POLICY IF EXISTS notifications_insert ON notifications;
CREATE POLICY notifications_insert ON notifications FOR INSERT WITH CHECK (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant' OR user_id = auth.uid()
);

DROP POLICY IF EXISTS notifications_select ON notifications;
CREATE POLICY notifications_select ON notifications FOR SELECT USING (
  user_id = auth.uid()
);

-- ─────────────────────────────────────────────────────────────────────────
-- PART 4 — FONCTION + TRIGGER fn_payment_event_paid
-- Fire UNIQUEMENT quand NEW.status='paid' ET OLD.status IS DISTINCT FROM 'paid'
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_payment_event_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing int := 0;
BEGIN
  IF NEW.status != 'paid' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'paid' THEN
    RETURN NEW;
  END IF;

  -- Idempotence: skip si ledger déjà créé
  SELECT COUNT(*) INTO v_existing FROM ledger_entries WHERE payment_event_id = NEW.id;
  IF v_existing > 0 THEN
    RETURN NEW;
  END IF;

  -- 1. Debit (from_user)
  INSERT INTO ledger_entries (
    owner_user_id, counterparty_user_id, entry_type, amount, currency, title, note, payment_event_id
  ) VALUES (
    NEW.from_user_id, NEW.to_user_id, 'debit', NEW.amount, NEW.currency,
    COALESCE(NEW.title, 'Paiement sortant'), COALESCE(NEW.note, ''), NEW.id
  );

  -- 2. Credit (to_user)
  INSERT INTO ledger_entries (
    owner_user_id, counterparty_user_id, entry_type, amount, currency, title, note, payment_event_id
  ) VALUES (
    NEW.to_user_id, NEW.from_user_id, 'credit', NEW.amount, NEW.currency,
    COALESCE(NEW.title, 'Paiement reçu'), COALESCE(NEW.note, ''), NEW.id
  );

  -- 3. Notification (si to_user_id dans profiles)
  INSERT INTO notifications (user_id, type, title, message, read)
  SELECT NEW.to_user_id, 'payment_paid', 'Paiement reçu',
    COALESCE(NEW.title, 'Paiement') || ' : ' || NEW.amount::text || ' ' || NEW.currency, false
  WHERE EXISTS (SELECT 1 FROM profiles WHERE id = NEW.to_user_id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_event_paid ON payment_events;
DROP TRIGGER IF EXISTS trg_payment_event_paid_insert ON payment_events;
CREATE TRIGGER trg_payment_event_paid
  AFTER UPDATE ON payment_events
  FOR EACH ROW
  EXECUTE FUNCTION fn_payment_event_paid();

-- Trigger INSERT pour cas bulk (status=paid direct)
CREATE TRIGGER trg_payment_event_paid_insert
  AFTER INSERT ON payment_events
  FOR EACH ROW
  WHEN (NEW.status = 'paid')
  EXECUTE FUNCTION fn_payment_event_paid();

-- ─────────────────────────────────────────────────────────────────────────
-- PART 5 — Vue user_balance
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW user_balance AS
SELECT
  owner_user_id AS user_id,
  SUM(CASE WHEN entry_type = 'debit' THEN -amount ELSE amount END) AS balance,
  currency
FROM ledger_entries
GROUP BY owner_user_id, currency;
