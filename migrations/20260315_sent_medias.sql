-- Migration: sent_medias table
-- Tracks all media URLs sent to spenders, cross-page
-- Run once in Supabase SQL editor

CREATE TABLE IF NOT EXISTS sent_medias (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  media_url  TEXT NOT NULL,
  spender_id UUID NOT NULL,
  model_id   UUID NOT NULL,
  sent_at    TIMESTAMP DEFAULT NOW(),
  sent_via   TEXT, -- 'conversation' | 'tindada' | 'grid_premium' | 'tlg_pro'
  CONSTRAINT unique_sent_media UNIQUE(media_url, spender_id, model_id)
);

-- Index for fast lookups by spender + model
CREATE INDEX IF NOT EXISTS idx_sent_medias_lookup ON sent_medias(spender_id, model_id);

-- Index for filtering by date
CREATE INDEX IF NOT EXISTS idx_sent_medias_date ON sent_medias(sent_at DESC);

-- Row Level Security
ALTER TABLE sent_medias ENABLE ROW LEVEL SECURITY;

-- Policy: full access (adjust per your RLS strategy)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'sent_medias' AND policyname = 'Allow all operations on sent_medias'
  ) THEN
    CREATE POLICY "Allow all operations on sent_medias"
      ON sent_medias
      FOR ALL
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
