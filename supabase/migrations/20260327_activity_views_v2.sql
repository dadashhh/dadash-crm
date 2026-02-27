-- ═══════════════════════════════════════════════════════════════════════════════
-- ACTIVITY VIEWS v2 — consistent columns across all 3 tabs + unified feed
-- Columns: id, type, event_type, tg_user_id, tg_user_id_text, spender_id,
--          title, subtitle, detail, created_at, payload
-- ═══════════════════════════════════════════════════════════════════════════════

-- Helper: extract enrichment diff detail from event payload
CREATE OR REPLACE FUNCTION public.fn_activity_enrich_detail(p JSONB)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_fields jsonb;
  v_added text[];
  v_out text := '';
BEGIN
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
  IF p ? 'after' AND jsonb_typeof(p->'after') = 'object' THEN
    SELECT string_agg('+' || key, ', ') INTO v_out
    FROM jsonb_object_keys(p->'after') AS key
    WHERE (p->'before'->key IS NULL OR p->'before'->key IS DISTINCT FROM p->'after'->key)
      AND p->'after'->key IS NOT NULL AND p->'after'->key <> '""'::jsonb;
    IF v_out IS NOT NULL AND v_out <> '' THEN RETURN v_out; END IF;
  END IF;
  IF (p->>'summary') IS NOT NULL AND trim(p->>'summary') <> '' THEN
    RETURN p->>'summary';
  END IF;
  RETURN 'Profil mis à jour';
END;
$$;

DROP VIEW IF EXISTS public.v_activity_new_spenders CASCADE;
DROP VIEW IF EXISTS public.v_activity_enrichments CASCADE;
DROP VIEW IF EXISTS public.v_activity_messages CASCADE;
DROP VIEW IF EXISTS public.v_activity_feed CASCADE;

-- ═══ v_activity_feed UNIFIED ═══
CREATE VIEW public.v_activity_feed AS

-- 1) NEW SPENDER
SELECT
  e.id,
  'new_spender'::text AS type,
  'new_spender'::text AS event_type,
  e.tg_user_id,
  (e.tg_user_id)::text AS tg_user_id_text,
  COALESCE(e.spender_id, (SELECT id FROM public.spenders WHERE tg_user_id = e.tg_user_id LIMIT 1)) AS spender_id,
  COALESCE(
    NULLIF(trim(s.telegram_username), ''),
    NULLIF(trim(s.handle), ''),
    'tg_' || e.tg_user_id::text
  ) AS title,
  'Nouveau spender' AS subtitle,
  COALESCE(e.data->>'source', e.data->>'summary', '') AS detail,
  e.created_at,
  COALESCE(e.data, '{}'::jsonb) AS payload
FROM public.spender_events e
LEFT JOIN public.spenders s ON s.tg_user_id = e.tg_user_id
WHERE e.event_type IN ('new_spender', 'spender_created')

UNION ALL

-- 2) ENRICHMENT
SELECT
  e.id,
  'enrichment'::text AS type,
  COALESCE(e.event_type, 'enrichment')::text AS event_type,
  e.tg_user_id,
  (e.tg_user_id)::text AS tg_user_id_text,
  COALESCE(e.spender_id, (SELECT id FROM public.spenders WHERE tg_user_id = e.tg_user_id LIMIT 1)) AS spender_id,
  COALESCE(
    NULLIF(trim(s.telegram_username), ''),
    NULLIF(trim(s.handle), ''),
    'tg_' || e.tg_user_id::text
  ) AS title,
  CASE e.event_type
    WHEN 'profile_updated' THEN 'Profil mis à jour'
    WHEN 'enriched' THEN 'Enrichi'
    WHEN 'spender_enriched' THEN 'Spender enrichi'
    WHEN 'classification_changed' THEN 'Classification changée'
    WHEN 'handle_set' THEN 'Handle défini'
    WHEN 'status_changed' THEN 'Statut changé'
    ELSE 'Enrichment'
  END AS subtitle,
  public.fn_activity_enrich_detail(COALESCE(e.data, '{}'::jsonb)) AS detail,
  e.created_at,
  COALESCE(e.data, '{}'::jsonb) AS payload
FROM public.spender_events e
LEFT JOIN public.spenders s ON s.tg_user_id = e.tg_user_id
WHERE e.event_type IN ('profile_updated', 'enriched', 'spender_enriched',
                        'classification_changed', 'handle_set', 'status_changed')

UNION ALL

-- 3) MESSAGES
SELECT
  m.id,
  'message'::text AS type,
  'message'::text AS event_type,
  CASE WHEN (m.meta->>'tg_user_id') ~ '^\d+$' THEN (m.meta->>'tg_user_id')::BIGINT
       WHEN c.tg_user_id IS NOT NULL AND (c.tg_user_id::text) ~ '^\d+$' THEN (c.tg_user_id::text)::BIGINT
       ELSE NULL::BIGINT END AS tg_user_id,
  COALESCE(m.meta->>'tg_user_id', c.tg_user_id::text, c.tg_chat_id) AS tg_user_id_text,
  COALESCE(
    c.spender_id,
    (SELECT id FROM public.spenders
     WHERE tg_user_id::text = COALESCE(m.meta->>'tg_user_id', c.tg_user_id::text, c.tg_chat_id)
     LIMIT 1)
  ) AS spender_id,
  COALESCE(
    NULLIF(trim(s.telegram_username), ''),
    NULLIF(trim(s.handle), ''),
    NULLIF(trim(c.tg_username), ''),
    'tg_' || COALESCE(m.meta->>'tg_user_id', c.tg_chat_id, '?')
  ) AS title,
  CASE m.direction WHEN 'in' THEN '📥 Message entrant' ELSE '📤 Message envoyé' END AS subtitle,
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

-- Per-tab convenience views
CREATE VIEW public.v_activity_new_spenders AS
SELECT * FROM public.v_activity_feed WHERE type = 'new_spender';

CREATE VIEW public.v_activity_enrichments AS
SELECT * FROM public.v_activity_feed WHERE type = 'enrichment';

CREATE VIEW public.v_activity_messages AS
SELECT * FROM public.v_activity_feed WHERE type = 'message';

GRANT SELECT ON public.v_activity_feed TO authenticated;
GRANT SELECT ON public.v_activity_new_spenders TO authenticated;
GRANT SELECT ON public.v_activity_enrichments TO authenticated;
GRANT SELECT ON public.v_activity_messages TO authenticated;
