-- ═══════════════════════════════════════════════════════════════════════
-- MIGRATION: RBAC — Role-Based Access Control columns on profiles table
-- Date: 2026-03-04
--
-- ⚠️  STATUS : PROBABLEMENT DÉJÀ EN PLACE — VÉRIFIER AVANT D'EXÉCUTER
--
-- Ce qui EXISTE DÉJÀ en production :
--   ✅ profiles.role          (utilisé dans toutes les RLS policies existantes)
--   ✅ profiles.assigned_models (UUID[] — utilisé par v_chatter_models, frontend)
--   ✅ RLS transactions       (20260228_transactions_chatter_insert_rls.sql)
--      tx_all_gerant / tx_select_chatter / tx_select_provider / etc.
--   ✅ RLS spenders           (20260226_spender_pipeline_005_rls.sql)
--
-- Ce qui POURRAIT manquer (optionnel) :
--   ❓ profiles.model_id      (UUID — modèle principal d'un chatter, si non-array)
--   ❓ profiles.provider_id   (UUID — auto-référence pour les providers)
--
-- → Le frontend n'utilise PAS profiles.model_id ni profiles.provider_id directement.
--   Les providers sont identifiés par profiles.id = transactions.provider_id.
--   Les chatters utilisent profiles.assigned_models (tableau).
--
-- CONCLUSION : Tu n'as PAS besoin d'exécuter ce fichier si la DB est déjà
--              configurée avec les migrations existantes.
-- ═══════════════════════════════════════════════════════════════════════

-- (Optionnel) Ajouter model_id et provider_id si besoin dans le futur :

-- ALTER TABLE profiles
--   ADD COLUMN IF NOT EXISTS model_id UUID REFERENCES models(id) ON DELETE SET NULL;

-- ALTER TABLE profiles
--   ADD COLUMN IF NOT EXISTS provider_id UUID;

-- Mettre à jour les providers (provider_id = leur propre profiles.id) :
-- UPDATE profiles SET provider_id = id WHERE role = 'provider' AND provider_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- RÉFÉRENCE : RLS déjà appliquées (NE PAS RE-EXÉCUTER)
-- ═══════════════════════════════════════════════════════════════════════
-- Voir : migrations/20260228_transactions_chatter_insert_rls.sql
--   tx_all_gerant      → gérant voit tout
--   tx_select_chatter  → chatter voit seulement chatter_id = auth.uid()
--   tx_select_provider → provider voit seulement provider_id = auth.uid()
--
-- Voir : supabase/migrations/20260226_spender_pipeline_005_rls.sql
--   spenders ENABLE ROW LEVEL SECURITY (déjà fait)
