-- =============================================
-- PHASE: Video Management System
-- Tables: model_videos + video_sessions
-- =============================================

-- Bibliothèque de vidéos des modèles
CREATE TABLE IF NOT EXISTS model_videos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),

  -- Vidéo
  model_id uuid REFERENCES models(id) NOT NULL,
  title text NOT NULL,
  description text,
  file_url text,                        -- URL Supabase Storage
  thumbnail_url text,                   -- URL thumbnail (première frame)
  duration integer DEFAULT 0,           -- Durée en secondes
  file_size bigint DEFAULT 0,           -- Taille en bytes

  -- Classification
  content_type text NOT NULL DEFAULT 'solo',  -- 'douche', 'chambre', 'lingerie', 'custom', 'solo'
  mood text DEFAULT 'sexy',                    -- 'sexy', 'cute', 'wild', 'romantic', 'playful', 'intense'
  tags text[] DEFAULT '{}',                    -- Tags libres

  -- Stats
  play_count integer DEFAULT 0,
  status text DEFAULT 'active',         -- 'active', 'inactive'

  -- Metadata
  uploaded_by uuid REFERENCES profiles(id),
  notes text
);

-- Sessions vidéo (quand un client regarde une vidéo)
CREATE TABLE IF NOT EXISTS video_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),

  -- Session
  video_id uuid REFERENCES model_videos(id),
  model_id uuid REFERENCES models(id) NOT NULL,
  contact_id uuid,                      -- Lien vers spender (client)
  contact_name text,                    -- Nom du client (fallback)

  -- Durée
  duration_paid integer DEFAULT 0,      -- Durée payée en secondes
  duration_real integer DEFAULT 0,      -- Durée réelle en secondes

  -- Financier
  amount numeric(10,2) DEFAULT 0,
  currency text DEFAULT 'EUR',

  -- Status
  status text DEFAULT 'completed',      -- 'completed', 'cancelled', 'refunded', 'in_progress'

  -- Metadata
  notes text,
  created_by uuid REFERENCES profiles(id)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_model_videos_model ON model_videos(model_id);
CREATE INDEX IF NOT EXISTS idx_model_videos_type ON model_videos(content_type);
CREATE INDEX IF NOT EXISTS idx_model_videos_status ON model_videos(status);
CREATE INDEX IF NOT EXISTS idx_video_sessions_model ON video_sessions(model_id);
CREATE INDEX IF NOT EXISTS idx_video_sessions_video ON video_sessions(video_id);
CREATE INDEX IF NOT EXISTS idx_video_sessions_contact ON video_sessions(contact_id);
CREATE INDEX IF NOT EXISTS idx_video_sessions_created ON video_sessions(created_at DESC);

-- RLS
ALTER TABLE model_videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE video_sessions ENABLE ROW LEVEL SECURITY;

-- Gérant : tout
CREATE POLICY model_videos_gerant ON model_videos FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);
CREATE POLICY video_sessions_gerant ON video_sessions FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);

-- Supabase Storage bucket (à créer manuellement dans le dashboard)
-- Bucket name: model-videos
-- Public: false (accès via signed URLs)
