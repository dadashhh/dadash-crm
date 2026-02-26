-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 007: tg_messages dedup — UNIQUE index for idempotent message ingestion
-- Pipeline: Telegram → Spender
-- Date: 2026-02-26
-- Safe to re-run: IF NOT EXISTS via DO block
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename  = 'tg_messages'
       AND indexname   = 'uq_tg_messages_conv_tg_msg_id'
  ) THEN
    CREATE UNIQUE INDEX uq_tg_messages_conv_tg_msg_id
      ON public.tg_messages (conversation_id, tg_message_id)
     WHERE tg_message_id IS NOT NULL;
  END IF;
END $$;
