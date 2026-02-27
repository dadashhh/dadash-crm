-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 001: spenders — source of truth (état courant)
-- Pipeline: Telegram → Spender
-- Date: 2026-02-26
-- Safe to re-run: IF NOT EXISTS, DO blocks with existence checks
-- Backward compatible: no column drops, additive only
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Ensure tg_user_id column exists as BIGINT
--    Handles: column missing, column is text, column is already bigint
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  col_type text;
BEGIN
  SELECT data_type INTO col_type
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'spenders'
     AND column_name  = 'tg_user_id';

  IF col_type IS NULL THEN
    ALTER TABLE public.spenders ADD COLUMN tg_user_id BIGINT;
  ELSIF col_type <> 'bigint' THEN
    ALTER TABLE public.spenders
      ALTER COLUMN tg_user_id TYPE BIGINT USING tg_user_id::bigint;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Add missing columns (additive, backward compatible)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS meta        JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ DEFAULT now();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. UNIQUE constraint on tg_user_id (idempotence guarantee)
--    Only rows with non-null tg_user_id; allows legacy rows without it
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename  = 'spenders'
       AND indexname   = 'uq_spenders_tg_user_id'
  ) THEN
    CREATE UNIQUE INDEX uq_spenders_tg_user_id
      ON public.spenders (tg_user_id)
     WHERE tg_user_id IS NOT NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Indexes for common query patterns
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_spenders_updated_at
  ON public.spenders (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_spenders_last_seen_at
  ON public.spenders (last_seen_at DESC NULLS LAST);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Trigger: auto-update updated_at on every UPDATE
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_spenders_updated_at ON public.spenders;
CREATE TRIGGER trg_spenders_updated_at
  BEFORE UPDATE ON public.spenders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
