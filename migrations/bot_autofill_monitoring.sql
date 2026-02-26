-- =============================================
-- BOT AUTOFILL MONITORING
-- Tables pour le monitoring du Bot Autofill (Telegram Autofill)
-- Date: 2026-02-26
-- =============================================

-- A) bot_runs — 1 row par bot, heartbeat
CREATE TABLE IF NOT EXISTS bot_runs (
  bot_name text PRIMARY KEY,
  status text NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'paused', 'offline', 'degraded')),
  last_heartbeat_at timestamptz,
  started_at timestamptz,
  version text,
  meta jsonb DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bot_runs_bot_name ON bot_runs(bot_name);
CREATE INDEX IF NOT EXISTS idx_bot_runs_status ON bot_runs(status);
CREATE INDEX IF NOT EXISTS idx_bot_runs_last_heartbeat ON bot_runs(last_heartbeat_at DESC);

-- B) bot_events — feed d'évènements safe
CREATE TABLE IF NOT EXISTS bot_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_name text NOT NULL,
  level text NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warn', 'error')),
  event_type text NOT NULL,
  message text,
  created_at timestamptz DEFAULT now(),
  meta jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_bot_events_bot_name ON bot_events(bot_name);
CREATE INDEX IF NOT EXISTS idx_bot_events_created_at ON bot_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_events_level ON bot_events(level);

-- C) bot_daily_metrics — stats du jour
CREATE TABLE IF NOT EXISTS bot_daily_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_name text NOT NULL,
  day date NOT NULL,
  msgs_ingested integer DEFAULT 0,
  spenders_created integer DEFAULT 0,
  spenders_updated integer DEFAULT 0,
  errors_count integer DEFAULT 0,
  enrich_pending integer DEFAULT 0,
  enrich_done integer DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(bot_name, day)
);

CREATE INDEX IF NOT EXISTS idx_bot_daily_metrics_bot_day ON bot_daily_metrics(bot_name, day DESC);

-- D) bot_commands — commandes envoyées au bot
CREATE TABLE IF NOT EXISTS bot_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bot_name text NOT NULL,
  command text NOT NULL CHECK (command IN ('connect', 'pause', 'resume', 'restart')),
  requested_by uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ack', 'done', 'error')),
  created_at timestamptz DEFAULT now(),
  meta jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_bot_commands_bot_name ON bot_commands(bot_name);
CREATE INDEX IF NOT EXISTS idx_bot_commands_created_at ON bot_commands(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_commands_status ON bot_commands(status);

-- RLS
ALTER TABLE bot_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_commands ENABLE ROW LEVEL SECURITY;

-- Lecture publique (pour monitoring), écriture gerant
DROP POLICY IF EXISTS bot_runs_select ON bot_runs;
DROP POLICY IF EXISTS bot_runs_all_gerant ON bot_runs;
CREATE POLICY bot_runs_select ON bot_runs FOR SELECT USING (true);
CREATE POLICY bot_runs_all_gerant ON bot_runs FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);

DROP POLICY IF EXISTS bot_events_select ON bot_events;
DROP POLICY IF EXISTS bot_events_all_gerant ON bot_events;
CREATE POLICY bot_events_select ON bot_events FOR SELECT USING (true);
CREATE POLICY bot_events_all_gerant ON bot_events FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);

DROP POLICY IF EXISTS bot_daily_metrics_select ON bot_daily_metrics;
DROP POLICY IF EXISTS bot_daily_metrics_all_gerant ON bot_daily_metrics;
CREATE POLICY bot_daily_metrics_select ON bot_daily_metrics FOR SELECT USING (true);
CREATE POLICY bot_daily_metrics_all_gerant ON bot_daily_metrics FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);

DROP POLICY IF EXISTS bot_commands_select ON bot_commands;
DROP POLICY IF EXISTS bot_commands_insert ON bot_commands;
DROP POLICY IF EXISTS bot_commands_all_gerant ON bot_commands;
CREATE POLICY bot_commands_select ON bot_commands FOR SELECT USING (true);
CREATE POLICY bot_commands_insert ON bot_commands FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY bot_commands_all_gerant ON bot_commands FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);
