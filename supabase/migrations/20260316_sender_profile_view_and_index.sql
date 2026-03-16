-- ═══════════════════════════════════════════════════════════════
-- Migration: Add sender_profile_id to v_tg_messages view
-- + Ensure index on tg_messages.sender_profile_id for join perf
-- Date: 2026-03-16
-- Purpose: Allow frontend to display sender name (Gérant/Chatter)
--          next to each outgoing message via profiles join
-- ═══════════════════════════════════════════════════════════════

-- 1. Index for fast join on sender_profile_id
CREATE INDEX IF NOT EXISTS idx_tg_messages_sender_profile_id
  ON tg_messages(sender_profile_id)
  WHERE sender_profile_id IS NOT NULL;

-- 2. Recreate v_tg_messages to include sender_profile_id
DROP VIEW IF EXISTS public.v_tg_messages;
CREATE VIEW public.v_tg_messages AS
SELECT
  m.id,
  m.conversation_id,
  m.direction,
  m.text,
  m.tg_message_id,
  m.sender_profile_id,
  m.created_at,
  COALESCE(m.meta, '{}'::jsonb) AS meta,
  public.normalize_tg_user_id(m.meta->>'tg_user_id') AS tg_user_id,
  m.meta->>'username' AS username,
  m.meta->>'display_name' AS display_name
FROM public.tg_messages m;

-- 3. Grant same permissions as before
GRANT SELECT ON public.v_tg_messages TO authenticated;
GRANT SELECT ON public.v_tg_messages TO anon;
