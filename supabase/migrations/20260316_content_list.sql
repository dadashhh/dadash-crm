-- =============================================
-- MIGRATION: content_list table
-- Date: 2026-03-16
-- Fix: Table was defined in migrations/model_management.sql but never
--      added to supabase/migrations/ → never applied to the database.
--      This caused silent empty results (safe() swallows the error).
-- =============================================

-- Contenu à produire (status flow riche)
CREATE TABLE IF NOT EXISTS content_list (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  model_id uuid NOT NULL REFERENCES profiles(id),
  assigned_by uuid REFERENCES profiles(id),
  title text NOT NULL,
  description text,
  content_type text DEFAULT 'photo',
  platform text,
  status text DEFAULT 'pending',
  due_date date,
  bonus_amount numeric(10,2) DEFAULT 0,
  bonus_currency text DEFAULT 'EUR',
  completed_at timestamptz,
  notes text
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_content_list_model ON content_list(model_id);
CREATE INDEX IF NOT EXISTS idx_content_list_status ON content_list(status);

-- RLS
ALTER TABLE content_list ENABLE ROW LEVEL SECURITY;

-- Drop existing policies (idempotent)
DROP POLICY IF EXISTS content_list_gerant ON content_list;
DROP POLICY IF EXISTS content_list_model_read ON content_list;
DROP POLICY IF EXISTS content_list_model_update ON content_list;

-- Gérant: accès total
CREATE POLICY content_list_gerant ON content_list FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'gerant'
);

-- Modèle: lecture sur ses propres entrées
CREATE POLICY content_list_model_read ON content_list FOR SELECT USING (
  model_id = auth.uid()
);

-- Modèle: mise à jour sur ses propres entrées
CREATE POLICY content_list_model_update ON content_list FOR UPDATE USING (
  model_id = auth.uid()
) WITH CHECK (model_id = auth.uid());

-- Grant INSERT to authenticated (gérant inserts covered by gerant policy)
-- No extra grant needed — RLS policies handle access control.
