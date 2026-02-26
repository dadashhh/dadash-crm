-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 002: spender_events — event log immuable (audit + UI activity feed)
-- Pipeline: Telegram → Spender
-- Date: 2026-02-26
-- Safe to re-run: IF NOT EXISTS, DO blocks, DROP IF EXISTS
-- Backward compatible: additive columns, no drops
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Ensure table exists (minimal, might already exist from older migration)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.spender_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_user_id  BIGINT NOT NULL,
  event_type  TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  data        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Migrate tg_user_id to BIGINT if currently text
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  col_type text;
BEGIN
  SELECT data_type INTO col_type
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'spender_events'
     AND column_name  = 'tg_user_id';

  IF col_type IS NOT NULL AND col_type <> 'bigint' THEN
    ALTER TABLE public.spender_events
      ALTER COLUMN tg_user_id TYPE BIGINT USING tg_user_id::bigint;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Add missing columns (backward compatible for older schema versions)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.spender_events ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE public.spender_events ADD COLUMN IF NOT EXISTS data JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Backfill idempotency_key for existing rows without one
UPDATE public.spender_events
   SET idempotency_key = id::text
 WHERE idempotency_key IS NULL;

-- Now make it NOT NULL
DO $$
DECLARE
  is_nullable text;
BEGIN
  SELECT c.is_nullable INTO is_nullable
    FROM information_schema.columns c
   WHERE c.table_schema = 'public'
     AND c.table_name   = 'spender_events'
     AND c.column_name  = 'idempotency_key';

  IF is_nullable = 'YES' THEN
    ALTER TABLE public.spender_events
      ALTER COLUMN idempotency_key SET NOT NULL;
  END IF;
END $$;

-- Make tg_user_id NOT NULL (backfill 0 for legacy rows)
UPDATE public.spender_events SET tg_user_id = 0 WHERE tg_user_id IS NULL;

DO $$
DECLARE
  is_nullable text;
BEGIN
  SELECT c.is_nullable INTO is_nullable
    FROM information_schema.columns c
   WHERE c.table_schema = 'public'
     AND c.table_name   = 'spender_events'
     AND c.column_name  = 'tg_user_id';

  IF is_nullable = 'YES' THEN
    ALTER TABLE public.spender_events
      ALTER COLUMN tg_user_id SET NOT NULL;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. CHECK constraint on event_type
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
     WHERE constraint_schema = 'public'
       AND constraint_name   = 'chk_spender_events_event_type'
  ) THEN
    ALTER TABLE public.spender_events
      ADD CONSTRAINT chk_spender_events_event_type
      CHECK (event_type IN (
        'new_spender',
        'profile_updated',
        'new_message',
        'status_changed',
        'classification_changed',
        'spender_created',
        'tx_created',
        'handle_set',
        'unknown'
      ));
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. UNIQUE constraint for idempotency deduplication
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename  = 'spender_events'
       AND indexname   = 'uq_spender_events_dedup'
  ) THEN
    CREATE UNIQUE INDEX uq_spender_events_dedup
      ON public.spender_events (event_type, tg_user_id, idempotency_key);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Indexes for feed queries
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_spender_events_created_at
  ON public.spender_events (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_spender_events_tg_user_id
  ON public.spender_events (tg_user_id);

CREATE INDEX IF NOT EXISTS idx_spender_events_event_type
  ON public.spender_events (event_type);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Trigger: updated_at (if column exists from legacy schema)
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS spender_events_updated_at ON public.spender_events;
