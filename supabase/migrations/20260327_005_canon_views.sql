-- ═══════════════════════════════════════════════════════════════════════════════
-- CANON VIEWS — Couche stable BOT → DB → CRM (incassable)
-- Date: 2026-03-27
-- Objectif: tg_user_id_text partout, vues canoniques, ZERO doublons, détail Activity
-- Ne casse pas les colonnes existantes. Ajoute une couche stable par views.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Prérequis: tg_conversations doit avoir tg_user_id (ajouté par compat_layer)
DO $$
BEGIN
  ALTER TABLE public.tg_conversations ADD COLUMN IF NOT EXISTS tg_user_id TEXT;
  ALTER TABLE public.tg_conversations ADD COLUMN IF NOT EXISTS tg_username TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 0 — Helpers (idempotent)
-- normalize_tg_user_id: bigint/text → text digits-only. Source of truth pour comparaisons.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.normalize_tg_user_id(input_val TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v_clean TEXT;
BEGIN
  IF input_val IS NULL OR trim(input_val) = '' THEN RETURN NULL; END IF;
  v_clean := regexp_replace(trim(input_val), '[^0-9]', '', 'g');
  IF v_clean = '' THEN RETURN NULL; END IF;
  RETURN v_clean;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_tg_user_id(input_val BIGINT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN input_val IS NULL THEN NULL ELSE input_val::text END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 1 — v_spenders_canon
-- Vue canonique stable: colonnes profil normalisées, meta multi-shape (profile/enrich)
-- tg_user_id_text = TEXT partout pour le CRM (cast depuis bigint ou text)
-- ─────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_spenders_canon;
CREATE VIEW public.v_spenders_canon AS
SELECT
  s.id AS spender_id,
  -- tg_user_id_text: toujours TEXT, null si pas de tg_user_id (pas de NOT NULL pour tolérance bot)
  public.normalize_tg_user_id(s.tg_user_id) AS tg_user_id_text,
  COALESCE(NULLIF(TRIM(s.handle), ''), s.telegram_username,
    s.meta->'profile'->'telegram'->>'username',
    s.meta->'enrich'->'profile'->>'username',
    CASE WHEN s.tg_user_id IS NOT NULL THEN 'tg_' || public.normalize_tg_user_id(s.tg_user_id) ELSE 'id:' || s.id::text END
  ) AS username,
  COALESCE(NULLIF(TRIM(s.display_name), ''), NULLIF(TRIM(s.name), ''),
    s.meta->'profile'->'telegram'->>'display',
    s.meta->'enrich'->'profile'->>'display'
  ) AS display_name,
  COALESCE(s.meta, '{}'::jsonb) AS meta,
  -- Profil: multi-shape meta (profile.identity, profile, enrich.profile)
  COALESCE(s.first_name,
    s.meta->'profile'->'identity'->>'first_name',
    s.meta->'profile'->'telegram'->>'first_name',
    s.meta->'profile'->>'first_name',
    s.meta->'enrich'->'profile'->>'first_name'
  ) AS profile_first_name,
  COALESCE(s.age,
    (s.meta->'profile'->'identity'->>'age')::int,
    (s.meta->'profile'->>'age')::int,
    (s.meta->'enrich'->'profile'->>'age')::int
  ) AS profile_age,
  COALESCE(s.job,
    s.meta->'profile'->>'job',
    s.meta->'enrich'->'profile'->>'job'
  ) AS profile_job,
  COALESCE(s.langue,
    s.meta->'profile'->>'language',
    s.meta->'profile'->>'langue',
    s.meta->'enrich'->'profile'->>'language'
  ) AS profile_language,
  COALESCE(s.relationship_status,
    s.meta->'profile'->>'relationship_status',
    s.meta->'profile'->'status'->>'relation',
    s.meta->'enrich'->'profile'->>'relationship_status'
  ) AS profile_relationship_status,
  COALESCE(s.notes,
    s.meta->'profile'->>'notes_chatter',
    s.meta->'enrich'->'profile'->>'notes_chatter'
  ) AS notes_chatter,
  COALESCE(s.updated_at, s.created_at, now()) AS updated_at
FROM public.spenders s
WHERE (NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='spenders' AND column_name='is_active')
       OR s.is_active = true);

GRANT SELECT ON public.v_spenders_canon TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 2 — fn_activity_enrich_detail (si absent)
-- Extrait détail lisible depuis payload enrichissement
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_activity_enrich_detail(p JSONB)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE v_fields jsonb; v_summary text; v_added text[]; v_out text := '';
BEGIN
  v_fields := p->'added_fields'; IF v_fields IS NULL THEN v_fields := p->'fields'; END IF;
  IF v_fields IS NOT NULL AND jsonb_typeof(v_fields) = 'array' THEN
    SELECT string_agg('+' || elem, ', ') INTO v_out FROM jsonb_array_elements_text(v_fields) AS elem;
    IF v_out IS NOT NULL AND v_out <> '' THEN RETURN v_out; END IF;
  END IF;
  IF p ? 'after' AND jsonb_typeof(p->'after') = 'object' THEN
    SELECT string_agg('+' || key, ', ') INTO v_out FROM jsonb_object_keys(p->'after') AS key
    WHERE (p->'before'->key IS NULL OR p->'before'->key IS DISTINCT FROM p->'after'->key)
      AND p->'after'->key IS NOT NULL AND p->'after'->key <> '""'::jsonb;
    IF v_out IS NOT NULL AND v_out <> '' THEN RETURN v_out; END IF;
  END IF;
  v_summary := p->>'summary'; IF v_summary IS NOT NULL AND trim(v_summary) <> '' THEN RETURN v_summary; END IF;
  RETURN 'Profil mis à jour';
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 3 — v_activity_feed (canon)
-- Colonnes: id, tg_user_id_text, event_type, title, detail, created_at, spender_id
-- event_type: 'new_spender' | 'profile_updated' | 'message'
-- detail: enrichment fields OU message content (truncate 200) + direction
-- ─────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_activity_messages;
DROP VIEW IF EXISTS public.v_activity_enrichments;
DROP VIEW IF EXISTS public.v_activity_new_spenders;
DROP VIEW IF EXISTS public.v_activity_feed;

CREATE VIEW public.v_activity_feed AS
-- 1) NEW SPENDER
SELECT
  e.id,
  public.normalize_tg_user_id(e.tg_user_id) AS tg_user_id_text,
  public.normalize_tg_user_id(e.tg_user_id) AS tg_user_id,
  'new_spender'::text AS event_type,
  'new_spender'::text AS type,
  COALESCE(s.handle, s.telegram_username, 'tg_' || public.normalize_tg_user_id(e.tg_user_id)) AS title,
  'Nouveau spender' AS subtitle,
  COALESCE(e.data->>'source', e.data->>'summary', '') AS detail,
  e.created_at,
  COALESCE(e.spender_id, (SELECT id FROM public.spenders WHERE public.normalize_tg_user_id(tg_user_id) = public.normalize_tg_user_id(e.tg_user_id) AND (NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name='spenders' AND c.column_name='is_active') OR is_active = true) LIMIT 1)) AS spender_id,
  jsonb_build_object('summary', e.data->>'summary', 'source', e.data->>'source', 'event_type', e.event_type) || COALESCE(e.data, '{}'::jsonb) AS payload
FROM public.spender_events e
LEFT JOIN public.spenders s ON public.normalize_tg_user_id(s.tg_user_id) = public.normalize_tg_user_id(e.tg_user_id)
  AND (NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name='spenders' AND c.column_name='is_active') OR s.is_active = true)
WHERE e.event_type IN ('new_spender', 'spender_created')

UNION ALL

-- 2) PROFILE UPDATED / ENRICHMENT
SELECT
  e.id,
  public.normalize_tg_user_id(e.tg_user_id) AS tg_user_id_text,
  public.normalize_tg_user_id(e.tg_user_id) AS tg_user_id,
  'profile_updated'::text AS event_type,
  'profile_updated'::text AS type,
  COALESCE(s.handle, s.telegram_username, 'tg_' || public.normalize_tg_user_id(e.tg_user_id)) AS title,
  'Profil mis à jour' AS subtitle,
  'enriched: ' || public.fn_activity_enrich_detail(COALESCE(e.data, '{}'::jsonb)) AS detail,
  e.created_at,
  COALESCE(e.spender_id, (SELECT id FROM public.spenders WHERE public.normalize_tg_user_id(tg_user_id) = public.normalize_tg_user_id(e.tg_user_id) AND (NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name='spenders' AND c.column_name='is_active') OR is_active = true) LIMIT 1)) AS spender_id,
  jsonb_build_object('summary', e.data->>'summary', 'fields', e.data->'fields', 'event_type', e.event_type) || COALESCE(e.data, '{}'::jsonb) AS payload
FROM public.spender_events e
LEFT JOIN public.spenders s ON public.normalize_tg_user_id(s.tg_user_id) = public.normalize_tg_user_id(e.tg_user_id)
  AND (NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name='spenders' AND c.column_name='is_active') OR s.is_active = true)
WHERE e.event_type IN ('profile_updated', 'enriched', 'spender_enriched', 'classification_changed', 'handle_set', 'status_changed')

UNION ALL

-- 3) MESSAGE (detail = contenu truncate 200 + direction)
SELECT
  m.id,
  public.normalize_tg_user_id(COALESCE(m.meta->>'tg_user_id', c.tg_user_id::text, c.tg_chat_id)) AS tg_user_id_text,
  public.normalize_tg_user_id(COALESCE(m.meta->>'tg_user_id', c.tg_user_id::text, c.tg_chat_id)) AS tg_user_id,
  'message'::text AS event_type,
  'message'::text AS type,
  COALESCE(s.handle, s.telegram_username, c.tg_username, 'tg_' || COALESCE(m.meta->>'tg_user_id', c.tg_chat_id)) AS title,
  CASE m.direction WHEN 'in' THEN 'Message entrant' ELSE 'Message envoyé' END AS subtitle,
  (CASE m.direction WHEN 'in' THEN '[in] ' ELSE '[out] ' END)
    || COALESCE(NULLIF(trim(left(COALESCE(m.text, m.meta->>'text', ''), 200)), ''), '[sans texte]') AS detail,
  m.created_at,
  COALESCE(c.spender_id, (SELECT id FROM public.spenders WHERE public.normalize_tg_user_id(tg_user_id) = public.normalize_tg_user_id(COALESCE(m.meta->>'tg_user_id', c.tg_user_id::text, c.tg_chat_id)) AND (NOT EXISTS (SELECT 1 FROM information_schema.columns c2 WHERE c2.table_schema='public' AND c2.table_name='spenders' AND c2.column_name='is_active') OR is_active = true) LIMIT 1)) AS spender_id,
  jsonb_build_object('text', left(COALESCE(m.text, ''), 500), 'direction', m.direction, 'tg_message_id', m.tg_message_id, 'conversation_id', m.conversation_id) AS payload
FROM public.tg_messages m
LEFT JOIN public.tg_conversations c ON c.id = m.conversation_id
LEFT JOIN public.spenders s ON s.id = c.spender_id
  AND (NOT EXISTS (SELECT 1 FROM information_schema.columns c2 WHERE c2.table_schema='public' AND c2.table_name='spenders' AND c2.column_name='is_active') OR s.is_active = true);

-- Vues par onglet (alias compat)
CREATE VIEW public.v_activity_new_spenders AS SELECT * FROM public.v_activity_feed WHERE event_type = 'new_spender';
CREATE VIEW public.v_activity_enrichments AS SELECT * FROM public.v_activity_feed WHERE event_type = 'profile_updated';
CREATE VIEW public.v_activity_messages AS SELECT * FROM public.v_activity_feed WHERE event_type = 'message';

GRANT SELECT ON public.v_activity_feed TO authenticated;
GRANT SELECT ON public.v_activity_new_spenders TO authenticated;
GRANT SELECT ON public.v_activity_enrichments TO authenticated;
GRANT SELECT ON public.v_activity_messages TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 4 — v_last_messages
-- Dernier message par conversation/tg_user_id
-- ─────────────────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_last_messages;
CREATE VIEW public.v_last_messages AS
SELECT tg_user_id_text, last_message_text, last_message_at, direction
FROM (
  SELECT
    public.normalize_tg_user_id(COALESCE(m.meta->>'tg_user_id', c.tg_user_id::text, c.tg_chat_id)) AS tg_user_id_text,
    left(COALESCE(m.text, m.meta->>'text', ''), 200) AS last_message_text,
    m.created_at AS last_message_at,
    m.direction,
    ROW_NUMBER() OVER (PARTITION BY public.normalize_tg_user_id(COALESCE(m.meta->>'tg_user_id', c.tg_user_id::text, c.tg_chat_id)) ORDER BY m.created_at DESC) AS rn
  FROM public.tg_messages m
  JOIN public.tg_conversations c ON c.id = m.conversation_id
) sub
WHERE tg_user_id_text IS NOT NULL AND rn = 1;

GRANT SELECT ON public.v_last_messages TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 5 — Indexes (sur tables, pas sur views)
-- Accélérer Activity (created_at desc), tg_user_id lookups
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_spender_events_created_at_desc
  ON public.spender_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spender_events_tg_user_id
  ON public.spender_events (tg_user_id);
CREATE INDEX IF NOT EXISTS idx_spender_events_event_type
  ON public.spender_events (event_type);
CREATE INDEX IF NOT EXISTS idx_tg_messages_created_at_desc
  ON public.tg_messages (created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- PHASE 6 — UNIQUE spenders(tg_user_id) — partial index si nullable
-- Stratégie safe: partial unique WHERE tg_user_id IS NOT NULL
-- Si doublons existent, l'index peut échouer → exécuter merge_spender d'abord
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='spenders' AND indexname='uq_spenders_tg_user_id') THEN
    CREATE UNIQUE INDEX uq_spenders_tg_user_id ON public.spenders (tg_user_id) WHERE tg_user_id IS NOT NULL;
  END IF;
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'Doublons spenders.tg_user_id détectés. Exécuter merge_spender(old_id, new_id) pour résoudre.';
END $$;

COMMIT;
