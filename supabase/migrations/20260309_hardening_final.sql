-- ═══════════════════════════════════════════════════════════════════════════════
-- HARDENING FINAL — v_tg_conversations, v_bot_autofill_metrics, v_bot_autofill_events
-- Fix Sync TG (compat view), monitoring Bots réel
-- ═══════════════════════════════════════════════════════════════════════════════

-- Colonnes manquantes (additive) — à exécuter avant la vue
ALTER TABLE public.tg_conversations ADD COLUMN IF NOT EXISTS tg_peer_id TEXT;
ALTER TABLE public.tg_conversations ADD COLUMN IF NOT EXISTS tg_user_id BIGINT;
ALTER TABLE public.tg_conversations ADD COLUMN IF NOT EXISTS tg_username TEXT;
ALTER TABLE public.tg_conversations ADD COLUMN IF NOT EXISTS username TEXT;
ALTER TABLE public.tg_conversations ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.tg_conversations ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.tg_conversations ADD COLUMN IF NOT EXISTS tg_display_name TEXT;

-- ── A) v_tg_conversations — compat layer (tg_username toujours exposé) ─────────
DROP VIEW IF EXISTS public.v_tg_conversations;
CREATE VIEW public.v_tg_conversations AS
SELECT
  c.id,
  c.tg_chat_id,
  COALESCE(c.tg_peer_id, c.tg_chat_id) AS tg_peer_id,
  COALESCE(c.tg_user_id, CASE WHEN c.tg_chat_id ~ '^\d+$' THEN (c.tg_chat_id)::BIGINT ELSE NULL END) AS tg_user_id,
  c.spender_id,
  c.model_id,
  c.assigned_chatter_id,
  c.status,
  c.last_message_at,
  c.created_at,
  COALESCE(c.tg_username, c.username, s.telegram_username, 'tg_' || COALESCE(c.tg_user_id::text, c.tg_chat_id)) AS tg_username,
  COALESCE(c.username, c.tg_username, s.telegram_username, 'tg_' || COALESCE(c.tg_user_id::text, c.tg_chat_id)) AS username,
  COALESCE(c.display_name, c.tg_display_name, c.name, s.name, 'tg_' || COALESCE(c.tg_user_id::text, c.tg_chat_id)) AS display_name
FROM public.tg_conversations c
LEFT JOIN public.spenders s ON s.id = c.spender_id OR (c.tg_user_id IS NOT NULL AND s.tg_user_id = c.tg_user_id);

GRANT SELECT ON public.v_tg_conversations TO authenticated;

-- ── C) v_bot_autofill_metrics (métriques réelles) ──────────────────────────────
DROP VIEW IF EXISTS public.v_bot_autofill_metrics;
CREATE VIEW public.v_bot_autofill_metrics AS
SELECT
  (SELECT COUNT(*)::INTEGER FROM public.tg_messages WHERE created_at >= now() - INTERVAL '24 hours') AS msgs_24h,
  (SELECT COUNT(*)::INTEGER FROM public.spender_events WHERE event_type IN ('new_spender','spender_created') AND created_at >= now() - INTERVAL '24 hours') AS spenders_created_24h,
  (SELECT COUNT(*)::INTEGER FROM public.spender_events WHERE event_type IN ('profile_updated','enriched','spender_enriched') AND created_at >= now() - INTERVAL '24 hours') AS spenders_updated_24h,
  (SELECT COUNT(*)::INTEGER FROM public.spender_enrich_queue WHERE status IN ('queued','processing')) AS enrich_pending,
  (SELECT COUNT(*)::INTEGER FROM public.spender_enrich_queue WHERE status = 'done' AND updated_at >= now() - INTERVAL '24 hours') AS enrich_done,
  0::INTEGER AS errors_24h;

GRANT SELECT ON public.v_bot_autofill_metrics TO authenticated;

-- ── C) v_bot_autofill_events (50 derniers events) ─────────────────────────────
DROP VIEW IF EXISTS public.v_bot_autofill_events;
CREATE VIEW public.v_bot_autofill_events AS
SELECT * FROM (
  SELECT e.id, e.event_type AS type, e.tg_user_id, e.spender_id, e.created_at,
    COALESCE(e.data->>'summary', e.event_type) AS message, COALESCE(e.data, '{}'::jsonb) AS payload
  FROM public.spender_events e
  ORDER BY e.created_at DESC
  LIMIT 50
) sub;

GRANT SELECT ON public.v_bot_autofill_events TO authenticated;
