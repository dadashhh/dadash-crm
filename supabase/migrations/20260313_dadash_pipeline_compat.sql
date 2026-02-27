-- ═══════════════════════════════════════════════════════════════════════════════
-- DADASH — Pipeline auto + Compat layer (suite 20260313_dadash_tg_ids_zero_confusion)
-- Date: 2026-03-13
-- 1) Pipeline: trigger tg_messages + spender_events → upsert spender + enrich_queue
-- 2) Views stables: v_spenders, v_tg_conversations, v_activity_feed, v_spender_enrichments
-- 3) Adapter fn_upsert_spender_from_tg, fn_enqueue_enrich pour tg_user_id TEXT
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 0 — normalize_tg_user_id (au cas où 1er script pas exécuté ou partiel)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.normalize_tg_user_id(input_val TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_clean TEXT;
BEGIN
  IF input_val IS NULL OR trim(input_val) = '' THEN
    RETURN NULL;
  END IF;
  v_clean := regexp_replace(trim(input_val), '[^0-9]', '', 'g');
  IF v_clean = '' THEN
    RETURN NULL;
  END IF;
  RETURN v_clean;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_tg_user_id(input_val BIGINT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN input_val IS NULL THEN NULL ELSE input_val::text END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 1 — fn_upsert_spender_from_tg (TEXT tg_user_id)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_upsert_spender_from_tg(
  p_tg_user_id    TEXT,
  p_username      TEXT DEFAULT NULL,
  p_display_name  TEXT DEFAULT NULL,
  p_first_name    TEXT DEFAULT NULL,
  p_meta          JSONB DEFAULT '{}'::jsonb,
  p_source        TEXT DEFAULT 'telegram_sync'
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
  v_norm     TEXT;
  v_existing RECORD;
BEGIN
  v_norm := public.normalize_tg_user_id(p_tg_user_id);
  IF v_norm IS NULL OR v_norm = '' THEN
    RETURN NULL;
  END IF;

  v_handle := COALESCE(NULLIF(TRIM(p_username), ''), 'tg_' || v_norm);
  v_name := COALESCE(NULLIF(TRIM(p_display_name), ''), NULLIF(TRIM(p_first_name), ''), v_handle);

  SELECT id, meta INTO v_existing
    FROM public.spenders
   WHERE public.normalize_tg_user_id(tg_user_id) = v_norm
     AND is_active = true
   LIMIT 1;

  IF v_existing.id IS NOT NULL THEN
    v_id := v_existing.id;
    v_meta := COALESCE(v_existing.meta, '{}'::jsonb);
    IF p_meta IS NOT NULL AND p_meta <> '{}'::jsonb THEN
      v_meta := COALESCE(public.jsonb_deep_merge(v_meta, p_meta), v_meta);
    END IF;
    UPDATE public.spenders
    SET handle = COALESCE(NULLIF(TRIM(handle), ''), v_handle),
        display_name = COALESCE(NULLIF(TRIM(display_name), ''), NULLIF(TRIM(p_display_name), '')),
        name = COALESCE(NULLIF(TRIM(name), ''), v_name),
        first_name = COALESCE(first_name, NULLIF(TRIM(p_first_name), '')),
        telegram_username = COALESCE(telegram_username, TRIM(BOTH '@' FROM COALESCE(p_username, ''))),
        meta = v_meta,
        tg_user_id = v_norm,
        last_seen_at = now(),
        updated_at = now()
    WHERE id = v_id;

    INSERT INTO public.spender_events (tg_user_id, spender_id, event_type, idempotency_key, data)
    VALUES (v_norm, v_id, 'spender_enriched', 'tg:' || v_norm || ':sync:' || extract(epoch from now())::bigint,
      jsonb_build_object('summary', 'Spender mis à jour', 'source', p_source))
    ON CONFLICT (event_type, tg_user_id, idempotency_key) DO NOTHING;
  ELSE
    INSERT INTO public.spenders (tg_user_id, handle, name, display_name, first_name, telegram_username, meta, status, last_seen_at)
    VALUES (v_norm, v_handle, v_name, NULLIF(TRIM(p_display_name), ''), NULLIF(TRIM(p_first_name), ''),
      TRIM(BOTH '@' FROM COALESCE(p_username, '')), COALESCE(p_meta, '{}'::jsonb), 'active', now())
    RETURNING id INTO v_id;

    INSERT INTO public.spender_events (tg_user_id, spender_id, event_type, idempotency_key, data)
    VALUES (v_norm, v_id, 'new_spender', 'tg:' || v_norm || ':created',
      jsonb_build_object('summary', 'Nouveau spender', 'handle', v_handle, 'source', p_source))
    ON CONFLICT (event_type, tg_user_id, idempotency_key) DO NOTHING;
  END IF;
  RETURN v_id;
END;
$$;

-- Wrapper BIGINT pour compat (cast vers TEXT)
DROP FUNCTION IF EXISTS public.fn_upsert_spender_from_tg(BIGINT, TEXT, TEXT, TEXT, JSONB, TEXT);
DROP FUNCTION IF EXISTS public.fn_upsert_spender_from_tg(BIGINT, TEXT, TEXT, JSONB);
CREATE FUNCTION public.fn_upsert_spender_from_tg(p_tg BIGINT, p_user TEXT, p_disp TEXT, p_meta JSONB)
RETURNS UUID LANGUAGE sql SECURITY DEFINER AS $$
  SELECT public.fn_upsert_spender_from_tg(p_tg::text, p_user, p_disp, NULL, p_meta, 'telegram_sync');
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 2 — fn_enqueue_enrich (TEXT tg_user_id)
-- ═══════════════════════════════════════════════════════════════════════════════
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
        tg_user_id = EXCLUDED.tg_user_id,
        status = CASE
          WHEN spender_enrich_queue.status IN ('done', 'failed') THEN 'queued'
          ELSE spender_enrich_queue.status
        END
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Wrapper BIGINT
DROP FUNCTION IF EXISTS public.fn_enqueue_enrich(UUID, BIGINT, BIGINT);
CREATE FUNCTION public.fn_enqueue_enrich(p_conv UUID, p_tg BIGINT, p_msg BIGINT)
RETURNS UUID LANGUAGE sql SECURITY DEFINER AS $$
  SELECT public.fn_enqueue_enrich(p_conv, p_tg::text, p_msg);
$$;

-- Fix ON CONFLICT: spender_enrich_queue n'a pas UNIQUE(conversation_id) natif
-- Vérifier si l'index unique existe
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND tablename  = 'spender_enrich_queue'
       AND indexname  = 'uq_enrich_queue_conversation_id'
  ) THEN
    CREATE UNIQUE INDEX uq_enrich_queue_conversation_id
      ON public.spender_enrich_queue (conversation_id);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 3 — Trigger: tg_messages INSERT → upsert spender + enrich_queue
-- ═══════════════════════════════════════════════════════════════════════════════
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

  -- Upsert spender
  v_spender_id := public.fn_upsert_spender_from_tg(
    v_tg_user_id,
    v_username,
    v_display,
    NULLIF(TRIM(NEW.meta->>'first_name'), ''),
    COALESCE(NEW.meta, '{}'::jsonb),
    'tg_message'
  );

  -- Lier conversation au spender si pas encore
  IF v_spender_id IS NOT NULL THEN
    UPDATE public.tg_conversations
       SET spender_id = v_spender_id,
           tg_user_id = public.normalize_tg_user_id(v_tg_user_id)
     WHERE id = v_conv_id
       AND spender_id IS NULL;
  END IF;

  -- Alimenter enrich_queue
  PERFORM public.fn_enqueue_enrich(
    v_conv_id,
    v_tg_user_id,
    CASE WHEN NEW.tg_message_id ~ '^\d+$' THEN (NEW.tg_message_id)::bigint ELSE NULL END
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_message_ensure_spender ON public.tg_messages;
CREATE TRIGGER trg_on_message_ensure_spender
  AFTER INSERT ON public.tg_messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_on_message_ensure_spender();

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 4 — Trigger: spender_events INSERT → upsert spender si absent
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.tg_on_spender_event_ensure_spender()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_norm       TEXT;
  v_spender_id UUID;
BEGIN
  -- Normaliser tg_user_id pour cohérence
  v_norm := public.normalize_tg_user_id(NEW.tg_user_id::text);
  IF v_norm IS NOT NULL AND v_norm <> '' THEN
    NEW.tg_user_id := v_norm;
  END IF;
  IF v_norm IS NULL OR v_norm = '' THEN
    RETURN NEW;
  END IF;

  -- Vérifier si spender existe
  SELECT id INTO v_spender_id
    FROM public.spenders
   WHERE public.normalize_tg_user_id(tg_user_id) = v_norm
     AND is_active = true
   LIMIT 1;

  IF v_spender_id IS NULL THEN
    -- Créer spender minimal
    v_spender_id := public.fn_upsert_spender_from_tg(
      NEW.tg_user_id,
      NULL,
      NULL,
      NULL,
      COALESCE(NEW.data, '{}'::jsonb),
      'spender_event'
    );
    IF v_spender_id IS NOT NULL THEN
      NEW.spender_id := v_spender_id;
    END IF;
  ELSE
    NEW.spender_id := COALESCE(NEW.spender_id, v_spender_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_spender_event_ensure_spender ON public.spender_events;
CREATE TRIGGER trg_on_spender_event_ensure_spender
  BEFORE INSERT ON public.spender_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_on_spender_event_ensure_spender();

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 5 — Views stables (compat layer)
-- v_spenders, v_tg_conversations, v_activity_feed, v_spender_enrichments
-- tg_username = coalesce(username, meta->'profile'->>'username', ...)
-- ═══════════════════════════════════════════════════════════════════════════════

-- v_spenders (filtrer is_active, tg_user_id TEXT)
DROP VIEW IF EXISTS public.v_spenders;
CREATE VIEW public.v_spenders AS
SELECT
  s.id,
  s.tg_user_id,
  COALESCE(NULLIF(TRIM(s.handle), ''), s.telegram_username, s.meta->'profile'->'telegram'->>'username',
    CASE WHEN s.tg_user_id IS NOT NULL THEN 'tg_' || s.tg_user_id ELSE 'id:' || s.id::text END) AS username,
  COALESCE(NULLIF(TRIM(s.handle), ''), s.telegram_username, s.meta->'profile'->'telegram'->>'username',
    CASE WHEN s.tg_user_id IS NOT NULL THEN 'tg_' || s.tg_user_id ELSE 'id:' || s.id::text END) AS handle,
  COALESCE(NULLIF(TRIM(s.display_name), ''), NULLIF(TRIM(s.name), ''), s.meta->'profile'->'telegram'->>'display') AS display_name,
  COALESCE(NULLIF(TRIM(s.display_name), ''), NULLIF(TRIM(s.name), ''), s.meta->'profile'->'telegram'->>'display') AS name,
  COALESCE(s.first_name, s.meta->'profile'->'identity'->>'first_name', s.meta->'profile'->>'first_name') AS first_name,
  COALESCE(s.age, (s.meta->'profile'->'identity'->>'age')::int, (s.meta->'profile'->>'age')::int) AS age,
  COALESCE(s.job, s.meta->'profile'->>'job') AS job,
  COALESCE(s.city, s.meta->'profile'->'location'->>'city', s.meta->'profile'->>'city') AS city,
  COALESCE(s.country, s.meta->'profile'->'location'->>'country', s.meta->'profile'->>'country') AS country,
  COALESCE(s.langue, s.meta->'profile'->>'language', s.meta->'profile'->>'langue') AS language,
  COALESCE(s.notes, s.meta->'profile'->>'notes_chatter') AS notes,
  COALESCE(s.meta, '{}'::jsonb) AS meta,
  COALESCE(s.status, 'active') AS status,
  s.telegram_username,
  s.whatsapp_phone,
  s.classification,
  s.source,
  COALESCE(s.created_at, now()) AS created_at,
  COALESCE(s.updated_at, s.created_at, now()) AS updated_at,
  COALESCE(s.last_seen_at, s.updated_at, s.created_at, now()) AS last_activity_at
FROM public.spenders s
WHERE s.is_active = true;

-- v_tg_conversations (tg_username = coalesce(...))
DROP VIEW IF EXISTS public.v_tg_conversations;
CREATE VIEW public.v_tg_conversations AS
SELECT
  c.id,
  c.tg_chat_id,
  COALESCE(c.tg_peer_id, c.tg_chat_id) AS tg_peer_id,
  c.tg_user_id,
  c.spender_id,
  c.model_id,
  c.assigned_chatter_id,
  c.status,
  c.last_message_at,
  c.created_at,
  COALESCE(NULLIF(TRIM(c.tg_username), ''), NULLIF(TRIM(c.username), ''), s.telegram_username,
    s.meta->'profile'->'telegram'->>'username', 'tg_' || COALESCE(c.tg_user_id, c.tg_chat_id)) AS tg_username,
  COALESCE(NULLIF(TRIM(c.username), ''), NULLIF(TRIM(c.tg_username), ''), s.telegram_username,
    s.meta->'profile'->'telegram'->>'username', 'tg_' || COALESCE(c.tg_user_id, c.tg_chat_id)) AS username,
  COALESCE(NULLIF(TRIM(c.display_name), ''), NULLIF(TRIM(c.tg_display_name), ''), s.name,
    s.meta->'profile'->'telegram'->>'display', 'tg_' || COALESCE(c.tg_user_id, c.tg_chat_id)) AS display_name
FROM public.tg_conversations c
LEFT JOIN LATERAL (
  SELECT s2.* FROM public.spenders s2
  WHERE (s2.id = c.spender_id OR (c.tg_user_id IS NOT NULL AND public.normalize_tg_user_id(s2.tg_user_id) = public.normalize_tg_user_id(c.tg_user_id)))
    AND s2.is_active = true
  ORDER BY CASE WHEN s2.id = c.spender_id THEN 0 ELSE 1 END
  LIMIT 1
) s ON true;

-- v_activity_feed (3 catégories: new_spender, enrichment, message)
DROP VIEW IF EXISTS public.v_activity_messages;
DROP VIEW IF EXISTS public.v_activity_enrichments;
DROP VIEW IF EXISTS public.v_activity_new_spenders;
DROP VIEW IF EXISTS public.v_activity_feed;

CREATE VIEW public.v_activity_feed AS
-- 1) NEW SPENDER
SELECT
  e.id,
  'new_spender'::text AS type,
  e.tg_user_id,
  (SELECT c.tg_chat_id FROM public.tg_conversations c
   WHERE public.normalize_tg_user_id(c.tg_user_id) = public.normalize_tg_user_id(e.tg_user_id)
      OR (c.tg_chat_id ~ '^\d+$' AND c.tg_chat_id = e.tg_user_id)
   LIMIT 1) AS tg_peer_id,
  COALESCE(e.spender_id, (SELECT id FROM public.spenders WHERE public.normalize_tg_user_id(tg_user_id) = public.normalize_tg_user_id(e.tg_user_id) AND is_active = true LIMIT 1)) AS spender_id,
  COALESCE(s.handle, s.telegram_username, 'tg_' || e.tg_user_id) AS title,
  'Nouveau spender' AS subtitle,
  COALESCE(e.data->>'source', e.data->>'summary', '') AS detail,
  e.created_at,
  jsonb_build_object('summary', e.data->>'summary', 'source', e.data->>'source', 'event_type', e.event_type) || COALESCE(e.data, '{}'::jsonb) AS payload
FROM public.spender_events e
LEFT JOIN public.spenders s ON public.normalize_tg_user_id(s.tg_user_id) = public.normalize_tg_user_id(e.tg_user_id) AND s.is_active = true
WHERE e.event_type IN ('new_spender', 'spender_created')

UNION ALL
-- 2) ENRICHMENT
SELECT
  e.id,
  'enrichment'::text AS type,
  e.tg_user_id,
  (SELECT c.tg_chat_id FROM public.tg_conversations c
   WHERE public.normalize_tg_user_id(c.tg_user_id) = public.normalize_tg_user_id(e.tg_user_id)
      OR (c.tg_chat_id ~ '^\d+$' AND c.tg_chat_id = e.tg_user_id)
   LIMIT 1) AS tg_peer_id,
  COALESCE(e.spender_id, (SELECT id FROM public.spenders WHERE public.normalize_tg_user_id(tg_user_id) = public.normalize_tg_user_id(e.tg_user_id) AND is_active = true LIMIT 1)) AS spender_id,
  COALESCE(s.handle, s.telegram_username, 'tg_' || e.tg_user_id) AS title,
  'Profil mis à jour' AS subtitle,
  public.fn_activity_enrich_detail(COALESCE(e.data, '{}'::jsonb)) AS detail,
  e.created_at,
  jsonb_build_object('summary', e.data->>'summary', 'fields', e.data->'fields', 'event_type', e.event_type) || COALESCE(e.data, '{}'::jsonb) AS payload
FROM public.spender_events e
LEFT JOIN public.spenders s ON public.normalize_tg_user_id(s.tg_user_id) = public.normalize_tg_user_id(e.tg_user_id) AND s.is_active = true
WHERE e.event_type IN ('profile_updated', 'enriched', 'spender_enriched', 'classification_changed', 'handle_set', 'status_changed')

UNION ALL
-- 3) MESSAGE
SELECT
  m.id,
  'message'::text AS type,
  public.normalize_tg_user_id(COALESCE(m.meta->>'tg_user_id', c.tg_user_id::text, c.tg_chat_id)) AS tg_user_id,
  c.tg_chat_id AS tg_peer_id,
  COALESCE(c.spender_id, (SELECT id FROM public.spenders WHERE public.normalize_tg_user_id(tg_user_id) = public.normalize_tg_user_id(COALESCE(m.meta->>'tg_user_id', c.tg_user_id::text, c.tg_chat_id)) AND is_active = true LIMIT 1)) AS spender_id,
  COALESCE(s.handle, s.telegram_username, c.tg_username, 'tg_' || COALESCE(m.meta->>'tg_user_id', c.tg_chat_id)) AS title,
  CASE m.direction WHEN 'in' THEN 'Message entrant' ELSE 'Message envoyé' END AS subtitle,
  COALESCE(NULLIF(trim(m.text), ''), m.meta->>'text', '[sans texte]') AS detail,
  m.created_at,
  jsonb_build_object('text', left(COALESCE(m.text, ''), 500), 'direction', m.direction, 'tg_message_id', m.tg_message_id, 'conversation_id', m.conversation_id) AS payload
FROM public.tg_messages m
LEFT JOIN public.tg_conversations c ON c.id = m.conversation_id
LEFT JOIN public.spenders s ON s.id = c.spender_id AND s.is_active = true;

-- Vues par onglet
CREATE VIEW public.v_activity_new_spenders AS SELECT * FROM public.v_activity_feed WHERE type = 'new_spender';
CREATE VIEW public.v_activity_enrichments AS SELECT * FROM public.v_activity_feed WHERE type = 'enrichment';
CREATE VIEW public.v_activity_messages AS SELECT * FROM public.v_activity_feed WHERE type = 'message';

-- v_spender_enrichments (alias v_spender_enrich_queue pour compat)
DROP VIEW IF EXISTS public.v_spender_enrichments;
DROP VIEW IF EXISTS public.v_spender_enrich_queue;
CREATE VIEW public.v_spender_enrichments AS
SELECT
  q.id,
  q.conversation_id,
  q.tg_user_id,
  q.status,
  q.attempts,
  q.error,
  q.locked_at,
  q.locked_by,
  q.last_message_id,
  q.updated_at,
  q.created_at
FROM public.spender_enrich_queue q;

CREATE VIEW public.v_spender_enrich_queue AS SELECT * FROM public.v_spender_enrichments;

-- v_tg_messages (compat front)
DROP VIEW IF EXISTS public.v_tg_messages;
CREATE VIEW public.v_tg_messages AS
SELECT
  m.id,
  m.conversation_id,
  m.direction,
  m.text,
  m.tg_message_id,
  m.created_at,
  COALESCE(m.meta, '{}'::jsonb) AS meta,
  public.normalize_tg_user_id(m.meta->>'tg_user_id') AS tg_user_id,
  m.meta->>'username' AS username,
  m.meta->>'display_name' AS display_name
FROM public.tg_messages m;

-- v_spender_events (compat front)
DROP VIEW IF EXISTS public.v_spender_events;
CREATE VIEW public.v_spender_events AS
SELECT
  e.id,
  e.event_type AS type,
  e.tg_user_id,
  COALESCE(e.spender_id, (SELECT id FROM public.spenders WHERE public.normalize_tg_user_id(tg_user_id) = public.normalize_tg_user_id(e.tg_user_id) AND is_active = true LIMIT 1)) AS spender_id,
  COALESCE(e.data, '{}'::jsonb) AS payload,
  e.created_at,
  COALESCE(s.handle, s.telegram_username, s.name, 'tg_' || e.tg_user_id) AS handle,
  (SELECT id FROM public.tg_conversations
   WHERE public.normalize_tg_user_id(tg_user_id) = public.normalize_tg_user_id(e.tg_user_id)
      OR (tg_chat_id ~ '^\d+$' AND tg_chat_id = e.tg_user_id)
   LIMIT 1) AS conv_id
FROM public.spender_events e
LEFT JOIN public.spenders s ON public.normalize_tg_user_id(s.tg_user_id) = public.normalize_tg_user_id(e.tg_user_id) AND s.is_active = true;

-- Grants
GRANT SELECT ON public.v_spenders TO authenticated;
GRANT SELECT ON public.v_tg_conversations TO authenticated;
GRANT SELECT ON public.v_tg_messages TO authenticated;
GRANT SELECT ON public.v_activity_feed TO authenticated;
GRANT SELECT ON public.v_activity_new_spenders TO authenticated;
GRANT SELECT ON public.v_activity_enrichments TO authenticated;
GRANT SELECT ON public.v_activity_messages TO authenticated;
GRANT SELECT ON public.v_spender_enrichments TO authenticated;
GRANT SELECT ON public.v_spender_enrich_queue TO authenticated;
GRANT SELECT ON public.v_spender_events TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 6 — fn_apply_spender_enrichment (TEXT tg_user_id pour compat)
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fn_apply_spender_enrichment(
  p_spender_id   UUID,
  p_tg_user_id   TEXT,
  p_enrichment   JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_meta      JSONB;
  v_added     TEXT[] := '{}';
  v_updated   TEXT[] := '{}';
  v_profile   JSONB;
  v_identity  JSONB;
  v_location  JSONB;
  v_tg_norm   TEXT;
BEGIN
  v_tg_norm := public.normalize_tg_user_id(p_tg_user_id);
  IF v_tg_norm IS NULL THEN v_tg_norm := p_tg_user_id::text; END IF;

  IF p_enrichment IS NULL OR p_enrichment = '{}'::jsonb THEN
    RETURN jsonb_build_object('added', '[]'::jsonb, 'updated', '[]'::jsonb);
  END IF;

  SELECT meta INTO v_meta FROM public.spenders WHERE id = p_spender_id;
  IF v_meta IS NULL THEN v_meta := '{}'::jsonb; END IF;

  v_profile := COALESCE(v_meta->'profile', '{}'::jsonb);
  v_identity := COALESCE(v_profile->'identity', '{}'::jsonb);
  v_location := COALESCE(v_profile->'location', '{}'::jsonb);

  IF p_enrichment ? 'age' AND p_enrichment->'age' IS NOT NULL THEN
    v_identity := v_identity || jsonb_build_object('age', (p_enrichment->>'age')::int);
    v_added := array_append(v_added, 'age');
  END IF;
  IF p_enrichment ? 'first_name' AND p_enrichment->>'first_name' <> '' THEN
    v_identity := v_identity || jsonb_build_object('first_name', p_enrichment->>'first_name');
    v_added := array_append(v_added, 'first_name');
  END IF;
  IF p_enrichment ? 'city' AND p_enrichment->>'city' <> '' THEN
    v_location := v_location || jsonb_build_object('city', p_enrichment->>'city');
    v_added := array_append(v_added, 'city');
  END IF;
  IF p_enrichment ? 'country' AND p_enrichment->>'country' <> '' THEN
    v_location := v_location || jsonb_build_object('country', p_enrichment->>'country');
    v_added := array_append(v_added, 'country');
  END IF;
  IF p_enrichment ? 'job' THEN
    v_profile := v_profile || jsonb_build_object('job', p_enrichment->'job');
    v_added := array_append(v_added, 'job');
  END IF;
  IF p_enrichment ? 'language' OR p_enrichment ? 'langue' THEN
    v_profile := v_profile || jsonb_build_object('language', COALESCE(p_enrichment->>'language', p_enrichment->>'langue'));
    v_added := array_append(v_added, 'language');
  END IF;
  IF p_enrichment ? 'notes' OR p_enrichment ? 'notes_chatter' THEN
    v_profile := v_profile || jsonb_build_object('notes_chatter', COALESCE(p_enrichment->>'notes', p_enrichment->>'notes_chatter'));
    v_added := array_append(v_added, 'notes');
  END IF;
  IF p_enrichment ? 'relationship_status' THEN
    v_profile := v_profile || jsonb_build_object('relationship_status', p_enrichment->>'relationship_status');
    v_added := array_append(v_added, 'relationship_status');
  END IF;
  IF p_enrichment ? 'budget_range' THEN
    v_profile := v_profile || jsonb_build_object('budget_range', p_enrichment->>'budget_range');
    v_added := array_append(v_added, 'budget_range');
  END IF;
  IF p_enrichment ? 'whatsapp_phone' THEN
    v_profile := v_profile || jsonb_build_object('whatsapp_phone', p_enrichment->>'whatsapp_phone');
    v_added := array_append(v_added, 'whatsapp_phone');
  END IF;

  v_profile := v_profile || jsonb_build_object('identity', v_identity, 'location', v_location);
  v_meta := v_meta || jsonb_build_object('profile', v_profile);

  UPDATE public.spenders SET
    meta = v_meta,
    first_name = COALESCE(first_name, NULLIF(p_enrichment->>'first_name', '')),
    age = COALESCE(age, (p_enrichment->>'age')::int),
    job = COALESCE(job, p_enrichment->>'job'),
    city = COALESCE(city, p_enrichment->>'city'),
    country = COALESCE(country, p_enrichment->>'country'),
    langue = COALESCE(langue, p_enrichment->>'language', p_enrichment->>'langue'),
    notes = COALESCE(notes, p_enrichment->>'notes', p_enrichment->>'notes_chatter'),
    relationship_status = COALESCE(relationship_status, p_enrichment->>'relationship_status'),
    budget_range = COALESCE(budget_range, p_enrichment->>'budget_range'),
    whatsapp_phone = COALESCE(whatsapp_phone, p_enrichment->>'whatsapp_phone'),
    updated_at = now()
  WHERE id = p_spender_id;

  INSERT INTO public.spender_events (tg_user_id, spender_id, event_type, idempotency_key, data)
  VALUES (v_tg_norm, p_spender_id, 'profile_updated',
    'enrich:' || p_spender_id::text || ':' || extract(epoch from now())::bigint,
    jsonb_build_object(
      'summary', 'Enrichment: ' || array_to_string(v_added, ', '),
      'fields', to_jsonb(v_added),
      'added', to_jsonb(v_added),
      'updated', to_jsonb(v_updated),
      'enrichment', p_enrichment
    ))
  ON CONFLICT (event_type, tg_user_id, idempotency_key) DO NOTHING;

  RETURN jsonb_build_object('added', to_jsonb(v_added), 'updated', to_jsonb(v_updated));
END;
$$;

DROP FUNCTION IF EXISTS public.fn_apply_spender_enrichment(UUID, BIGINT, JSONB);
CREATE FUNCTION public.fn_apply_spender_enrichment(
  p_spender_id UUID, p_tg_user_id BIGINT, p_enrichment JSONB
)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER AS $$
  SELECT public.fn_apply_spender_enrichment(p_spender_id, p_tg_user_id::text, p_enrichment);
$$;

GRANT EXECUTE ON FUNCTION public.fn_apply_spender_enrichment(UUID, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_apply_spender_enrichment(UUID, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.fn_apply_spender_enrichment(UUID, BIGINT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_apply_spender_enrichment(UUID, BIGINT, JSONB) TO service_role;
