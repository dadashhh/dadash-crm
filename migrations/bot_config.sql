-- =============================================
-- Bot Config — persistent key/value store
-- Used for: paused models, bot settings
-- =============================================

CREATE TABLE IF NOT EXISTS bot_config (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz DEFAULT now()
);

-- RLS: service_role only (bot uses service key)
ALTER TABLE bot_config ENABLE ROW LEVEL SECURITY;

-- Gérant can read via CRM
CREATE POLICY bot_config_gerant ON bot_config FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);
