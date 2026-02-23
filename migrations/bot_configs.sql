-- =============================================
-- MIGRATION: Bot Manager — bot_configs table
-- Date: 2026-02-23
-- Manage Telegram bots from the CRM
-- =============================================

-- Table bot_configs
CREATE TABLE IF NOT EXISTS bot_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID REFERENCES models(id),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  api_id TEXT NOT NULL,
  api_hash TEXT NOT NULL,
  telegram_session TEXT,
  personality TEXT DEFAULT 'default',
  voice_id TEXT,
  twint_number TEXT,
  telegram_link TEXT,
  prices JSONB DEFAULT '{"cam_show":{"price":70,"currency":"CHF"},"sexting":{"price":30,"currency":"CHF"},"pack_contenu":{"price":50,"currency":"CHF"}}',
  payment_methods JSONB DEFAULT '{}',
  status TEXT DEFAULT 'offline' CHECK (status IN ('online','offline','error','connecting')),
  auto_start BOOLEAN DEFAULT false,
  last_activity TIMESTAMPTZ,
  messages_today INTEGER DEFAULT 0,
  revenue_today NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bot_configs_model_id ON bot_configs(model_id);
CREATE INDEX IF NOT EXISTS idx_bot_configs_status ON bot_configs(status);

-- Trigger updated_at (reuse existing function)
DROP TRIGGER IF EXISTS set_updated_at ON bot_configs;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON bot_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE bot_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bot_configs_all_gerant ON bot_configs;
CREATE POLICY bot_configs_all_gerant ON bot_configs FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);

DROP POLICY IF EXISTS bot_configs_select ON bot_configs;
CREATE POLICY bot_configs_select ON bot_configs FOR SELECT USING (true);

-- Seed: Carla as first bot
INSERT INTO bot_configs (model_id, name, phone, api_id, api_hash, personality, voice_id, twint_number, telegram_link, prices, payment_methods)
VALUES (
  '11111111-0000-0000-0000-000000000001',
  'Carla',
  '+33756918726',
  '32296445',
  '6fe4c42252b0eb0aa835c56749dc5cb8',
  'carla',
  'EXAVITQu4vr4xnSDxMaL',
  '+4156666665',
  'https://t.me/carlaxcam',
  '{"cam_show":{"price":70,"currency":"CHF","desc":"Cam show 10 min"},"sexting":{"price":30,"currency":"CHF","desc":"Sexting progressif"},"pack_contenu":{"price":50,"currency":"CHF","desc":"Pack contenu exclusif"}}',
  '{"twint":"+4156666665","revolut":"https://revolut.me/lmpitao"}'
) ON CONFLICT DO NOTHING;
