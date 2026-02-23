-- =============================================
-- BOTS MANAGEMENT: bot_configs + bot_logs
-- Tables for the Bots Management page
-- Date: 2026-02-23
-- =============================================

-- Table 1: Bot Configurations
CREATE TABLE IF NOT EXISTS bot_configs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  bot_name text NOT NULL UNIQUE,
  enabled boolean DEFAULT true,
  config jsonb DEFAULT '{}',
  last_status text DEFAULT 'unknown',
  last_status_update timestamp DEFAULT now(),
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Indexes for frequent queries
CREATE INDEX IF NOT EXISTS idx_bot_configs_bot_name ON bot_configs(bot_name);
CREATE INDEX IF NOT EXISTS idx_bot_configs_enabled ON bot_configs(enabled);

-- Table 2: Bot Logs
CREATE TABLE IF NOT EXISTS bot_logs (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  bot_name text NOT NULL,
  event text NOT NULL,
  data jsonb DEFAULT '{}',
  created_at timestamp DEFAULT now()
);

-- Indexes for queries
CREATE INDEX IF NOT EXISTS idx_bot_logs_bot_name ON bot_logs(bot_name);
CREATE INDEX IF NOT EXISTS idx_bot_logs_created_at ON bot_logs(created_at DESC);

-- RLS: public read, gérant full access
ALTER TABLE bot_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY bot_configs_select ON bot_configs FOR SELECT USING (true);
CREATE POLICY bot_configs_all_gerant ON bot_configs FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);

CREATE POLICY bot_logs_select ON bot_logs FOR SELECT USING (true);
CREATE POLICY bot_logs_all_gerant ON bot_logs FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);

-- Seed data: 3 bots
INSERT INTO bot_configs (bot_name, config) VALUES
(
  'chatting',
  '{
    "personality": "Charming v9",
    "mode": "auto",
    "max_messages_per_day": 1000,
    "language": "FR"
  }'::jsonb
),
(
  'scan',
  '{
    "confidence_threshold": 85,
    "max_file_size_mb": 5,
    "allowed_formats": ["JPG", "PNG", "WEBP"],
    "auto_delete_days": 30
  }'::jsonb
),
(
  'cam',
  '{
    "max_concurrent_calls": 5,
    "queue_timeout": 30,
    "fallback_enabled": true,
    "pause_incoming": false,
    "categories": ["shower", "bedroom", "lingerie", "outdoor", "custom"]
  }'::jsonb
)
ON CONFLICT (bot_name) DO UPDATE SET config = EXCLUDED.config;

-- Seed logs for testing
INSERT INTO bot_logs (bot_name, event, data) VALUES
('chatting', 'bot_started', '{"timestamp": "now", "status": "success"}'),
('scan', 'upload_processed', '{"filename": "test.jpg", "status": "success"}'),
('cam', 'call_initiated', '{"user_id": "12345", "duration": 300}');
