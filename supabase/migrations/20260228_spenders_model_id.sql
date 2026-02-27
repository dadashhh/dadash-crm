-- ═══════════════════════════════════════════════════════════════════════════════
-- spenders.model_id — pour filtrage chatter par modèle assigné
-- Date: 2026-02-28
-- Permet: SELECT * FROM spenders WHERE model_id IN (assigned_models)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS model_id UUID REFERENCES public.models(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_spenders_model_id ON public.spenders (model_id) WHERE model_id IS NOT NULL;
