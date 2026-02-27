-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX: tg_messages upsert constraint — replace partial unique index with
-- a real UNIQUE CONSTRAINT that PostgREST can use for ON CONFLICT
--
-- Problem: PostgREST ignores partial unique indexes (WHERE clause).
-- The existing index uq_tg_messages_conv_tg_msg_id has WHERE tg_message_id IS NOT NULL,
-- which causes HTTP 400 "there is no unique or exclusion constraint matching the ON CONFLICT"
--
-- Note: tg_message_id is BIGINT in production.
--
-- Date: 2026-03-27
-- Idempotent: safe to re-run
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Step 1: Backfill NULL tg_message_id with unique negative bigints.
-- Real Telegram message IDs are always positive, so negatives never collide.
WITH to_fix AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
    FROM public.tg_messages
   WHERE tg_message_id IS NULL
)
UPDATE public.tg_messages t
   SET tg_message_id = -n.rn
  FROM to_fix n
 WHERE t.id = n.id;

-- Step 2: Set NOT NULL on tg_message_id (safe after backfill)
ALTER TABLE public.tg_messages
  ALTER COLUMN tg_message_id SET NOT NULL;

-- Step 3: Drop old partial unique index
DROP INDEX IF EXISTS public.uq_tg_messages_conv_tg_msg_id;

-- Step 4: Create proper UNIQUE CONSTRAINT (non-partial — PostgREST compatible)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'uq_tg_messages_conv_tg_msg'
       AND conrelid = 'public.tg_messages'::regclass
  ) THEN
    ALTER TABLE public.tg_messages
      ADD CONSTRAINT uq_tg_messages_conv_tg_msg
      UNIQUE (conversation_id, tg_message_id);
  END IF;
END $$;

-- Step 5: Keep the regular index for fast lookups on tg_message_id alone
CREATE INDEX IF NOT EXISTS idx_tg_messages_tg_message_id_nonpartial
  ON public.tg_messages (tg_message_id);

COMMIT;
