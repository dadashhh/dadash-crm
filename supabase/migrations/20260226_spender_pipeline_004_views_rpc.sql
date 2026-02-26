-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 004: v_activity_feed + fn_get_activity_feed
-- Pipeline: Telegram → Spender
-- Date: 2026-02-26
-- Safe to re-run: CREATE OR REPLACE
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. VIEW v_activity_feed
--    Joins spender_events with spenders to produce a UI-ready activity feed.
--    Falls back gracefully when spender row is missing.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_activity_feed AS
SELECT
  e.id,
  e.event_type,
  e.tg_user_id,
  COALESCE(s.handle, s.name, s.telegram_username, 'tg_' || e.tg_user_id::text)
    AS username,
  -- title: human-readable label per event type
  CASE e.event_type
    WHEN 'new_spender'            THEN 'Nouveau spender'
    WHEN 'profile_updated'        THEN 'Profil mis à jour'
    WHEN 'new_message'            THEN 'Nouveau message'
    WHEN 'status_changed'         THEN 'Statut changé'
    WHEN 'classification_changed' THEN 'Classification changée'
    WHEN 'spender_created'        THEN 'Spender créé'
    WHEN 'tx_created'             THEN 'Transaction créée'
    WHEN 'handle_set'             THEN 'Handle défini'
    ELSE COALESCE(e.event_type, 'Événement')
  END AS title,
  -- subtitle: summary from data or legacy summary column
  COALESCE(
    e.data ->> 'summary',
    e.data ->> 'message',
    CASE
      WHEN e.data <> '{}'::jsonb THEN e.event_type || ' — ' || COALESCE(s.handle, 'tg_' || e.tg_user_id::text)
      ELSE NULL
    END
  ) AS subtitle,
  e.created_at,
  e.data
FROM public.spender_events e
LEFT JOIN public.spenders s
  ON s.tg_user_id = e.tg_user_id
ORDER BY e.created_at DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RPC fn_get_activity_feed(limit, offset, event_type_filter)
--    Paginated activity feed for UI.
--    Filters are optional (NULL = no filter).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_get_activity_feed(
  p_limit  INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_event_type TEXT DEFAULT NULL
)
RETURNS TABLE (
  id          UUID,
  event_type  TEXT,
  tg_user_id  BIGINT,
  username    TEXT,
  title       TEXT,
  subtitle    TEXT,
  created_at  TIMESTAMPTZ,
  data        JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.id,
    v.event_type,
    v.tg_user_id,
    v.username,
    v.title,
    v.subtitle,
    v.created_at,
    v.data
  FROM public.v_activity_feed v
  WHERE (p_event_type IS NULL OR v.event_type = p_event_type)
  ORDER BY v.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RPC fn_insert_spender_event (idempotent insert for worker/bot)
--    ON CONFLICT dedup → no error, returns existing or new id.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_insert_spender_event(
  p_tg_user_id      BIGINT,
  p_event_type      TEXT,
  p_idempotency_key TEXT,
  p_data            JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.spender_events (tg_user_id, event_type, idempotency_key, data)
  VALUES (p_tg_user_id, p_event_type, p_idempotency_key, p_data)
  ON CONFLICT (event_type, tg_user_id, idempotency_key) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id
      FROM public.spender_events
     WHERE event_type      = p_event_type
       AND tg_user_id      = p_tg_user_id
       AND idempotency_key = p_idempotency_key;
  END IF;

  RETURN v_id;
END;
$$;
