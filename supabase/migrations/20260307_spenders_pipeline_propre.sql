-- ═══════════════════════════════════════════════════════════════════════════════
-- PIPELINE SPENDERS PROPRE & IDÉMPOTENT
-- Single source of truth = spenders, events append-only, front lit uniquement des views
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 1 — Audit (résumé schéma détecté)
-- spenders: id, tg_user_id (UNIQUE), handle, name, display_name, telegram_username,
--           meta, status, created_at, updated_at, last_seen_at
-- spender_events: id, tg_user_id, event_type, spender_id, idempotency_key, data, created_at
--   UNIQUE(event_type, tg_user_id, idempotency_key)
-- spender_enrich_queue: id, conversation_id (UNIQUE), tg_user_id, status, attempts, ...
-- tg_conversations: id, tg_chat_id, tg_user_id, spender_id, tg_username, username, display_name
-- tg_messages: id, conversation_id, direction, text, tg_message_id, meta, created_at
-- Incohérences possibles: tg_user_id text vs bigint (cast explicite dans les views)
-- ─────────────────────────────────────────────────────────────────────────────

-- Colonnes manquantes éventuelles (additive)
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS handle TEXT;
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.spender_events ADD COLUMN IF NOT EXISTS spender_id UUID;

-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 2 — v_spenders (view stable pour l'UI)
-- Colonnes garanties: id, tg_user_id, username, display_name, meta, created_at, updated_at, last_activity_at
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_spenders;
CREATE VIEW public.v_spenders AS
SELECT
  s.id,
  s.tg_user_id,
  COALESCE(NULLIF(TRIM(s.handle), ''), s.telegram_username, s.meta->'profile'->'telegram'->>'username', CASE WHEN s.tg_user_id IS NOT NULL THEN 'tg_' || s.tg_user_id::text ELSE 'id:' || s.id::text END) AS username,
  COALESCE(NULLIF(TRIM(s.handle), ''), s.telegram_username, s.meta->'profile'->'telegram'->>'username', CASE WHEN s.tg_user_id IS NOT NULL THEN 'tg_' || s.tg_user_id::text ELSE 'id:' || s.id::text END) AS handle,
  COALESCE(NULLIF(TRIM(s.display_name), ''), NULLIF(TRIM(s.name), ''), s.meta->'profile'->'telegram'->>'display') AS display_name,
  COALESCE(NULLIF(TRIM(s.display_name), ''), NULLIF(TRIM(s.name), ''), s.meta->'profile'->'telegram'->>'display') AS name,
  COALESCE(s.meta, '{}'::jsonb) AS meta,
  COALESCE(s.created_at, now()) AS created_at,
  COALESCE(s.updated_at, s.created_at, now()) AS updated_at,
  COALESCE(s.last_seen_at, s.updated_at, s.created_at, now()) AS last_activity_at
FROM public.spenders s;

GRANT SELECT ON public.v_spenders TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 2 — v_spender_events (view stable pour l'UI)
-- Colonnes garanties: id, type, spender_id, tg_user_id, payload, created_at
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_spender_events;
CREATE VIEW public.v_spender_events AS
SELECT
  e.id,
  e.event_type AS type,
  COALESCE(e.spender_id, (SELECT id FROM public.spenders WHERE tg_user_id = e.tg_user_id LIMIT 1)) AS spender_id,
  e.tg_user_id,
  COALESCE(e.data, '{}'::jsonb) AS payload,
  e.created_at,
  COALESCE(s.handle, s.telegram_username, 'tg_' || e.tg_user_id::text) AS handle,
  (SELECT id FROM public.tg_conversations WHERE tg_user_id::text = e.tg_user_id::text LIMIT 1) AS conv_id
FROM public.spender_events e
LEFT JOIN public.spenders s ON s.tg_user_id = e.tg_user_id;

GRANT SELECT ON public.v_spender_events TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- ÉTAPE 3 — jsonb_deep_merge (helper pour merge meta)
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.jsonb_deep_merge(JSONB, JSONB);
CREATE OR REPLACE FUNCTION public.jsonb_deep_merge(a JSONB, b JSONB)
RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE r JSONB;
BEGIN
  IF a IS NULL OR a = '{}'::jsonb THEN RETURN COALESCE(b, '{}'::jsonb); END IF;
  IF b IS NULL OR b = '{}'::jsonb THEN RETURN a; END IF;
  SELECT jsonb_object_agg(COALESCE(ka, kb),
    CASE WHEN va IS NULL THEN vb WHEN vb IS NULL THEN va
         WHEN jsonb_typeof(va) = 'object' AND jsonb_typeof(vb) = 'object' THEN public.jsonb_deep_merge(va, vb)
         ELSE vb END)
  INTO r
  FROM jsonb_each(a) e1(ka, va)
  FULL OUTER JOIN jsonb_each(b) e2(kb, vb) ON ka = kb;
  RETURN COALESCE(r, '{}'::jsonb);
END;
$$;

-- Recréer fn_upsert (elle référence jsonb_deep_merge)
CREATE OR REPLACE FUNCTION public.fn_upsert_spender_from_tg(
  p_tg_user_id   BIGINT,
  p_username    TEXT DEFAULT NULL,
  p_display_name TEXT DEFAULT NULL,
  p_meta        JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id       UUID;
  v_handle   TEXT;
  v_name     TEXT;
  v_meta     JSONB;
  v_existing RECORD;
BEGIN
  v_handle := COALESCE(NULLIF(TRIM(p_username), ''), 'tg_' || p_tg_user_id::text);
  IF v_handle IS NOT NULL AND v_handle <> '' AND v_handle NOT LIKE '@%' THEN
    v_handle := '@' || v_handle;
  END IF;
  v_name := COALESCE(NULLIF(TRIM(p_display_name), ''), v_handle);

  SELECT id, meta INTO v_existing FROM public.spenders WHERE tg_user_id = p_tg_user_id LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    v_id := v_existing.id;
    v_meta := COALESCE(v_existing.meta, '{}'::jsonb);
    IF p_meta IS NOT NULL AND p_meta <> '{}'::jsonb THEN
      v_meta := public.jsonb_deep_merge(v_meta, p_meta);
    END IF;
    UPDATE public.spenders
    SET handle = COALESCE(NULLIF(TRIM(handle), ''), v_handle),
        display_name = COALESCE(NULLIF(TRIM(display_name), ''), NULLIF(TRIM(p_display_name), '')),
        name = COALESCE(NULLIF(TRIM(name), ''), v_name),
        telegram_username = COALESCE(telegram_username, TRIM(BOTH '@' FROM COALESCE(p_username, ''))),
        meta = v_meta,
        last_seen_at = now()
    WHERE id = v_id;

    INSERT INTO public.spender_events (tg_user_id, spender_id, event_type, idempotency_key, data)
    VALUES (p_tg_user_id, v_id, 'spender_enriched', 'tg:' || p_tg_user_id::text || ':enrich:' || extract(epoch from now())::bigint, jsonb_build_object('summary', 'Spender mis à jour', 'source', 'fn_upsert_spender_from_tg'))
    ON CONFLICT (event_type, tg_user_id, idempotency_key) DO NOTHING;
  ELSE
    INSERT INTO public.spenders (tg_user_id, handle, name, display_name, telegram_username, meta, status, last_seen_at)
    VALUES (p_tg_user_id, v_handle, v_name, NULLIF(TRIM(p_display_name), ''), TRIM(BOTH '@' FROM COALESCE(p_username, '')), COALESCE(p_meta, '{}'::jsonb), 'active', now())
    RETURNING id INTO v_id;

    INSERT INTO public.spender_events (tg_user_id, spender_id, event_type, idempotency_key, data)
    VALUES (p_tg_user_id, v_id, 'new_spender', 'tg:' || p_tg_user_id::text || ':created', jsonb_build_object('summary', 'Nouveau spender', 'handle', v_handle))
    ON CONFLICT (event_type, tg_user_id, idempotency_key) DO NOTHING;
  END IF;
  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_upsert_spender_from_tg(BIGINT, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_upsert_spender_from_tg(BIGINT, TEXT, TEXT, JSONB) TO service_role;
