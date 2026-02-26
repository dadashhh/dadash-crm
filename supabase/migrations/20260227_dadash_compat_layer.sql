-- ═══════════════════════════════════════════════════════════════════════════════
-- DADASH — Couche de compatibilité (Sync TG + Activity feed)
-- Tâche B: Fix erreur "tg_username does not exist"
-- Tâche C: Activity feed stable (3 catégories)
-- Idempotent, pas de breaking change
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- TÂCHE B — tg_conversations: colonnes attendues par le front
-- Option 1 (préférée): migration additive — ajout colonnes nullable
-- Front attend: id, tg_chat_id, tg_peer_id, tg_user_id, username, tg_username,
--               display_name, spender_id
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.tg_conversations ADD COLUMN IF NOT EXISTS tg_user_id BIGINT;
ALTER TABLE public.tg_conversations ADD COLUMN IF NOT EXISTS tg_peer_id TEXT;
ALTER TABLE public.tg_conversations ADD COLUMN IF NOT EXISTS tg_username TEXT;
ALTER TABLE public.tg_conversations ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE public.tg_conversations ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.tg_conversations ADD COLUMN IF NOT EXISTS tg_first_name TEXT;
ALTER TABLE public.tg_conversations ADD COLUMN IF NOT EXISTS tg_last_name TEXT;
ALTER TABLE public.tg_conversations ADD COLUMN IF NOT EXISTS tg_display_name TEXT;

-- Backfill: pour les DMs, tg_chat_id = user_id Telegram
UPDATE public.tg_conversations
SET
  tg_user_id = CASE WHEN tg_chat_id ~ '^\d+$' THEN tg_chat_id::BIGINT ELSE tg_user_id END,
  tg_peer_id = COALESCE(tg_peer_id, tg_chat_id)
WHERE tg_user_id IS NULL AND tg_chat_id ~ '^\d+$';

UPDATE public.tg_conversations
SET tg_peer_id = COALESCE(tg_peer_id, tg_chat_id)
WHERE tg_peer_id IS NULL;

-- Backfill tg_username/username/display_name depuis spenders (spender_id ou tg_user_id)
UPDATE public.tg_conversations c
SET
  tg_username = COALESCE(c.tg_username, s.telegram_username),
  username = COALESCE(c.username, s.telegram_username),
  display_name = COALESCE(c.display_name, s.name),
  tg_display_name = COALESCE(c.tg_display_name, s.name)
FROM public.spenders s
WHERE (c.spender_id = s.id OR (c.tg_user_id IS NOT NULL AND s.tg_user_id = c.tg_user_id))
  AND (c.tg_username IS NULL OR c.username IS NULL OR c.display_name IS NULL);

-- Trigger: à chaque nouveau message, mettre à jour la conv avec les infos user (meta)
CREATE OR REPLACE FUNCTION public.tg_sync_conv_from_message()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.meta IS NOT NULL AND NEW.meta <> '{}'::jsonb THEN
    UPDATE public.tg_conversations
    SET
      tg_user_id = COALESCE((NEW.meta->>'tg_user_id')::BIGINT, tg_user_id),
      tg_username = COALESCE(NULLIF(NEW.meta->>'username', ''), tg_username),
      username = COALESCE(NULLIF(NEW.meta->>'username', ''), username),
      display_name = COALESCE(NULLIF(NEW.meta->>'display_name', ''), display_name),
      tg_display_name = COALESCE(NULLIF(NEW.meta->>'display_name', ''), tg_display_name)
    WHERE id = NEW.conversation_id
      AND (tg_username IS NULL OR username IS NULL OR display_name IS NULL);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_conv_from_message ON public.tg_messages;
CREATE TRIGGER trg_sync_conv_from_message
  AFTER INSERT ON public.tg_messages
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_conv_from_message();

-- spender_events: colonne spender_id si manquante (pour lien conv/spender)
ALTER TABLE public.spender_events ADD COLUMN IF NOT EXISTS spender_id UUID;

-- ─────────────────────────────────────────────────────────────────────────────
-- TÂCHE C — Activity feed: étendre event_type pour enriched/spender_enriched
-- (support noms historiques)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  -- Supprimer l'ancienne contrainte si elle existe
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
     WHERE constraint_schema = 'public'
       AND constraint_name = 'chk_spender_events_event_type'
  ) THEN
    ALTER TABLE public.spender_events DROP CONSTRAINT chk_spender_events_event_type;
  END IF;
  -- Recréer avec types étendus
  ALTER TABLE public.spender_events
    ADD CONSTRAINT chk_spender_events_event_type
    CHECK (event_type IN (
      'new_spender', 'profile_updated', 'new_message', 'status_changed',
      'classification_changed', 'spender_created', 'tx_created', 'handle_set',
      'enriched', 'spender_enriched', 'message', 'unknown'
    ));
EXCEPTION
  WHEN duplicate_object THEN NULL; -- Contrainte déjà présente
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- TÂCHE C — VIEW v_activity_feed_unified
-- Source: spender_events + fallback tg_messages pour "message"
-- Catégories: new_spender | enrichment | message
-- handle = spenders.handle OU meta->profile->telegram->>username OU tg_user_id::text
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_activity_feed_unified AS
WITH events_with_category AS (
  SELECT
    e.id,
    e.event_type,
    e.tg_user_id,
    e.spender_id,
    e.data,
    e.created_at,
    e.idempotency_key,
    CASE
      WHEN e.event_type IN ('new_spender', 'spender_created') THEN 'new_spender'
      WHEN e.event_type IN ('profile_updated', 'enriched', 'spender_enriched', 'classification_changed', 'handle_set', 'status_changed') THEN 'enrichment'
      WHEN e.event_type IN ('new_message', 'message', 'tx_created') THEN 'message'
      ELSE 'new_spender'
    END AS category
  FROM public.spender_events e
),
enriched AS (
  SELECT
    ev.id,
    ev.event_type,
    ev.tg_user_id,
    ev.spender_id,
    ev.category,
    ev.data,
    ev.created_at,
    ev.idempotency_key,
    c.id AS conv_id,
    COALESCE(
      s.handle,
      s.meta->'profile'->'telegram'->>'username',
      s.telegram_username,
      ev.tg_user_id::text
    ) AS handle,
    COALESCE(
      ev.data->>'summary',
      ev.data->>'message',
      ev.event_type || ' — ' || COALESCE(s.handle, 'tg_' || ev.tg_user_id::text)
    ) AS summary,
    CASE ev.event_type
      WHEN 'new_spender' THEN 'Nouveau spender'
      WHEN 'spender_created' THEN 'Spender créé'
      WHEN 'profile_updated' THEN 'Profil mis à jour'
      WHEN 'enriched' THEN 'Enrichi'
      WHEN 'spender_enriched' THEN 'Spender enrichi'
      WHEN 'classification_changed' THEN 'Classification changée'
      WHEN 'handle_set' THEN 'Handle défini'
      WHEN 'status_changed' THEN 'Statut changé'
      WHEN 'new_message' THEN 'Nouveau message'
      WHEN 'message' THEN 'Message'
      WHEN 'tx_created' THEN 'Transaction créée'
      ELSE COALESCE(ev.event_type, 'Événement')
    END AS title,
  COALESCE(
    ev.data->>'summary',
    ev.data->>'message',
    ev.event_type || ' — ' || COALESCE(s.handle, 'tg_' || ev.tg_user_id::text)
  ) AS summary
  FROM events_with_category ev
  LEFT JOIN public.spenders s ON s.tg_user_id = ev.tg_user_id OR s.id = ev.spender_id
  LEFT JOIN public.tg_conversations c ON c.tg_user_id = ev.tg_user_id OR c.spender_id = ev.spender_id
)
SELECT
  ev.id,
  ev.category,
  ev.tg_user_id,
  ev.spender_id,
  ev.conv_id,
  ev.handle,
  ev.title,
  ev.summary,
  ev.created_at,
  jsonb_build_object(
    'event_type', ev.event_type,
    'data', ev.data,
    'idempotency_key', ev.idempotency_key
  ) AS payload
FROM enriched ev
ORDER BY created_at DESC;

-- RPC pour l'Activity bar (3 onglets)
CREATE OR REPLACE FUNCTION public.fn_get_activity_feed_unified(
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_category TEXT DEFAULT NULL  -- 'new_spender' | 'enrichment' | 'message' | NULL = all
)
RETURNS TABLE (
  id UUID,
  category TEXT,
  tg_user_id BIGINT,
  spender_id UUID,
  conv_id UUID,
  handle TEXT,
  title TEXT,
  summary TEXT,
  created_at TIMESTAMPTZ,
  payload JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.id,
    v.category,
    v.tg_user_id,
    v.spender_id,
    v.conv_id,
    v.handle,
    v.title,
    v.summary,
    v.created_at,
    v.payload
  FROM public.v_activity_feed_unified v
  WHERE (p_category IS NULL OR v.category = p_category)
  ORDER BY v.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

-- Grant
GRANT SELECT ON public.v_activity_feed_unified TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_activity_feed_unified(INTEGER, INTEGER, TEXT) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Compatibilité: v_activity_feed existant — garder le même format pour le front
-- (id, event_type, tg_user_id, username, title, subtitle, created_at, data)
-- On met à jour v_activity_feed pour mapper category + handle correctement
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW public.v_activity_feed AS
SELECT
  e.id,
  e.event_type,
  e.tg_user_id,
  COALESCE(
    s.handle,
    s.meta->'profile'->'telegram'->>'username',
    s.telegram_username,
    'tg_' || e.tg_user_id::text
  ) AS username,
  CASE e.event_type
    WHEN 'new_spender'            THEN 'Nouveau spender'
    WHEN 'spender_created'       THEN 'Spender créé'
    WHEN 'profile_updated'       THEN 'Profil mis à jour'
    WHEN 'enriched'              THEN 'Enrichi'
    WHEN 'spender_enriched'      THEN 'Spender enrichi'
    WHEN 'new_message'           THEN 'Nouveau message'
    WHEN 'message'               THEN 'Message'
    WHEN 'status_changed'         THEN 'Statut changé'
    WHEN 'classification_changed' THEN 'Classification changée'
    WHEN 'tx_created'             THEN 'Transaction créée'
    WHEN 'handle_set'             THEN 'Handle défini'
    ELSE COALESCE(e.event_type, 'Événement')
  END AS title,
  COALESCE(
    e.data->>'summary',
    e.data->>'message',
    CASE
      WHEN e.data <> '{}'::jsonb THEN e.event_type || ' — ' || COALESCE(s.handle, 'tg_' || e.tg_user_id::text)
      ELSE NULL
    END
  ) AS subtitle,
  e.created_at,
  e.data
FROM public.spender_events e
LEFT JOIN public.spenders s ON s.tg_user_id = e.tg_user_id
ORDER BY e.created_at DESC;
