-- ═══════════════════════════════════════════════════════════════════════
-- MIGRATION: Manager Chatter Role
-- Date: 2026-03-17
-- Description: Tables and columns for the manager_chatter role
-- ═══════════════════════════════════════════════════════════════════════

-- Table assignation manager → chatters
CREATE TABLE IF NOT EXISTS manager_chatters (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  manager_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  chatter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(manager_id, chatter_id)
);

ALTER TABLE manager_chatters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "manager_chatters_all" ON manager_chatters FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Table shifts / planning chatters
CREATE TABLE IF NOT EXISTS chatter_shifts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  chatter_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  manager_id UUID REFERENCES profiles(id),
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'completed', 'absent')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE chatter_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chatter_shifts_all" ON chatter_shifts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Commission manager : ajouter colonnes sur profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS manager_commission_pct NUMERIC(5,2) DEFAULT 3.00;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS manager_balance NUMERIC(12,2) DEFAULT 0.00;

-- Table historique commissions
CREATE TABLE IF NOT EXISTS manager_commissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  manager_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  ca_validated NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission_pct NUMERIC(5,2) NOT NULL DEFAULT 3.00,
  commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE manager_commissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "manager_commissions_all" ON manager_commissions FOR ALL TO authenticated USING (true) WITH CHECK (true);
