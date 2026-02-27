-- ═══════════════════════════════════════════════════════════════════════════════
-- DEBUG CHECKLIST — Node.js pipeline (tg_messages → enrich → spenders → events → DADASH)
-- 5 requêtes pour vérifier le chaînage complet. Exécuter MANUELLEMENT.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Spenders récents (handle, display_name, meta.profile) ─────────────────
SELECT id, tg_user_id, handle, display_name, telegram_username, status,
       meta->'profile'->'telegram' AS profile_telegram,
       meta->'profile'->'identity' AS profile_identity,
       meta->'profile'->'location' AS profile_location,
       updated_at
FROM public.spenders
ORDER BY updated_at DESC NULLS LAST
LIMIT 10;

-- ── 2. Spender events récents (tous types) ────────────────────────────────────
SELECT id, event_type, tg_user_id, spender_id, idempotency_key,
       data->>'summary' AS summary,
       created_at
FROM public.spender_events
ORDER BY created_at DESC
LIMIT 20;

-- ── 3. Détails tg_user_id (cohérence spenders ↔ tg_conversations) ───────────
SELECT s.id AS spender_id, s.tg_user_id, s.handle, s.display_name,
       c.id AS conv_id, c.tg_chat_id, c.tg_user_id AS conv_tg_user_id,
       c.tg_username, c.display_name AS conv_display_name
FROM public.spenders s
LEFT JOIN public.tg_conversations c ON c.tg_user_id::text = s.tg_user_id::text
ORDER BY s.updated_at DESC NULLS LAST
LIMIT 10;

-- ── 4. Events profile_updated (enrichment réussi) ─────────────────────────────
SELECT id, event_type, tg_user_id, data->>'summary' AS summary,
       data->'fields' AS changed_fields,
       data->'extracted' AS extracted_profile,
       created_at
FROM public.spender_events
WHERE event_type = 'profile_updated'
ORDER BY created_at DESC
LIMIT 10;

-- ── 5. Events message récents (tg_messages → spender_events) ──────────────────
SELECT e.id, e.event_type, e.tg_user_id, e.data->>'summary' AS summary,
       e.data->>'tg_message_id' AS tg_message_id,
       e.created_at
FROM public.spender_events e
WHERE e.event_type IN ('new_message', 'message')
ORDER BY e.created_at DESC
LIMIT 15;
