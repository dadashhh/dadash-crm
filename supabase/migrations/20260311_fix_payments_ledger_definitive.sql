-- ═══════════════════════════════════════════════════════════════════════════
-- FIX DÉFINITIF — Payments / Ledger / Notifications / Triggers
-- Date: 2026-03-11
-- Phase 2: pipeline 100% payment_event -> mark paid -> ledger -> notif
--
-- CAUSES RACINES IDENTIFIÉES:
-- 1. Conflits entre 3 migrations: entry_type 'debit'/'credit' vs 'payer_debit'/'receiver_credit'
-- 2. manager_notifier.sql stockait amount négatif → viole CHECK (amount > 0)
-- 3. Pas de policy INSERT ledger pour trigger (SECURITY DEFINER bypass OK)
-- 4. Pas de le_all_gerant dans certaines migrations
-- 5. Kind colonne optionnelle: COALESCE(kind, 'receiver_credit') corrompait entry_type
-- 6. Pas d'idempotence sur ledger inserts (risque doublons)
--
-- DÉCISIONS:
-- • entry_type = 'debit' | 'credit' (convention finale, front-end compatible)
-- • amount TOUJOURS > 0 (orientation via entry_type)
-- • note NOT NULL DEFAULT ''
-- • Trigger SECURITY DEFINER bypass RLS, guard idempotence via payment_event_id
-- • Manager alert en bloc EXCEPTION (optionnel, ne bloque pas si table absente)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- PART 1 — Garantir les colonnes payment_events
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  from_user_id uuid NOT NULL,
  to_user_id uuid NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'CHF',
  title text,
  note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE payment_events ADD COLUMN IF NOT EXISTS kind text DEFAULT 'salary';
ALTER TABLE payment_events ADD COLUMN IF NOT EXISTS title text;

DO $$ BEGIN
  UPDATE payment_events SET note = '' WHERE note IS NULL;
  ALTER TABLE payment_events ALTER COLUMN note SET DEFAULT '';
  ALTER TABLE payment_events ALTER COLUMN note SET NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
  UPDATE payment_events SET kind = 'salary' WHERE kind IS NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_payment_events_from ON payment_events(from_user_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_to ON payment_events(to_user_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_status ON payment_events(status);
CREATE INDEX IF NOT EXISTS idx_payment_events_created ON payment_events(created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- PART 2 — Garantir les colonnes ledger_entries
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
  payment_event_id uuid REFERENCES payment_events(id)
);

ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS payment_event_id uuid;
ALTER TABLE ledger_entries ADD COLUMN IF NOT EXISTS created_by uuid;

DO $$ BEGIN
  UPDATE ledger_entries SET note = '' WHERE note IS NULL;
  ALTER TABLE ledger_entries ALTER COLUMN note SET DEFAULT '';
  ALTER TABLE ledger_entries ALTER COLUMN note SET NOT NULL;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Migrer anciennes données: amounts négatifs → positifs
UPDATE ledger_entries SET amount = ABS(amount) WHERE amount < 0;

-- Normaliser entry_type vers convention 'debit'/'credit'
UPDATE ledger_entries SET entry_type = 'debit' WHERE entry_type = 'payer_debit';
UPDATE ledger_entries SET entry_type = 'credit' WHERE entry_type = 'receiver_credit';
UPDATE ledger_entries SET entry_type = 'credit' WHERE entry_type NOT IN ('debit', 'credit');

-- Recréer les constraints proprement
ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_amount_check;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_amount_check CHECK (amount > 0);

ALTER TABLE ledger_entries DROP CONSTRAINT IF EXISTS ledger_entries_entry_type_check;
ALTER TABLE ledger_entries ADD CONSTRAINT ledger_entries_entry_type_check CHECK (entry_type IN ('debit', 'credit'));

CREATE INDEX IF NOT EXISTS idx_ledger_owner ON ledger_entries(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_owner_created ON ledger_entries(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_payment_event ON ledger_entries(payment_event_id);
CREATE INDEX IF NOT EXISTS idx_ledger_created ON ledger_entries(created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────
-- PART 3 — RLS payment_events
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pe_select_own ON payment_events;
DROP POLICY IF EXISTS pe_insert_gerant ON payment_events;
DROP POLICY IF EXISTS pe_update_gerant ON payment_events;
DROP POLICY IF EXISTS pe_all_gerant ON payment_events;
DROP POLICY IF EXISTS pe_select_involved ON payment_events;

CREATE POLICY pe_all_gerant ON payment_events FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);

CREATE POLICY pe_select_involved ON payment_events FOR SELECT USING (
  from_user_id = auth.uid() OR to_user_id = auth.uid() OR created_by = auth.uid()
);

-- ─────────────────────────────────────────────────────────────────────────
-- PART 4 — RLS ledger_entries
-- ─────────────────────────────────────────────────────────────────────────
ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS le_select_own ON ledger_entries;
DROP POLICY IF EXISTS le_all_gerant ON ledger_entries;
DROP POLICY IF EXISTS le_insert_gerant ON ledger_entries;

CREATE POLICY le_all_gerant ON ledger_entries FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);

CREATE POLICY le_select_own ON ledger_entries FOR SELECT USING (
  owner_user_id = auth.uid()
);

-- ─────────────────────────────────────────────────────────────────────────
-- PART 5 — Notifications table + RLS
-- ─────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='notifications') THEN
    CREATE TABLE notifications (
      id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
      user_id uuid NOT NULL,
      type text,
      title text,
      message text,
      read boolean DEFAULT false,
      tx_id uuid,
      created_at timestamptz DEFAULT now()
    );
  END IF;
END $$;

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read boolean DEFAULT false;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS tx_id uuid;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select ON notifications;
DROP POLICY IF EXISTS notifications_insert ON notifications;
DROP POLICY IF EXISTS notifications_update ON notifications;

CREATE POLICY notifications_select ON notifications FOR SELECT USING (
  user_id = auth.uid()
);
CREATE POLICY notifications_insert ON notifications FOR INSERT WITH CHECK (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant' OR user_id = auth.uid()
);
CREATE POLICY notifications_update ON notifications FOR UPDATE USING (
  user_id = auth.uid()
);

-- ─────────────────────────────────────────────────────────────────────────
-- PART 6 — TRIGGER fn_payment_event_paid (VERSION DÉFINITIVE)
--
-- Convention: entry_type = 'debit' | 'credit', amount > 0
-- Idempotence: skip si ledger entries existent déjà pour ce payment_event_id
-- SECURITY DEFINER: bypass RLS pour inserts
-- Manager alert: en bloc EXCEPTION (optionnel)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_payment_event_paid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_title      text;
  v_from_name  text;
  v_to_name    text;
  v_existing   int := 0;
BEGIN
  IF NEW.status != 'paid' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'paid' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_existing FROM ledger_entries WHERE payment_event_id = NEW.id;
  IF v_existing > 0 THEN
    RETURN NEW;
  END IF;

  v_title := COALESCE(NEW.title, 'Paiement interne');

  SELECT COALESCE(name, 'Inconnu') INTO v_from_name FROM profiles WHERE id = NEW.from_user_id;
  SELECT COALESCE(name, 'Inconnu') INTO v_to_name FROM profiles WHERE id = NEW.to_user_id;

  INSERT INTO ledger_entries (
    owner_user_id, counterparty_user_id, entry_type, amount, currency, title, note, payment_event_id, created_by
  ) VALUES (
    NEW.from_user_id, NEW.to_user_id, 'debit', NEW.amount, NEW.currency,
    v_title, COALESCE(NEW.note, ''), NEW.id, COALESCE(NEW.created_by, NEW.from_user_id)
  );

  INSERT INTO ledger_entries (
    owner_user_id, counterparty_user_id, entry_type, amount, currency, title, note, payment_event_id, created_by
  ) VALUES (
    NEW.to_user_id, NEW.from_user_id, 'credit', NEW.amount, NEW.currency,
    v_title, COALESCE(NEW.note, ''), NEW.id, COALESCE(NEW.created_by, NEW.from_user_id)
  );

  INSERT INTO notifications (user_id, type, title, message, read)
  SELECT NEW.to_user_id, 'payment_paid', v_title,
    'Paiement reçu de ' || COALESCE(v_from_name, '?') || ' : ' || NEW.amount::text || ' ' || NEW.currency, false
  WHERE EXISTS (SELECT 1 FROM profiles WHERE id = NEW.to_user_id);

  BEGIN
    INSERT INTO manager_alerts (type, message, payload)
    VALUES (
      'payment_paid',
      '<b>Paiement effectué</b>' || E'\n' ||
        'De : ' || COALESCE(v_from_name, '?') || ' → ' || COALESCE(v_to_name, '?') || E'\n' ||
        'Montant : <b>' || NEW.amount::text || ' ' || NEW.currency || '</b>',
      jsonb_build_object(
        'payment_event_id', NEW.id,
        'from_user_id', NEW.from_user_id,
        'to_user_id', NEW.to_user_id,
        'amount', NEW.amount,
        'currency', NEW.currency
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_event_paid ON payment_events;
DROP TRIGGER IF EXISTS trg_payment_event_paid_insert ON payment_events;

CREATE TRIGGER trg_payment_event_paid
  AFTER UPDATE ON payment_events
  FOR EACH ROW EXECUTE FUNCTION fn_payment_event_paid();

CREATE TRIGGER trg_payment_event_paid_insert
  AFTER INSERT ON payment_events
  FOR EACH ROW
  WHEN (NEW.status = 'paid')
  EXECUTE FUNCTION fn_payment_event_paid();

-- ─────────────────────────────────────────────────────────────────────────
-- PART 7 — Vue user_balance (refresh)
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW user_balance AS
SELECT
  owner_user_id AS user_id,
  SUM(CASE WHEN entry_type = 'debit' THEN -amount ELSE amount END) AS balance,
  currency
FROM ledger_entries
GROUP BY owner_user_id, currency;

-- ─────────────────────────────────────────────────────────────────────────
-- PART 8 — Realtime
-- ─────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE payment_events;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE ledger_entries;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
