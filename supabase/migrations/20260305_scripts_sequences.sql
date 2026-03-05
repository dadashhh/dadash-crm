-- scripts_sequences: Multi-step script sequences with audience targeting and media support
-- This is a separate table from the existing `scripts` table (which stores individual messages).
-- This table stores full sequences (multi-step campaigns) used in the Script Builder.

CREATE TABLE IF NOT EXISTS scripts_sequences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('vente', 'relance', 'accueil', 'upsell')),
  model_id TEXT NOT NULL,
  target_audiences TEXT[] DEFAULT '{}',
  sequence JSONB NOT NULL DEFAULT '[]',
  variables_used TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  stats JSONB DEFAULT '{"total_sent": 0, "success_rate": 0, "avg_revenue": 0}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scripts_seq_model ON scripts_sequences(model_id);
CREATE INDEX IF NOT EXISTS idx_scripts_seq_category ON scripts_sequences(category);
CREATE INDEX IF NOT EXISTS idx_scripts_seq_active ON scripts_sequences(is_active);
CREATE INDEX IF NOT EXISTS idx_scripts_seq_user ON scripts_sequences(user_id);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_scripts_sequences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_scripts_sequences_updated_at ON scripts_sequences;
CREATE TRIGGER trg_scripts_sequences_updated_at
  BEFORE UPDATE ON scripts_sequences
  FOR EACH ROW EXECUTE FUNCTION update_scripts_sequences_updated_at();

-- RLS
ALTER TABLE scripts_sequences ENABLE ROW LEVEL SECURITY;

-- Gerant/admin/ceo can do everything
CREATE POLICY "scripts_seq_gerant_all" ON scripts_sequences
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('gerant', 'admin', 'ceo')
    )
  );
