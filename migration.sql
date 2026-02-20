-- ═══════════════════════════════════════════════
-- MIGRATION: Gamification + Model Role + RLS Fix
-- Date: 2026-02-20
-- ═══════════════════════════════════════════════

-- ═══════════════════════════════════════════════
-- PART 0 — FIX RLS POLICIES (profiles.id = auth.uid())
-- ═══════════════════════════════════════════════

-- Fix SPENDERS RLS (was disabled)
ALTER TABLE spenders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS spenders_all_gerant ON spenders;
DROP POLICY IF EXISTS spenders_update_chatter ON spenders;
DROP POLICY IF EXISTS spenders_select_all ON spenders;

CREATE POLICY spenders_all_gerant ON spenders FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);
CREATE POLICY spenders_update_chatter ON spenders FOR UPDATE USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'chatter'
);
CREATE POLICY spenders_select_all ON spenders FOR SELECT USING (true);

-- Fix TRANSACTIONS RLS
DROP POLICY IF EXISTS transactions_select ON transactions;
DROP POLICY IF EXISTS transactions_insert ON transactions;
DROP POLICY IF EXISTS transactions_update ON transactions;
DROP POLICY IF EXISTS transactions_delete ON transactions;
DROP POLICY IF EXISTS transactions_all_gerant ON transactions;
DROP POLICY IF EXISTS transactions_select_chatter ON transactions;
DROP POLICY IF EXISTS transactions_insert_chatter ON transactions;
DROP POLICY IF EXISTS transactions_select_provider ON transactions;

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY transactions_all_gerant ON transactions FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);
CREATE POLICY transactions_select_chatter ON transactions FOR SELECT USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'chatter'
);
CREATE POLICY transactions_insert_chatter ON transactions FOR INSERT WITH CHECK (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'chatter'
);
CREATE POLICY transactions_select_provider ON transactions FOR SELECT USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'provider'
);

-- Fix NOTIFICATIONS RLS
DROP POLICY IF EXISTS notifications_select ON notifications;
DROP POLICY IF EXISTS notifications_insert ON notifications;
DROP POLICY IF EXISTS notifications_update ON notifications;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_select ON notifications FOR SELECT USING (
  user_id = auth.uid()
);
CREATE POLICY notifications_insert ON notifications FOR INSERT WITH CHECK (true);
CREATE POLICY notifications_update ON notifications FOR UPDATE USING (
  user_id = auth.uid()
);

-- Fix EXPENSES RLS
DROP POLICY IF EXISTS expenses_all_gerant ON expenses;
DROP POLICY IF EXISTS expenses_select ON expenses;

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY expenses_all_gerant ON expenses FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);

-- Fix PAYOUTS RLS
DROP POLICY IF EXISTS payouts_all_gerant ON payouts;
DROP POLICY IF EXISTS payouts_select ON payouts;

ALTER TABLE payouts ENABLE ROW LEVEL SECURITY;
CREATE POLICY payouts_all_gerant ON payouts FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);
CREATE POLICY payouts_select ON payouts FOR SELECT USING (
  user_id = auth.uid() OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);

-- Fix PROFILES RLS
DROP POLICY IF EXISTS profiles_select ON profiles;
DROP POLICY IF EXISTS profiles_update ON profiles;
DROP POLICY IF EXISTS profiles_all_gerant ON profiles;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY profiles_select ON profiles FOR SELECT USING (true);
CREATE POLICY profiles_update ON profiles FOR UPDATE USING (
  id = auth.uid() OR (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);

-- Fix MODELS RLS
DROP POLICY IF EXISTS models_all_gerant ON models;
DROP POLICY IF EXISTS models_select ON models;

ALTER TABLE models ENABLE ROW LEVEL SECURITY;
CREATE POLICY models_all_gerant ON models FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);
CREATE POLICY models_select ON models FOR SELECT USING (true);

-- ═══════════════════════════════════════════════
-- PART 1 — ADD COLUMNS TO PROFILES
-- ═══════════════════════════════════════════════

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS daily_goal numeric DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS weekly_goal numeric DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS goal_currency text DEFAULT 'EUR';

-- ═══════════════════════════════════════════════
-- PART 2 — CONTENT TASKS (model role)
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS content_tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  model_id uuid NOT NULL REFERENCES profiles(id),
  assigned_by uuid REFERENCES profiles(id),
  title text NOT NULL,
  description text,
  category text DEFAULT 'photo',
  priority text DEFAULT 'medium',
  status text DEFAULT 'todo',
  due_date date,
  completed_at timestamptz,
  bonus_amount numeric DEFAULT 0,
  bonus_currency text DEFAULT 'EUR',
  metadata jsonb
);

ALTER TABLE content_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ct_select_model ON content_tasks;
DROP POLICY IF EXISTS ct_update_model ON content_tasks;
DROP POLICY IF EXISTS ct_all_gerant ON content_tasks;

CREATE POLICY ct_select_model ON content_tasks FOR SELECT USING (
  model_id = auth.uid()
);
CREATE POLICY ct_update_model ON content_tasks FOR UPDATE USING (
  model_id = auth.uid()
);
CREATE POLICY ct_all_gerant ON content_tasks FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);

-- ═══════════════════════════════════════════════
-- PART 3 — MODEL PAYMENTS
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS model_payments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  model_id uuid NOT NULL REFERENCES profiles(id),
  amount numeric NOT NULL,
  currency text DEFAULT 'EUR',
  type text NOT NULL,
  date date DEFAULT CURRENT_DATE,
  notes text,
  status text DEFAULT 'pending',
  paid_by uuid REFERENCES profiles(id),
  metadata jsonb
);

ALTER TABLE model_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mp_select_model ON model_payments;
DROP POLICY IF EXISTS mp_all_gerant ON model_payments;

CREATE POLICY mp_select_model ON model_payments FOR SELECT USING (
  model_id = auth.uid()
);
CREATE POLICY mp_all_gerant ON model_payments FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);

-- ═══════════════════════════════════════════════
-- PART 4 — WEEKLY RANKINGS
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS weekly_rankings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  week_start date NOT NULL,
  chatter_id uuid NOT NULL REFERENCES profiles(id),
  rank integer NOT NULL,
  ca numeric NOT NULL,
  tx_count integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE weekly_rankings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wr_select ON weekly_rankings;
DROP POLICY IF EXISTS wr_all_gerant ON weekly_rankings;

CREATE POLICY wr_select ON weekly_rankings FOR SELECT USING (true);
CREATE POLICY wr_all_gerant ON weekly_rankings FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);

-- ═══════════════════════════════════════════════
-- PART 5 — CHALLENGES
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS challenges (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES profiles(id),
  title text NOT NULL,
  metric text NOT NULL,
  start_date timestamptz NOT NULL,
  end_date timestamptz NOT NULL,
  reward text,
  active boolean DEFAULT true,
  metadata jsonb
);

ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ch_select ON challenges;
DROP POLICY IF EXISTS ch_all_gerant ON challenges;

CREATE POLICY ch_select ON challenges FOR SELECT USING (true);
CREATE POLICY ch_all_gerant ON challenges FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);
