-- ═══════════════════════════════════════════════════════════════
-- REFONTE PAIEMENTS INTERNES — payment_events + ledger + notifications
-- Date: 2026-02-26
-- Source of truth: payment_events
-- Ledger: écritures via trigger uniquement (SECURITY DEFINER)
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1. TABLE payment_events
-- from_user_id = payer (gerant), to_user_id = bénéficiaire (chatter ou model)
-- Pas de FK sur to_user_id car peut être profiles.id (chatter) ou models.id (modele)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_events (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  from_user_id uuid NOT NULL REFERENCES profiles(id),
  to_user_id uuid NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'CHF',
  title text,
  note text DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now()
);

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

-- ─────────────────────────────────────────────────────────────
-- 2. TABLE ledger_entries (aucun montant négatif)
-- owner_user_id / counterparty_user_id : profiles.id ou models.id selon le cas
-- Pas de FK pour permettre chatters (profiles) et modèles (models)
-- ─────────────────────────────────────────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_ledger_owner ON ledger_entries(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_ledger_payment_event ON ledger_entries(payment_event_id);
CREATE INDEX IF NOT EXISTS idx_ledger_created ON ledger_entries(created_at DESC);

ALTER TABLE ledger_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS le_select_own ON ledger_entries;
CREATE POLICY le_select_own ON ledger_entries FOR SELECT USING (
  owner_user_id = auth.uid()
);

-- Pas de policy INSERT : insert uniquement via trigger SECURITY DEFINER

-- ─────────────────────────────────────────────────────────────
-- 3. TABLE notifications (ajuster si nécessaire)
-- ─────────────────────────────────────────────────────────────
-- Vérifier que la table existe et a les colonnes attendues
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications') THEN
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

-- Ajouter colonnes manquantes si besoin
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message text;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS read boolean DEFAULT false;

-- RLS notifications : INSERT restreint (gerant ou self)
DROP POLICY IF EXISTS notifications_insert ON notifications;
CREATE POLICY notifications_insert ON notifications FOR INSERT WITH CHECK (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant' OR user_id = auth.uid()
);

-- ─────────────────────────────────────────────────────────────
-- 4. FONCTION + TRIGGER fn_payment_event_paid
-- Déclenché sur INSERT (status=paid) ou UPDATE (pending→paid)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_payment_event_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'paid' AND (TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status != 'paid')) THEN
    -- Débit pour from_user (celui qui paie)
    INSERT INTO ledger_entries (
      owner_user_id, counterparty_user_id, entry_type, amount, currency, title, note, payment_event_id
    ) VALUES (
      NEW.from_user_id, NEW.to_user_id, 'debit', NEW.amount, NEW.currency,
      COALESCE(NEW.title, 'Paiement sortant'), COALESCE(NEW.note, ''), NEW.id
    );
    -- Crédit pour to_user (celui qui reçoit)
    INSERT INTO ledger_entries (
      owner_user_id, counterparty_user_id, entry_type, amount, currency, title, note, payment_event_id
    ) VALUES (
      NEW.to_user_id, NEW.from_user_id, 'credit', NEW.amount, NEW.currency,
      COALESCE(NEW.title, 'Paiement reçu'), COALESCE(NEW.note, ''), NEW.id
    );
    -- Notification pour le bénéficiaire (uniquement si to_user_id existe dans profiles)
    INSERT INTO notifications (user_id, type, title, message, read)
    SELECT NEW.to_user_id, 'payment_paid', 'Paiement reçu',
      COALESCE(NEW.title, 'Paiement') || ' : ' || NEW.amount::text || ' ' || NEW.currency, false
    WHERE EXISTS (SELECT 1 FROM profiles WHERE id = NEW.to_user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_event_paid ON payment_events;
CREATE TRIGGER trg_payment_event_paid
  AFTER INSERT OR UPDATE ON payment_events
  FOR EACH ROW
  EXECUTE FUNCTION fn_payment_event_paid();

-- ─────────────────────────────────────────────────────────────
-- 5. VUE balance par utilisateur (optionnel, pour requêtes)
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW user_balance AS
SELECT
  owner_user_id AS user_id,
  SUM(CASE WHEN entry_type = 'debit' THEN -amount ELSE amount END) AS balance,
  currency
FROM ledger_entries
GROUP BY owner_user_id, currency;

-- ─────────────────────────────────────────────────────────────
-- 6. Realtime Supabase (payment_events, ledger_entries)
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE payment_events;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE ledger_entries;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
