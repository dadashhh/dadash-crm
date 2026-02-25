-- ════════════════════════════════════════════════════════
-- Migration: bot_sessions — Sessions Telegram par modèle
-- Table pour gérer les sessions Pyrogram/Telethon du bot cam
-- ════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bot_sessions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id         UUID        REFERENCES models(id) ON DELETE SET NULL,
  model_name       TEXT        NOT NULL,
  phone_number     TEXT        NOT NULL UNIQUE,
  session_string   TEXT,
  status           TEXT        NOT NULL DEFAULT 'inactive',
  last_active_at   TIMESTAMPTZ,
  messages_today   INTEGER     NOT NULL DEFAULT 0,
  total_messages   INTEGER     NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_sessions_model_id ON bot_sessions(model_id);
CREATE INDEX IF NOT EXISTS idx_bot_sessions_status   ON bot_sessions(status);

ALTER TABLE bot_sessions ENABLE ROW LEVEL SECURITY;

-- Gérant : accès complet
CREATE POLICY bot_sessions_gerant ON bot_sessions
  FOR ALL
  TO authenticated
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
  )
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
  );

COMMENT ON TABLE bot_sessions IS
  'Sessions Telegram (Pyrogram/Telethon) par modèle, gérées via le Bot Cam Railway.';
COMMENT ON COLUMN bot_sessions.status IS
  'active | paused | inactive | error';
