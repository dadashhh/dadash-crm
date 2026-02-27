-- ═══════════════════════════════════════════════════════════════════════════════
-- 3 REQUÊTES DEBUG — Pipeline spenders propre
-- Exécuter manuellement pour vérifier le flux
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Derniers spenders (v_spenders)
SELECT id, tg_user_id, username, handle, display_name, last_activity_at
FROM public.v_spenders
ORDER BY last_activity_at DESC NULLS LAST
LIMIT 10;

-- 2. Derniers events (v_spender_events)
SELECT id, type, tg_user_id, handle, payload->>'summary' AS summary, created_at
FROM public.v_spender_events
ORDER BY created_at DESC
LIMIT 15;

-- 3. Test fn_upsert_spender_from_tg (smoke — nettoyer après)
-- SELECT fn_upsert_spender_from_tg(888888888::bigint, 'test_user', 'Test Display', '{"profile":{"telegram":{"source":"debug"}}}'::jsonb);
