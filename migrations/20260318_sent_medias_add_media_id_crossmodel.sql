-- Migration: Add media_id column + cross-model index to sent_medias
-- Enables unified cross-model greying (lookup by spender_id only)
-- Run in Supabase SQL editor

-- Add media_id column (nullable — not all sends have a library ID)
ALTER TABLE sent_medias ADD COLUMN IF NOT EXISTS media_id UUID;

-- Index for cross-model lookups (spender_id only, no model_id filter)
CREATE INDEX IF NOT EXISTS idx_sent_medias_spender ON sent_medias(spender_id);

-- Make media_url nullable (some sends may only have media_id)
ALTER TABLE sent_medias ALTER COLUMN media_url DROP NOT NULL;

-- Make model_id nullable (for cross-model tracking flexibility)
ALTER TABLE sent_medias ALTER COLUMN model_id DROP NOT NULL;
