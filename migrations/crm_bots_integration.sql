-- =============================================
-- PHASE 4: CRM ↔ Bots Integration
-- =============================================

-- Alertes temps réel
CREATE TABLE IF NOT EXISTS alerts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  type text NOT NULL,
  message text NOT NULL,
  spender_id uuid,
  tx_id uuid,
  model_id uuid,
  dismissed boolean DEFAULT false,
  metadata jsonb
);

-- Stats bots par canal
CREATE TABLE IF NOT EXISTS bot_stats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  timestamp timestamptz DEFAULT now(),
  model_id uuid,
  channel text NOT NULL,
  messages_sent integer DEFAULT 0,
  messages_received integer DEFAULT 0,
  screenshots_scanned integer DEFAULT 0,
  tx_created integer DEFAULT 0,
  escalations integer DEFAULT 0,
  errors integer DEFAULT 0
);

-- Enrichir spenders
ALTER TABLE spenders ADD COLUMN IF NOT EXISTS telegram_id text;
ALTER TABLE spenders ADD COLUMN IF NOT EXISTS whatsapp_phone text;
ALTER TABLE spenders ADD COLUMN IF NOT EXISTS age integer;
ALTER TABLE spenders ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE spenders ADD COLUMN IF NOT EXISTS job text;
ALTER TABLE spenders ADD COLUMN IF NOT EXISTS classification text DEFAULT 'new';
ALTER TABLE spenders ADD COLUMN IF NOT EXISTS last_contact_date timestamptz;
ALTER TABLE spenders ADD COLUMN IF NOT EXISTS source text;

-- Index
CREATE INDEX IF NOT EXISTS idx_alerts_type ON alerts(type);
CREATE INDEX IF NOT EXISTS idx_alerts_dismissed ON alerts(dismissed);
CREATE INDEX IF NOT EXISTS idx_bot_stats_channel ON bot_stats(channel, timestamp);
CREATE INDEX IF NOT EXISTS idx_spenders_classification ON spenders(classification);

-- RLS
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_stats ENABLE ROW LEVEL SECURITY;

-- alerts: gérant all
CREATE POLICY alerts_gerant ON alerts FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);

-- bot_stats: gérant all, chatters read
CREATE POLICY bot_stats_gerant ON bot_stats FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);
CREATE POLICY bot_stats_read ON bot_stats FOR SELECT USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('chatter', 'provider')
);
