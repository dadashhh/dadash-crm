-- ═══════════════════════════════════════════════════════════════════════════════
-- COMPAT LAYER INCASSABLE — DADASH
-- Views stables: v_tg_conversations, v_tg_messages, v_spenders, v_spender_events, v_spender_enrich_queue
-- ZÉRO breaking change UI quand DB évolue. Fallbacks via COALESCE + JSON.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- A) AUDIT SCHEMA — Écarts Front vs DB
-- ───────────────────────────────────
-- Tables brutes (colonnes réelles) vs usage index.html:
--
-- tg_conversations: base = id, tg_chat_id, spender_id, model_id, assigned_chatter_id, status, last_message_at, created_at
--   Front attend: tg_username, username, display_name, tg_user_id, tg_peer_id
--   Écart: colonnes absentes → ADD COLUMN IF NOT EXISTS + view fallback
--
-- tg_messages: base = id, conversation_id, direction, text, tg_message_id, created_at, meta
--   Front attend: tg_user_id, username, display_name (dans meta)
--   Écart: pas de colonnes directes → view extrait meta->>'tg_user_id', etc.
--
-- spenders: base + migrations = id, tg_user_id, handle, name, meta, status, created_at, updated_at, last_seen_at, ...
--   Front attend: first_name, age, job, city, country, language, notes, telegram_username
--   Écart: certaines colonnes optionnelles → ADD COLUMN + fallback meta.profile
--
-- spender_events: id, tg_user_id, event_type, spender_id, data, created_at
--   Front via v_spender_events: handle, conv_id (dérivés)
--
-- spender_enrich_queue: id, conversation_id, tg_user_id, status, ...
--   View = pass-through stable
--
-- ── PHASE 1: Colonnes manquantes (additive, jamais DROP) ───────────────────────
-- tg_conversations
ALTER TABLE public.tg_conversations ADD COLUMN IF NOT EXISTS tg_peer_id TEXT;
ALTER TABLE public.tg_conversations ADD COLUMN IF NOT EXISTS tg_user_id BIGINT;
ALTER TABLE public.tg_conversations ADD COLUMN IF NOT EXISTS tg_username TEXT;
ALTER TABLE public.tg_conversations ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE public.tg_conversations ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.tg_conversations ADD COLUMN IF NOT EXISTS tg_display_name TEXT;

-- spenders (colonnes UI)
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS handle TEXT;
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS telegram_username TEXT;
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS first_name TEXT;
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS job TEXT;
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS langue TEXT;
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS status TEXT;
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT;
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS classification TEXT;
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS source TEXT;

-- spender_events
ALTER TABLE public.spender_events ADD COLUMN IF NOT EXISTS spender_id UUID;

-- ── PHASE 2: v_tg_conversations ──────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_tg_conversations;
CREATE VIEW public.v_tg_conversations AS
SELECT
  c.id,
  c.tg_chat_id,
  COALESCE(c.tg_peer_id, c.tg_chat_id) AS tg_peer_id,
  COALESCE(
    CASE WHEN c.tg_user_id IS NOT NULL AND (c.tg_user_id::text) ~ '^\d+$' THEN (c.tg_user_id::text)::BIGINT ELSE NULL END,
    CASE WHEN c.tg_chat_id ~ '^\d+$' THEN (c.tg_chat_id)::BIGINT ELSE NULL END
  ) AS tg_user_id,
  c.spender_id,
  c.model_id,
  c.assigned_chatter_id,
  c.status,
  c.last_message_at,
  c.created_at,
  COALESCE(NULLIF(TRIM(c.tg_username), ''), NULLIF(TRIM(c.username), ''), s.telegram_username, 'tg_' || COALESCE(c.tg_user_id::text, c.tg_chat_id)) AS tg_username,
  COALESCE(NULLIF(TRIM(c.username), ''), NULLIF(TRIM(c.tg_username), ''), s.telegram_username, 'tg_' || COALESCE(c.tg_user_id::text, c.tg_chat_id)) AS username,
  COALESCE(NULLIF(TRIM(c.display_name), ''), NULLIF(TRIM(c.tg_display_name), ''), s.name, 'tg_' || COALESCE(c.tg_user_id::text, c.tg_chat_id)) AS display_name
FROM public.tg_conversations c
LEFT JOIN public.spenders s ON s.id = c.spender_id OR (c.tg_user_id IS NOT NULL AND s.tg_user_id = c.tg_user_id);

-- ── PHASE 3: v_tg_messages ──────────────────────────────────────────────────
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
  CASE WHEN (m.meta->>'tg_user_id') ~ '^\d+$' THEN (m.meta->>'tg_user_id')::BIGINT ELSE NULL END AS tg_user_id,
  m.meta->>'username' AS username,
  m.meta->>'display_name' AS display_name
FROM public.tg_messages m;

-- ── PHASE 4: v_spenders (colonnes stables + fallback meta) ───────────────────
DROP VIEW IF EXISTS public.v_spenders;
CREATE VIEW public.v_spenders AS
SELECT
  s.id,
  s.tg_user_id,
  COALESCE(NULLIF(TRIM(s.handle), ''), s.telegram_username, s.meta->'profile'->'telegram'->>'username', CASE WHEN s.tg_user_id IS NOT NULL THEN 'tg_' || s.tg_user_id::text ELSE 'id:' || s.id::text END) AS username,
  COALESCE(NULLIF(TRIM(s.handle), ''), s.telegram_username, s.meta->'profile'->'telegram'->>'username', CASE WHEN s.tg_user_id IS NOT NULL THEN 'tg_' || s.tg_user_id::text ELSE 'id:' || s.id::text END) AS handle,
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
FROM public.spenders s;

-- ── PHASE 5: v_spender_events ───────────────────────────────────────────────
DROP VIEW IF EXISTS public.v_spender_events;
CREATE VIEW public.v_spender_events AS
SELECT
  e.id,
  e.event_type AS type,
  e.tg_user_id,
  COALESCE(e.spender_id, (SELECT id FROM public.spenders WHERE tg_user_id = e.tg_user_id LIMIT 1)) AS spender_id,
  COALESCE(e.data, '{}'::jsonb) AS payload,
  e.created_at,
  COALESCE(s.handle, s.telegram_username, s.name, 'tg_' || e.tg_user_id::text) AS handle,
  (SELECT id FROM public.tg_conversations WHERE (tg_user_id::text = e.tg_user_id::text OR (tg_chat_id ~ '^\d+$' AND tg_chat_id = e.tg_user_id::text)) LIMIT 1) AS conv_id
FROM public.spender_events e
LEFT JOIN public.spenders s ON s.tg_user_id = e.tg_user_id;

-- ── PHASE 6: v_spender_enrich_queue ─────────────────────────────────────────
DROP VIEW IF EXISTS public.v_spender_enrich_queue;
CREATE VIEW public.v_spender_enrich_queue AS
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

-- ── PHASE 7: Grants ─────────────────────────────────────────────────────────
GRANT SELECT ON public.v_tg_conversations TO authenticated;
GRANT SELECT ON public.v_tg_messages TO authenticated;
GRANT SELECT ON public.v_spenders TO authenticated;
GRANT SELECT ON public.v_spender_events TO authenticated;
GRANT SELECT ON public.v_spender_enrich_queue TO authenticated;

-- ── PHASE 8: Indexes perf Activity (last 150 events) ─────────────────────────
CREATE INDEX IF NOT EXISTS idx_spender_events_created_at_desc ON public.spender_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tg_conversations_tg_user_id ON public.tg_conversations (tg_user_id) WHERE tg_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tg_messages_created_at_desc ON public.tg_messages (created_at DESC);
