-- broadcast_history: Historique des broadcasts envoyés pour analytics
CREATE TABLE IF NOT EXISTS broadcast_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  model_id TEXT NOT NULL,
  audience_id TEXT,
  audience_name TEXT,
  message TEXT,
  has_media BOOLEAN DEFAULT false,
  media_type TEXT,
  total_recipients INT NOT NULL,
  sent_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  read_count INT DEFAULT 0,
  reply_count INT DEFAULT 0,
  revenue_generated DECIMAL DEFAULT 0,
  avg_response_time INT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_broadcast_history_user       ON broadcast_history(user_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_history_model      ON broadcast_history(model_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_history_audience   ON broadcast_history(audience_id);
CREATE INDEX IF NOT EXISTS idx_broadcast_history_sent_at    ON broadcast_history(sent_at DESC);

ALTER TABLE broadcast_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "broadcast_history_gerant_all" ON broadcast_history
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('gerant', 'admin', 'ceo')
    )
  );
