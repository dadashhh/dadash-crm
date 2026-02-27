-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX: v_activity_feed — vue compat stable pour le CRM Activity drawer
-- Date: 2026-02-28
-- Objectif: exposer EXACTEMENT les colonnes attendues par le frontend,
--           avec types TEXT partout pour tg_user_id (post-migration TEXT).
--           Rétro-compatible avec v_activity_feed_unified (ne la touche pas).
--
-- Colonnes imposées par l'UI:
--   id, category, event_type, type, tg_user_id, tg_user_id_text, username,
--   title, subtitle, detail, created_at, spender_id, payload
--
-- Sources:
--   1) spender_events (new_spender, enrichment) JOIN spenders
--   2) tg_messages JOIN tg_conversations JOIN spenders (messages)
--
-- Contraintes:
--   - spender_events.tg_user_id est TEXT (post 20260313_dadash_tg_ids_zero_confusion)
--   - spender_events n'a PAS de colonne 'detail' ni 'type' → on utilise data (JSONB)
--   - spenders.tg_user_id est TEXT
--   - tg_conversations.tg_user_id est TEXT
--   - Pas de cast ::BIGINT nulle part
--   - fn_activity_enrich_detail(JSONB) est réutilisée si elle existe
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 0 — Assurer fn_activity_enrich_detail existe
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_activity_enrich_detail(p JSONB)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_fields jsonb;
  v_added text[];
  v_out text := '';
BEGIN
  -- 1) added_fields / fields array
  v_fields := p->'added_fields';
  IF v_fields IS NULL THEN v_fields := p->'fields'; END IF;
  IF v_fields IS NOT NULL AND jsonb_typeof(v_fields) = 'array' THEN
    SELECT string_agg('+' || elem, ', ') INTO v_out
    FROM jsonb_array_elements_text(v_fields) AS elem;
    IF v_out IS NOT NULL AND v_out <> '' THEN RETURN v_out; END IF;
  END IF;
  -- 2) patch object keys
  IF jsonb_typeof(p->'patch') = 'object' THEN
    SELECT array_agg(key) INTO v_added FROM jsonb_object_keys(p->'patch') AS key;
    IF v_added IS NOT NULL AND array_length(v_added, 1) > 0 THEN
      RETURN '+' || array_to_string(v_added, ', +');
    END IF;
  END IF;
  -- 3) before/after diff
  IF p ? 'after' AND jsonb_typeof(p->'after') = 'object' THEN
    SELECT string_agg('+' || key, ', ') INTO v_out
    FROM jsonb_object_keys(p->'after') AS key
    WHERE (p->'before'->key IS NULL OR p->'before'->key IS DISTINCT FROM p->'after'->key)
      AND p->'after'->key IS NOT NULL AND p->'after'->key <> '""'::jsonb;
    IF v_out IS NOT NULL AND v_out <> '' THEN RETURN v_out; END IF;
  END IF;
  -- 4) summary fallback
  IF (p->>'summary') IS NOT NULL AND trim(p->>'summary') <> '' THEN
    RETURN p->>'summary';
  END IF;
  RETURN 'Profil mis à jour';
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 1 — DROP vues dépendantes (per-tab d'abord, puis feed)
-- ─────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_activity_new_spenders CASCADE;
DROP VIEW IF EXISTS public.v_activity_enrichments CASCADE;
DROP VIEW IF EXISTS public.v_activity_messages CASCADE;
DROP VIEW IF EXISTS public.v_activity_feed CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 2 — CREATE VIEW v_activity_feed
-- 3 sections UNION ALL: new_spender, enrichment, message
-- Toutes les colonnes en TEXT pour tg_user_id, JSONB pour payload
-- ─────────────────────────────────────────────────────────────────────────────
CREATE VIEW public.v_activity_feed AS

-- ══════════════════════════════════════════════════════════════════
-- 1) NEW SPENDER — spender_events → new_spender / spender_created
-- ══════════════════════════════════════════════════════════════════
SELECT
  e.id,
  'new_spender'::text                                                AS category,
  e.event_type::text                                                 AS event_type,
  'new_spender'::text                                                AS type,
  -- tg_user_id: TEXT normalisé (digits only)
  public.normalize_tg_user_id(e.tg_user_id)                         AS tg_user_id,
  public.normalize_tg_user_id(e.tg_user_id)                         AS tg_user_id_text,
  -- username: handle ou fallback tg_xxx
  COALESCE(
    NULLIF(TRIM(s.handle), ''),
    s.telegram_username,
    CASE WHEN e.tg_user_id IS NOT NULL AND TRIM(e.tg_user_id) <> ''
         THEN 'tg_' || public.normalize_tg_user_id(e.tg_user_id)
         ELSE '?'
    END
  )                                                                  AS username,
  -- title: idem username
  COALESCE(
    NULLIF(TRIM(s.handle), ''),
    s.telegram_username,
    CASE WHEN e.tg_user_id IS NOT NULL AND TRIM(e.tg_user_id) <> ''
         THEN 'tg_' || public.normalize_tg_user_id(e.tg_user_id)
         ELSE '?'
    END
  )                                                                  AS title,
  'Nouveau spender'::text                                            AS subtitle,
  COALESCE(e.data->>'summary', e.data->>'source', '')::text         AS detail,
  e.created_at,
  -- spender_id: direct ou lookup
  COALESCE(
    e.spender_id,
    (SELECT id FROM public.spenders
     WHERE public.normalize_tg_user_id(tg_user_id) = public.normalize_tg_user_id(e.tg_user_id)
     LIMIT 1)
  )                                                                  AS spender_id,
  COALESCE(e.data, '{}'::jsonb)                                      AS payload
FROM public.spender_events e
LEFT JOIN public.spenders s
  ON public.normalize_tg_user_id(s.tg_user_id) = public.normalize_tg_user_id(e.tg_user_id)
WHERE e.event_type IN ('new_spender', 'spender_created')

UNION ALL

-- ══════════════════════════════════════════════════════════════════
-- 2) ENRICHMENT — profile_updated, enriched, spender_enriched, etc.
-- ══════════════════════════════════════════════════════════════════
SELECT
  e.id,
  'enrichment'::text                                                 AS category,
  e.event_type::text                                                 AS event_type,
  'enrichment'::text                                                 AS type,
  public.normalize_tg_user_id(e.tg_user_id)                         AS tg_user_id,
  public.normalize_tg_user_id(e.tg_user_id)                         AS tg_user_id_text,
  COALESCE(
    NULLIF(TRIM(s.handle), ''),
    s.telegram_username,
    CASE WHEN e.tg_user_id IS NOT NULL AND TRIM(e.tg_user_id) <> ''
         THEN 'tg_' || public.normalize_tg_user_id(e.tg_user_id)
         ELSE '?'
    END
  )                                                                  AS username,
  COALESCE(
    NULLIF(TRIM(s.handle), ''),
    s.telegram_username,
    CASE WHEN e.tg_user_id IS NOT NULL AND TRIM(e.tg_user_id) <> ''
         THEN 'tg_' || public.normalize_tg_user_id(e.tg_user_id)
         ELSE '?'
    END
  )                                                                  AS title,
  CASE e.event_type
    WHEN 'profile_updated'        THEN 'Profil mis à jour'
    WHEN 'enriched'               THEN 'Enrichi'
    WHEN 'spender_enriched'       THEN 'Spender enrichi'
    WHEN 'classification_changed' THEN 'Classification changée'
    WHEN 'handle_set'             THEN 'Handle défini'
    WHEN 'status_changed'         THEN 'Statut changé'
    WHEN 'spender_tier_changed'   THEN 'Tier changé'
    ELSE 'Enrichment'
  END                                                                AS subtitle,
  public.fn_activity_enrich_detail(COALESCE(e.data, '{}'::jsonb))    AS detail,
  e.created_at,
  COALESCE(
    e.spender_id,
    (SELECT id FROM public.spenders
     WHERE public.normalize_tg_user_id(tg_user_id) = public.normalize_tg_user_id(e.tg_user_id)
     LIMIT 1)
  )                                                                  AS spender_id,
  COALESCE(e.data, '{}'::jsonb)                                      AS payload
FROM public.spender_events e
LEFT JOIN public.spenders s
  ON public.normalize_tg_user_id(s.tg_user_id) = public.normalize_tg_user_id(e.tg_user_id)
WHERE e.event_type IN (
  'profile_updated', 'enriched', 'spender_enriched',
  'classification_changed', 'handle_set', 'status_changed',
  'spender_tier_changed'
)

UNION ALL

-- ══════════════════════════════════════════════════════════════════
-- 3) MESSAGE — tg_messages JOIN tg_conversations JOIN spenders
-- Tout en TEXT, pas de cast ::BIGINT
-- ══════════════════════════════════════════════════════════════════
SELECT
  m.id,
  'message'::text                                                    AS category,
  'message'::text                                                    AS event_type,
  'message'::text                                                    AS type,
  -- tg_user_id: extrait de meta ou conversation, normalisé TEXT
  public.normalize_tg_user_id(
    COALESCE(m.meta->>'tg_user_id', c.tg_user_id, c.tg_chat_id)
  )                                                                  AS tg_user_id,
  public.normalize_tg_user_id(
    COALESCE(m.meta->>'tg_user_id', c.tg_user_id, c.tg_chat_id)
  )                                                                  AS tg_user_id_text,
  -- username
  COALESCE(
    NULLIF(TRIM(s.handle), ''),
    s.telegram_username,
    NULLIF(TRIM(c.tg_username), ''),
    CASE WHEN COALESCE(m.meta->>'tg_user_id', c.tg_user_id, c.tg_chat_id) IS NOT NULL
         THEN 'tg_' || public.normalize_tg_user_id(COALESCE(m.meta->>'tg_user_id', c.tg_user_id, c.tg_chat_id))
         ELSE '?'
    END
  )                                                                  AS username,
  COALESCE(
    NULLIF(TRIM(s.handle), ''),
    s.telegram_username,
    NULLIF(TRIM(c.tg_username), ''),
    CASE WHEN COALESCE(m.meta->>'tg_user_id', c.tg_user_id, c.tg_chat_id) IS NOT NULL
         THEN 'tg_' || public.normalize_tg_user_id(COALESCE(m.meta->>'tg_user_id', c.tg_user_id, c.tg_chat_id))
         ELSE '?'
    END
  )                                                                  AS title,
  CASE m.direction
    WHEN 'in'  THEN '📥 Message entrant'
    WHEN 'out' THEN '📤 Message envoyé'
    ELSE 'Message'
  END                                                                AS subtitle,
  -- detail: direction prefix + message text (tronqué 200 chars)
  COALESCE(
    CASE m.direction WHEN 'in' THEN '[in] ' WHEN 'out' THEN '[out] ' ELSE '' END
    || NULLIF(TRIM(LEFT(COALESCE(m.text, m.meta->>'text', ''), 200)), ''),
    '[sans texte]'
  )                                                                  AS detail,
  m.created_at,
  -- spender_id: depuis conversation ou lookup
  COALESCE(
    c.spender_id,
    (SELECT id FROM public.spenders
     WHERE public.normalize_tg_user_id(tg_user_id) =
           public.normalize_tg_user_id(COALESCE(m.meta->>'tg_user_id', c.tg_user_id, c.tg_chat_id))
     LIMIT 1)
  )                                                                  AS spender_id,
  jsonb_build_object(
    'text', LEFT(COALESCE(m.text, ''), 500),
    'direction', m.direction,
    'tg_message_id', m.tg_message_id,
    'conversation_id', m.conversation_id
  )                                                                  AS payload
FROM public.tg_messages m
LEFT JOIN public.tg_conversations c ON c.id = m.conversation_id
LEFT JOIN public.spenders s
  ON public.normalize_tg_user_id(s.tg_user_id) =
     public.normalize_tg_user_id(COALESCE(m.meta->>'tg_user_id', c.tg_user_id, c.tg_chat_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 3 — Vues per-tab (filtrent sur category)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE VIEW public.v_activity_new_spenders AS
  SELECT * FROM public.v_activity_feed WHERE category = 'new_spender';

CREATE VIEW public.v_activity_enrichments AS
  SELECT * FROM public.v_activity_feed WHERE category = 'enrichment';

CREATE VIEW public.v_activity_messages AS
  SELECT * FROM public.v_activity_feed WHERE category = 'message';

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 4 — GRANT SELECT
-- ─────────────────────────────────────────────────────────────────────────────
GRANT SELECT ON public.v_activity_feed TO authenticated;
GRANT SELECT ON public.v_activity_new_spenders TO authenticated;
GRANT SELECT ON public.v_activity_enrichments TO authenticated;
GRANT SELECT ON public.v_activity_messages TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 5 — Queries de vérification (exécuter manuellement)
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT count(*) FROM public.v_activity_feed;
-- SELECT category, count(*) FROM public.v_activity_feed GROUP BY 1 ORDER BY 2 DESC;
-- SELECT id, category, event_type, username, title, subtitle, created_at
--   FROM public.v_activity_feed ORDER BY created_at DESC LIMIT 5;
