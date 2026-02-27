-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 003: spender_enrich_queue — orchestration (idempotent, anti double-run)
-- Pipeline: Telegram → Spender
-- Date: 2026-02-26
-- Safe to re-run: IF NOT EXISTS, DROP IF EXISTS
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Create queue table
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.spender_enrich_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL,
  tg_user_id      BIGINT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'processing', 'done', 'failed')),
  attempts        INTEGER NOT NULL DEFAULT 0,
  error           TEXT NULL,
  locked_at       TIMESTAMPTZ NULL,
  locked_by       TEXT NULL,
  last_message_id BIGINT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. UNIQUE on conversation_id — one queue entry per conversation
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename  = 'spender_enrich_queue'
       AND indexname   = 'uq_enrich_queue_conversation_id'
  ) THEN
    CREATE UNIQUE INDEX uq_enrich_queue_conversation_id
      ON public.spender_enrich_queue (conversation_id);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Composite index for worker polling: status + updated_at
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_enrich_queue_status_updated
  ON public.spender_enrich_queue (status, updated_at ASC);

CREATE INDEX IF NOT EXISTS idx_enrich_queue_tg_user_id
  ON public.spender_enrich_queue (tg_user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Trigger: auto-update updated_at
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_enrich_queue_updated_at ON public.spender_enrich_queue;
CREATE TRIGGER trg_enrich_queue_updated_at
  BEFORE UPDATE ON public.spender_enrich_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Helper: claim next queued item (anti double-run)
--    Returns the claimed row or NULL if queue is empty.
--    Uses SELECT … FOR UPDATE SKIP LOCKED for safe concurrency.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_claim_enrich_job(p_worker_id TEXT)
RETURNS SETOF public.spender_enrich_queue
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row public.spender_enrich_queue;
BEGIN
  SELECT * INTO v_row
    FROM public.spender_enrich_queue
   WHERE status = 'queued'
     AND (locked_at IS NULL OR locked_at < now() - INTERVAL '5 minutes')
   ORDER BY updated_at ASC
   LIMIT 1
     FOR UPDATE SKIP LOCKED;

  IF v_row.id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.spender_enrich_queue
     SET status    = 'processing',
         locked_at = now(),
         locked_by = p_worker_id,
         attempts  = attempts + 1
   WHERE id = v_row.id;

  v_row.status    := 'processing';
  v_row.locked_at := now();
  v_row.locked_by := p_worker_id;
  v_row.attempts  := v_row.attempts + 1;

  RETURN NEXT v_row;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Helper: complete or fail an enrich job
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_complete_enrich_job(
  p_job_id UUID,
  p_status TEXT,
  p_error  TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_status NOT IN ('done', 'failed') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be done or failed.', p_status;
  END IF;

  UPDATE public.spender_enrich_queue
     SET status    = p_status,
         error     = p_error,
         locked_at = NULL,
         locked_by = NULL
   WHERE id = p_job_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Helper: enqueue (idempotent — ON CONFLICT updates last_message_id only)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_enqueue_enrich(
  p_conversation_id UUID,
  p_tg_user_id      BIGINT,
  p_last_message_id  BIGINT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.spender_enrich_queue (conversation_id, tg_user_id, last_message_id)
  VALUES (p_conversation_id, p_tg_user_id, p_last_message_id)
  ON CONFLICT (conversation_id) DO UPDATE
    SET last_message_id = COALESCE(EXCLUDED.last_message_id, spender_enrich_queue.last_message_id),
        status = CASE
          WHEN spender_enrich_queue.status IN ('done', 'failed')
          THEN 'queued'
          ELSE spender_enrich_queue.status
        END
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
