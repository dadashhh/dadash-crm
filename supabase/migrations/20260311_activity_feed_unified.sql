-- ═══════════════════════════════════════════════════════════════════════════════
-- ACTIVITY FEED UNIFIÉ — v_activity_feed
-- Une seule VIEW: new_spender + enrichment + message
-- Colonnes: id, type, tg_user_id, tg_peer_id, spender_id, title, subtitle, detail, created_at, payload
-- ═══════════════════════════════════════════════════════════════════════════════

-- Helper: extrait le détail enrichissement depuis payload (before/after, patch, fields, summary)
CREATE OR REPLACE FUNCTION public.fn_activity_enrich_detail(p JSONB)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_fields jsonb;
  v_summary text;
  v_added text[];
  k text;
  v_out text := '';
BEGIN
  -- 1. added_fields ou patch (array)
  v_fields := p->'added_fields';
  IF v_fields IS NULL THEN v_fields := p->'fields'; END IF;
  IF v_fields IS NULL AND jsonb_typeof(p->'patch') = 'object' THEN
    SELECT array_agg(key) INTO v_added FROM jsonb_object_keys(p->'patch') AS key;
    IF v_added IS NOT NULL AND array_length(v_added, 1) > 0 THEN
      RETURN '+' || array_to_string(v_added, ', +');
    END IF;
  END IF;
  IF v_fields IS NOT NULL AND jsonb_typeof(v_fields) = 'array' THEN
    SELECT string_agg('+' || elem, ', ') INTO v_out
    FROM jsonb_array_elements_text(v_fields) AS elem;
    IF v_out IS NOT NULL AND v_out <> '' THEN RETURN v_out; END IF;
  END IF;
  -- 2. before/after: liste les clés différentes (simplifié)
  IF p ? 'after' AND jsonb_typeof(p->'after') = 'object' THEN
    SELECT string_agg('+' || key, ', ') INTO v_out
    FROM jsonb_object_keys(p->'after') AS key
    WHERE (p->'before'->key IS NULL OR p->'before'->key IS DISTINCT FROM p->'after'->key)
      AND p->'after'->key IS NOT NULL AND p->'after'->key <> '""'::jsonb;
    IF v_out IS NOT NULL AND v_out <> '' THEN RETURN v_out; END IF;
  END IF;
  -- 3. summary
  v_summary := p->>'summary';
  IF v_summary IS NOT NULL AND trim(v_summary) <> '' THEN RETURN v_summary; END IF;
  RETURN 'Profil mis à jour';
END;
$$;

-- Drop anciennes vues (remplacées par v_activity_feed)
DROP VIEW IF EXISTS public.v_activity_feed;
DROP VIEW IF EXISTS public.v_activity_new_spenders;
DROP VIEW IF EXISTS public.v_activity_enrichments;
DROP VIEW IF EXISTS public.v_activity_messages;

-- ═══ v_activity_feed UNIFIÉE ═══
CREATE VIEW public.v_activity_feed AS
-- 1) NEW SPENDER (spender_events: new_spender, spender_created)
SELECT
  e.id,
  'new_spender'::text AS type,
  e.tg_user_id,
  (SELECT c.tg_chat_id FROM public.tg_conversations c
   WHERE (c.tg_user_id::text = e.tg_user_id::text OR (c.tg_chat_id ~ '^\d+$' AND c.tg_chat_id = e.tg_user_id::text))
   LIMIT 1) AS tg_peer_id,
  COALESCE(e.spender_id, (SELECT id FROM public.spenders WHERE tg_user_id = e.tg_user_id LIMIT 1)) AS spender_id,
  COALESCE(
    CASE WHEN s.telegram_username IS NOT NULL AND trim(s.telegram_username) <> '' THEN '@' || replace(trim(s.telegram_username), '@', '')
         WHEN s.handle IS NOT NULL AND trim(s.handle) <> '' THEN s.handle
         ELSE 'tg_' || e.tg_user_id::text END,
    'tg_' || e.tg_user_id::text
  ) AS title,
  'Nouveau spender' AS subtitle,
  COALESCE(e.data->>'source', e.data->>'summary', '') AS detail,
  e.created_at,
  jsonb_build_object(
    'summary', e.data->>'summary',
    'source', e.data->>'source',
    'event_type', e.event_type
  ) || COALESCE(e.data, '{}'::jsonb) AS payload
FROM public.spender_events e
LEFT JOIN public.spenders s ON s.tg_user_id = e.tg_user_id
WHERE e.event_type IN ('new_spender', 'spender_created')

UNION ALL

-- 2) SPENDER ENRICHMENT (profile_updated, enriched, spender_enriched, etc.)
SELECT
  e.id,
  'enrichment'::text AS type,
  e.tg_user_id,
  (SELECT c.tg_chat_id FROM public.tg_conversations c
   WHERE (c.tg_user_id::text = e.tg_user_id::text OR (c.tg_chat_id ~ '^\d+$' AND c.tg_chat_id = e.tg_user_id::text))
   LIMIT 1) AS tg_peer_id,
  COALESCE(e.spender_id, (SELECT id FROM public.spenders WHERE tg_user_id = e.tg_user_id LIMIT 1)) AS spender_id,
  COALESCE(
    CASE WHEN s.telegram_username IS NOT NULL AND trim(s.telegram_username) <> '' THEN '@' || replace(trim(s.telegram_username), '@', '')
         WHEN s.handle IS NOT NULL AND trim(s.handle) <> '' THEN s.handle
         ELSE 'tg_' || e.tg_user_id::text END,
    'tg_' || e.tg_user_id::text
  ) AS title,
  'Profil mis à jour' AS subtitle,
  public.fn_activity_enrich_detail(COALESCE(e.data, '{}'::jsonb)) AS detail,
  e.created_at,
  jsonb_build_object(
    'summary', e.data->>'summary',
    'fields', e.data->'fields',
    'event_type', e.event_type
  ) || COALESCE(e.data, '{}'::jsonb) AS payload
FROM public.spender_events e
LEFT JOIN public.spenders s ON s.tg_user_id = e.tg_user_id
WHERE e.event_type IN ('profile_updated', 'enriched', 'spender_enriched', 'classification_changed', 'handle_set', 'status_changed')

UNION ALL

-- 3) NEW MESSAGES (tg_messages)
SELECT
  m.id,
  'message'::text AS type,
  CASE WHEN (m.meta->>'tg_user_id') ~ '^\d+$' THEN (m.meta->>'tg_user_id')::BIGINT
       WHEN c.tg_user_id IS NOT NULL AND (c.tg_user_id::text) ~ '^\d+$' THEN (c.tg_user_id::text)::BIGINT
       WHEN c.tg_chat_id ~ '^\d+$' THEN (c.tg_chat_id)::BIGINT
       ELSE NULL::BIGINT END AS tg_user_id,
  c.tg_chat_id AS tg_peer_id,
  COALESCE(c.spender_id, (SELECT id FROM public.spenders WHERE tg_user_id::text = COALESCE(m.meta->>'tg_user_id', c.tg_user_id::text, c.tg_chat_id) LIMIT 1)) AS spender_id,
  COALESCE(
    CASE WHEN s.telegram_username IS NOT NULL AND trim(s.telegram_username) <> '' THEN '@' || replace(trim(s.telegram_username), '@', '')
         WHEN s.handle IS NOT NULL AND trim(s.handle) <> '' THEN s.handle
         WHEN c.tg_username IS NOT NULL AND trim(c.tg_username) <> '' THEN c.tg_username
         ELSE 'tg_' || COALESCE(m.meta->>'tg_user_id', c.tg_chat_id) END,
    'tg_unknown'
  ) AS title,
  CASE m.direction WHEN 'in' THEN 'Message entrant' ELSE 'Message envoyé' END AS subtitle,
  COALESCE(NULLIF(trim(m.text), ''), m.meta->>'text', '[sans texte]') AS detail,
  m.created_at,
  jsonb_build_object(
    'text', LEFT(COALESCE(m.text, ''), 500),
    'direction', m.direction,
    'tg_message_id', m.tg_message_id,
    'conversation_id', m.conversation_id
  ) AS payload
FROM public.tg_messages m
LEFT JOIN public.tg_conversations c ON c.id = m.conversation_id
LEFT JOIN public.spenders s ON s.tg_user_id::text = COALESCE(m.meta->>'tg_user_id', c.tg_user_id::text, c.tg_chat_id);

GRANT SELECT ON public.v_activity_feed TO authenticated;

-- Vues par onglet (alias pour compat)
CREATE VIEW public.v_activity_new_spenders AS
SELECT * FROM public.v_activity_feed WHERE type = 'new_spender';

CREATE VIEW public.v_activity_enrichments AS
SELECT * FROM public.v_activity_feed WHERE type = 'enrichment';

CREATE VIEW public.v_activity_messages AS
SELECT * FROM public.v_activity_feed WHERE type = 'message';

GRANT SELECT ON public.v_activity_new_spenders TO authenticated;
GRANT SELECT ON public.v_activity_enrichments TO authenticated;
GRANT SELECT ON public.v_activity_messages TO authenticated;
