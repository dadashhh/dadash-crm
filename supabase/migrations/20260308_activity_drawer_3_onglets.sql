-- ═══════════════════════════════════════════════════════════════════════════════
-- ACTIVITY DRAWER — 3 onglets data-driven
-- v_activity_new_spenders, v_activity_enrichments, v_activity_messages
-- Colonnes garanties: id, created_at, title, subtitle, tg_user_id, spender_id, payload
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. NEW SPENDER (spender_events: new_spender, spender_created) ─────────────
DROP VIEW IF EXISTS public.v_activity_new_spenders;
CREATE VIEW public.v_activity_new_spenders AS
SELECT
  e.id,
  e.created_at,
  COALESCE(
    e.data->>'summary',
    CASE e.event_type WHEN 'new_spender' THEN 'Nouveau spender' WHEN 'spender_created' THEN 'Spender créé' ELSE 'Nouveau spender' END,
    'tg_' || e.tg_user_id::text
  ) AS title,
  COALESCE(s.handle, s.telegram_username, 'tg_' || e.tg_user_id::text) AS subtitle,
  e.tg_user_id,
  COALESCE(e.spender_id, (SELECT id FROM public.spenders WHERE tg_user_id = e.tg_user_id LIMIT 1)) AS spender_id,
  COALESCE(e.data, '{}'::jsonb) AS payload
FROM public.spender_events e
LEFT JOIN public.spenders s ON s.tg_user_id = e.tg_user_id
WHERE e.event_type IN ('new_spender', 'spender_created');

-- ── 2. SPENDER ENRICHMENT (spender_events: profile_updated, enriched, spender_enriched, etc.) ──
DROP VIEW IF EXISTS public.v_activity_enrichments;
CREATE VIEW public.v_activity_enrichments AS
SELECT
  e.id,
  e.created_at,
  COALESCE(
    e.data->>'summary',
    CASE e.event_type
      WHEN 'profile_updated' THEN 'Profil mis à jour'
      WHEN 'enriched' THEN 'Enrichi'
      WHEN 'spender_enriched' THEN 'Spender enrichi'
      WHEN 'classification_changed' THEN 'Classification changée'
      WHEN 'handle_set' THEN 'Handle défini'
      WHEN 'status_changed' THEN 'Statut changé'
      ELSE COALESCE(e.event_type, 'Enrichment')
    END,
    'tg_' || e.tg_user_id::text
  ) AS title,
  COALESCE(s.handle, s.telegram_username, 'tg_' || e.tg_user_id::text) AS subtitle,
  e.tg_user_id,
  COALESCE(e.spender_id, (SELECT id FROM public.spenders WHERE tg_user_id = e.tg_user_id LIMIT 1)) AS spender_id,
  COALESCE(e.data, '{}'::jsonb) AS payload
FROM public.spender_events e
LEFT JOIN public.spenders s ON s.tg_user_id = e.tg_user_id
WHERE e.event_type IN ('profile_updated', 'enriched', 'spender_enriched', 'classification_changed', 'handle_set', 'status_changed');

-- ── 3. NEW MESSAGES (tg_messages + tg_conversations) ───────────────────────────
DROP VIEW IF EXISTS public.v_activity_messages;
CREATE VIEW public.v_activity_messages AS
SELECT
  m.id,
  m.created_at,
  COALESCE(
    NULLIF(TRIM(m.text), ''),
    CASE m.direction WHEN 'in' THEN 'Message reçu' ELSE 'Message envoyé' END
  ) AS title,
  COALESCE(
    s.handle,
    s.telegram_username,
    c.tg_username,
    (m.meta->>'tg_user_id')::text,
    'tg_' || COALESCE((m.meta->>'tg_user_id')::text, c.tg_chat_id)
  ) AS subtitle,
  CASE WHEN (m.meta->>'tg_user_id') ~ '^\d+$' THEN (m.meta->>'tg_user_id')::BIGINT
       WHEN c.tg_user_id IS NOT NULL THEN c.tg_user_id
       ELSE NULL END AS tg_user_id,
  COALESCE(c.spender_id, (SELECT id FROM public.spenders WHERE tg_user_id::text = COALESCE(m.meta->>'tg_user_id', c.tg_chat_id) LIMIT 1)) AS spender_id,
  jsonb_build_object(
    'text', LEFT(m.text, 200),
    'direction', m.direction,
    'tg_message_id', m.tg_message_id,
    'conversation_id', m.conversation_id
  ) AS payload
FROM public.tg_messages m
LEFT JOIN public.tg_conversations c ON c.id = m.conversation_id
LEFT JOIN public.spenders s ON s.tg_user_id::text = COALESCE(m.meta->>'tg_user_id', c.tg_user_id::text, c.tg_chat_id);

GRANT SELECT ON public.v_activity_new_spenders TO authenticated;
GRANT SELECT ON public.v_activity_enrichments TO authenticated;
GRANT SELECT ON public.v_activity_messages TO authenticated;
