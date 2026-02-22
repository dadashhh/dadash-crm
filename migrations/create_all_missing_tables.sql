-- ═══════════════════════════════════════════════════════════════
-- COMPREHENSIVE MIGRATION: Create ALL Missing Tables
-- Date: 2026-02-22
-- Safe to run: uses IF NOT EXISTS + DROP POLICY IF EXISTS
-- ═══════════════════════════════════════════════════════════════
--
-- Tables covered:
--   1. content_tasks
--   2. model_payments
--   3. challenges
--   4. weekly_rankings
--   5. provider_payouts
--   6. invoices + invoice_counter
--   7. model_videos + video_sessions
--   8. wa_analysis_logs
--   9. bot_config
--
-- Column additions:
--   - profiles: daily_goal, weekly_goal, goal_currency
--   - transactions: product_id, product_tag_id
--   - spenders: telegram_id, whatsapp_phone, age, city, job,
--              classification, last_contact_date, source
-- ═══════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════
-- PART 1 — ADD COLUMNS TO EXISTING TABLES
-- ═══════════════════════════════════════════════

-- Profiles: gamification goals
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS daily_goal numeric DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS weekly_goal numeric DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS goal_currency text DEFAULT 'EUR';

-- Transactions: product catalog FK
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS product_id uuid;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS product_tag_id uuid;

-- Spenders: enrichment columns for bot integration
ALTER TABLE spenders ADD COLUMN IF NOT EXISTS telegram_id text;
ALTER TABLE spenders ADD COLUMN IF NOT EXISTS whatsapp_phone text;
ALTER TABLE spenders ADD COLUMN IF NOT EXISTS age integer;
ALTER TABLE spenders ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE spenders ADD COLUMN IF NOT EXISTS job text;
ALTER TABLE spenders ADD COLUMN IF NOT EXISTS classification text DEFAULT 'new';
ALTER TABLE spenders ADD COLUMN IF NOT EXISTS last_contact_date timestamptz;
ALTER TABLE spenders ADD COLUMN IF NOT EXISTS source text;

-- Index on spenders classification
CREATE INDEX IF NOT EXISTS idx_spenders_classification ON spenders(classification);


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


-- ═══════════════════════════════════════════════
-- PART 6 — PROVIDER PAYOUTS
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS provider_payouts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  provider_id uuid NOT NULL REFERENCES profiles(id),
  declared_by uuid NOT NULL REFERENCES profiles(id),
  amount numeric(10,2) NOT NULL,
  currency text DEFAULT 'EUR',
  period_from date NOT NULL,
  period_to date NOT NULL,
  payment_method text,
  reference text,
  proof_url text,
  status text DEFAULT 'pending',
  validated_by uuid REFERENCES profiles(id),
  validated_at timestamptz,
  notes text
);

CREATE INDEX IF NOT EXISTS idx_provider_payouts_provider ON provider_payouts(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_payouts_status ON provider_payouts(status);

ALTER TABLE provider_payouts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pp_gerant ON provider_payouts;
DROP POLICY IF EXISTS pp_provider_read ON provider_payouts;
DROP POLICY IF EXISTS pp_provider_insert ON provider_payouts;

CREATE POLICY pp_gerant ON provider_payouts FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);
CREATE POLICY pp_provider_read ON provider_payouts FOR SELECT USING (
  declared_by = auth.uid()
);
CREATE POLICY pp_provider_insert ON provider_payouts FOR INSERT WITH CHECK (
  declared_by = auth.uid()
);


-- ═══════════════════════════════════════════════
-- PART 7 — INVOICES + COUNTER
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS invoices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  invoice_number text NOT NULL UNIQUE,
  type text NOT NULL,
  from_name text NOT NULL,
  from_details jsonb,
  to_name text NOT NULL,
  to_details jsonb,
  subtotal numeric(10,2) NOT NULL,
  tax_rate numeric(5,2) DEFAULT 0,
  tax_amount numeric(10,2) DEFAULT 0,
  total numeric(10,2) NOT NULL,
  currency text DEFAULT 'EUR',
  line_items jsonb NOT NULL,
  period_from date,
  period_to date,
  payment_method text,
  payment_reference text,
  payment_date date,
  due_date date,
  status text DEFAULT 'draft',
  payout_id uuid,
  profile_id uuid REFERENCES profiles(id),
  provider_id uuid,
  pdf_url text,
  notes text,
  created_by uuid REFERENCES profiles(id),
  sent_at timestamptz,
  sent_to_email text
);

CREATE TABLE IF NOT EXISTS invoice_counter (
  id integer PRIMARY KEY DEFAULT 1,
  year integer NOT NULL,
  last_number integer DEFAULT 0,
  UNIQUE(id)
);

-- Initialize counter (safe: ON CONFLICT DO NOTHING)
INSERT INTO invoice_counter (id, year, last_number) VALUES (1, 2026, 0)
ON CONFLICT (id) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_invoices_type ON invoices(type);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_profile ON invoices(profile_id);
CREATE INDEX IF NOT EXISTS idx_invoices_provider ON invoices(provider_id);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS idx_invoices_created ON invoices(created_at DESC);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_counter ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoices_gerant ON invoices;
DROP POLICY IF EXISTS invoices_own ON invoices;
DROP POLICY IF EXISTS counter_gerant ON invoice_counter;

CREATE POLICY invoices_gerant ON invoices FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);
CREATE POLICY invoices_own ON invoices FOR SELECT USING (
  profile_id = auth.uid()
);
CREATE POLICY counter_gerant ON invoice_counter FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);


-- ═══════════════════════════════════════════════
-- PART 8 — MODEL VIDEOS + VIDEO SESSIONS
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS model_videos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  model_id uuid REFERENCES models(id) NOT NULL,
  title text NOT NULL,
  description text,
  file_url text,
  thumbnail_url text,
  duration integer DEFAULT 0,
  file_size bigint DEFAULT 0,
  content_type text NOT NULL DEFAULT 'solo',
  mood text DEFAULT 'sexy',
  tags text[] DEFAULT '{}',
  play_count integer DEFAULT 0,
  status text DEFAULT 'active',
  uploaded_by uuid REFERENCES profiles(id),
  notes text
);

CREATE TABLE IF NOT EXISTS video_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  video_id uuid REFERENCES model_videos(id),
  model_id uuid REFERENCES models(id) NOT NULL,
  contact_id uuid,
  contact_name text,
  duration_paid integer DEFAULT 0,
  duration_real integer DEFAULT 0,
  amount numeric(10,2) DEFAULT 0,
  currency text DEFAULT 'EUR',
  status text DEFAULT 'completed',
  notes text,
  created_by uuid REFERENCES profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_model_videos_model ON model_videos(model_id);
CREATE INDEX IF NOT EXISTS idx_model_videos_type ON model_videos(content_type);
CREATE INDEX IF NOT EXISTS idx_model_videos_status ON model_videos(status);
CREATE INDEX IF NOT EXISTS idx_video_sessions_model ON video_sessions(model_id);
CREATE INDEX IF NOT EXISTS idx_video_sessions_video ON video_sessions(video_id);
CREATE INDEX IF NOT EXISTS idx_video_sessions_contact ON video_sessions(contact_id);
CREATE INDEX IF NOT EXISTS idx_video_sessions_created ON video_sessions(created_at DESC);

ALTER TABLE model_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS model_videos_gerant ON model_videos;
DROP POLICY IF EXISTS video_sessions_gerant ON video_sessions;

CREATE POLICY model_videos_gerant ON model_videos FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);
CREATE POLICY video_sessions_gerant ON video_sessions FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);


-- ═══════════════════════════════════════════════
-- PART 9 — WHATSAPP ANALYSIS LOGS
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wa_analysis_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  analyzed_by uuid REFERENCES profiles(id),
  filename text,
  contact_phone text,
  contact_name text,
  total_messages integer,
  analysis_result jsonb,
  tg_match_id uuid,
  tg_match_score integer DEFAULT 0,
  imported boolean DEFAULT false,
  spender_id uuid
);

CREATE INDEX IF NOT EXISTS idx_wa_analysis_logs_analyzed_by ON wa_analysis_logs(analyzed_by);
CREATE INDEX IF NOT EXISTS idx_wa_analysis_logs_imported ON wa_analysis_logs(imported);

ALTER TABLE wa_analysis_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wa_analysis_logs_gerant ON wa_analysis_logs;
DROP POLICY IF EXISTS wa_analysis_logs_chatter_read ON wa_analysis_logs;
DROP POLICY IF EXISTS wa_analysis_logs_chatter_insert ON wa_analysis_logs;

CREATE POLICY wa_analysis_logs_gerant ON wa_analysis_logs FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);
CREATE POLICY wa_analysis_logs_chatter_read ON wa_analysis_logs FOR SELECT USING (
  analyzed_by = auth.uid()
);
CREATE POLICY wa_analysis_logs_chatter_insert ON wa_analysis_logs FOR INSERT WITH CHECK (
  analyzed_by = auth.uid()
);


-- ═══════════════════════════════════════════════
-- PART 10 — BOT CONFIG (key/value store)
-- ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bot_config (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE bot_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bot_config_gerant ON bot_config;

CREATE POLICY bot_config_gerant ON bot_config FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);


-- ═══════════════════════════════════════════════
-- DONE — All tables created, all RLS policies set
-- ═══════════════════════════════════════════════
