-- media_library: Bibliothèque de médias réutilisables pour les scripts
CREATE TABLE IF NOT EXISTS media_library (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('photo', 'video', 'audio')),
  url TEXT NOT NULL,
  file_size BIGINT,
  usage_count INT DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_media_type ON media_library(type);
CREATE INDEX IF NOT EXISTS idx_media_user ON media_library(user_id);

ALTER TABLE media_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "media_lib_gerant_all" ON media_library
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('gerant', 'admin', 'ceo')
    )
  );

-- Storage bucket for media library files (run manually if bucket doesn't exist)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('media-library', 'media-library', true)
-- ON CONFLICT (id) DO NOTHING;
