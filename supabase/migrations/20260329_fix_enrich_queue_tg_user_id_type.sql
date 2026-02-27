-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX spender_enrich_queue.tg_user_id BIGINT → TEXT
-- Résout: ERROR 42804 column "tg_user_id" is of type bigint but expression is of type text
--         dans fn_enqueue_enrich() → trigger tg_on_message_ensure_spender()
-- Idempotent
-- Date: 2026-03-29
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Convertir spender_enrich_queue.tg_user_id BIGINT → TEXT
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  col_type TEXT;
BEGIN
  SELECT data_type INTO col_type
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'spender_enrich_queue'
     AND column_name  = 'tg_user_id';

  IF col_type = 'bigint' THEN
    ALTER TABLE public.spender_enrich_queue
      ALTER COLUMN tg_user_id TYPE TEXT USING tg_user_id::text;
  ELSIF col_type IS NULL THEN
    ALTER TABLE public.spender_enrich_queue ADD COLUMN tg_user_id TEXT;
  END IF;
  -- Si déjà TEXT: rien à faire
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) fn_enqueue_enrich (TEXT) — version canonique avec cast défensif
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_enqueue_enrich(
  p_conversation_id UUID,
  p_tg_user_id      TEXT,
  p_last_message_id BIGINT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id   UUID;
  v_norm TEXT;
BEGIN
  v_norm := public.normalize_tg_user_id(p_tg_user_id);
  IF v_norm IS NULL OR v_norm = '' THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.spender_enrich_queue (conversation_id, tg_user_id, last_message_id)
  VALUES (p_conversation_id, v_norm, p_last_message_id)
  ON CONFLICT (conversation_id) DO UPDATE
    SET last_message_id = COALESCE(EXCLUDED.last_message_id, spender_enrich_queue.last_message_id),
        tg_user_id      = EXCLUDED.tg_user_id,
        status          = CASE
          WHEN spender_enrich_queue.status IN ('done', 'failed') THEN 'queued'
          ELSE spender_enrich_queue.status
        END
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Wrapper BIGINT pour compat (cast → TEXT)
DROP FUNCTION IF EXISTS public.fn_enqueue_enrich(UUID, BIGINT, BIGINT);
CREATE FUNCTION public.fn_enqueue_enrich(p_conv UUID, p_tg BIGINT, p_msg BIGINT)
RETURNS UUID LANGUAGE sql SECURITY DEFINER AS $$
  SELECT public.fn_enqueue_enrich(p_conv, p_tg::text, p_msg);
$$;

GRANT EXECUTE ON FUNCTION public.fn_enqueue_enrich(UUID, TEXT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_enqueue_enrich(UUID, TEXT, BIGINT) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_enqueue_enrich(UUID, BIGINT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_enqueue_enrich(UUID, BIGINT, BIGINT) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Recréer le trigger tg_on_message_ensure_spender avec cast défensif
--    (tg_message_id peut être TEXT ou BIGINT selon la table)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_on_message_ensure_spender()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tg_user_id TEXT;
  v_conv_id    UUID;
  v_tg_chat    TEXT;
  v_username   TEXT;
  v_display    TEXT;
  v_spender_id UUID;
  v_msg_id     BIGINT;
BEGIN
  v_conv_id := NEW.conversation_id;

  -- Extraire tg_user_id depuis meta ou conversation
  v_tg_user_id := NULLIF(TRIM(NEW.meta->>'tg_user_id'), '');
  IF v_tg_user_id IS NULL THEN
    SELECT tg_user_id, tg_chat_id INTO v_tg_user_id, v_tg_chat
      FROM public.tg_conversations
     WHERE id = v_conv_id;
    v_tg_user_id := COALESCE(v_tg_user_id, v_tg_chat);
  END IF;

  IF v_tg_user_id IS NULL OR public.normalize_tg_user_id(v_tg_user_id) IS NULL THEN
    RETURN NEW;
  END IF;

  v_username := NULLIF(TRIM(NEW.meta->>'username'), '');
  v_display  := NULLIF(TRIM(NEW.meta->>'display_name'), '');

  -- Upsert spender (best-effort via fn_upsert déjà patché)
  v_spender_id := public.fn_upsert_spender_from_tg(
    v_tg_user_id,
    v_username,
    v_display,
    NULLIF(TRIM(NEW.meta->>'first_name'), ''),
    COALESCE(NEW.meta, '{}'::jsonb),
    'tg_message'
  );

  -- Lier conversation au spender si pas encore fait
  IF v_spender_id IS NOT NULL THEN
    UPDATE public.tg_conversations
       SET spender_id = v_spender_id,
           tg_user_id = public.normalize_tg_user_id(v_tg_user_id)
     WHERE id = v_conv_id
       AND spender_id IS NULL;
  END IF;

  -- Extraire tg_message_id en BIGINT de façon défensive
  BEGIN
    v_msg_id := CASE
      WHEN NEW.tg_message_id IS NOT NULL
       AND NEW.tg_message_id::text ~ '^\d+$'
      THEN NEW.tg_message_id::text::bigint
      ELSE NULL
    END;
  EXCEPTION WHEN OTHERS THEN
    v_msg_id := NULL;
  END;

  -- Alimenter enrich_queue (best-effort)
  BEGIN
    PERFORM public.fn_enqueue_enrich(v_conv_id, v_tg_user_id, v_msg_id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'fn_enqueue_enrich failed (conv=%, tg=%): %', v_conv_id, v_tg_user_id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_message_ensure_spender ON public.tg_messages;
CREATE TRIGGER trg_on_message_ensure_spender
  AFTER INSERT ON public.tg_messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_on_message_ensure_spender();
