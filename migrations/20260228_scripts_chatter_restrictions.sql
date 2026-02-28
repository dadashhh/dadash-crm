-- ═══════════════════════════════════════════════════════════════
-- MIGRATION: Scripts + Chatter Restrictions + Storage bucket
-- Date: 2026-02-28
-- ═══════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- TABLE: scripts
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID REFERENCES models(id) ON DELETE CASCADE,
  title VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('text','photo','video','audio')),
  content TEXT,
  media_url TEXT,
  sort_order INT DEFAULT 0,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour les requêtes par model_id
CREATE INDEX IF NOT EXISTS scripts_model_id_idx ON scripts(model_id);
CREATE INDEX IF NOT EXISTS scripts_sort_order_idx ON scripts(model_id, sort_order);

-- RLS
ALTER TABLE scripts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scripts_select_all ON scripts;
DROP POLICY IF EXISTS scripts_all_gerant ON scripts;
DROP POLICY IF EXISTS scripts_select_chatter ON scripts;

-- Gérant : accès total
CREATE POLICY scripts_all_gerant ON scripts FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);

-- Chatter : lecture uniquement des scripts de ses modèles assignés
CREATE POLICY scripts_select_chatter ON scripts FOR SELECT USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'chatter'
  AND model_id IN (
    SELECT unnest(assigned_models) FROM profiles WHERE id = auth.uid()
  )
);

-- ─────────────────────────────────────────────
-- TABLE: chatter_restrictions
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chatter_restrictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chatter_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  can_send_media BOOLEAN DEFAULT true,
  can_use_scripts BOOLEAN DEFAULT true,
  read_only BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index
CREATE INDEX IF NOT EXISTS chatter_restrictions_chatter_id_idx ON chatter_restrictions(chatter_id);

-- RLS
ALTER TABLE chatter_restrictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chatter_restrictions_all_gerant ON chatter_restrictions;
DROP POLICY IF EXISTS chatter_restrictions_select_chatter ON chatter_restrictions;

-- Gérant : accès total
CREATE POLICY chatter_restrictions_all_gerant ON chatter_restrictions FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);

-- Chatter : peut lire ses propres restrictions
CREATE POLICY chatter_restrictions_select_chatter ON chatter_restrictions FOR SELECT USING (
  chatter_id = auth.uid()
);

-- ─────────────────────────────────────────────
-- STORAGE BUCKET: scripts-media (public)
-- ─────────────────────────────────────────────
-- À exécuter dans le dashboard Supabase Storage ou via API :
-- INSERT INTO storage.buckets (id, name, public) VALUES ('scripts-media', 'scripts-media', true)
-- ON CONFLICT (id) DO UPDATE SET public = true;

-- Policies storage
-- DROP POLICY IF EXISTS "scripts-media public read" ON storage.objects;
-- CREATE POLICY "scripts-media public read" ON storage.objects FOR SELECT USING (bucket_id = 'scripts-media');
-- DROP POLICY IF EXISTS "scripts-media gerant upload" ON storage.objects;
-- CREATE POLICY "scripts-media gerant upload" ON storage.objects FOR INSERT WITH CHECK (
--   bucket_id = 'scripts-media' AND
--   (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
-- );
-- DROP POLICY IF EXISTS "scripts-media gerant delete" ON storage.objects;
-- CREATE POLICY "scripts-media gerant delete" ON storage.objects FOR DELETE USING (
--   bucket_id = 'scripts-media' AND
--   (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
-- );
