-- ═══════════════════════════════════════════════════════════════════════════════
-- CHECKLIST TESTS — DADASH compatibilité
-- Exécuter MANUELLEMENT après 20260227_dadash_compat_layer.sql (pas une migration)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── TEST 1: Sync TG ne plante plus (colonnes tg_conversations) ───────────────
-- Le front fait: SELECT id,tg_chat_id,tg_peer_id,tg_user_id,username,tg_username,display_name,spender_id FROM tg_conversations
SELECT id, tg_chat_id, tg_peer_id, tg_user_id, username, tg_username, display_name, spender_id
FROM public.tg_conversations
LIMIT 1;
-- Attendu: pas d'erreur "column does not exist"

-- ── TEST 2: Activity feed — New Spenders ────────────────────────────────────
SELECT * FROM public.v_activity_feed
WHERE event_type IN ('new_spender', 'spender_created')
ORDER BY created_at DESC
LIMIT 5;
-- Attendu: rows si des events new_spender existent

-- ── TEST 3: Activity feed — Enrichment ────────────────────────────────────────
SELECT * FROM public.v_activity_feed
WHERE event_type IN ('profile_updated', 'enriched', 'spender_enriched', 'classification_changed', 'handle_set', 'status_changed')
ORDER BY created_at DESC
LIMIT 5;
-- Attendu: rows si des events enrichment existent

-- ── TEST 4: Activity feed — Messages ───────────────────────────────────────────
SELECT * FROM public.v_activity_feed
WHERE event_type IN ('new_message', 'message', 'tx_created')
ORDER BY created_at DESC
LIMIT 5;
-- Attendu: rows si des events message existent

-- ── TEST 5: v_activity_feed_unified — 3 catégories ─────────────────────────────
SELECT category, COUNT(*) AS cnt
FROM public.v_activity_feed_unified
GROUP BY category;
-- Attendu: au moins une ligne par catégorie ayant des events

-- ── TEST 6: fn_get_activity_feed_unified RPC ─────────────────────────────────
SELECT * FROM public.fn_get_activity_feed_unified(10, 0, NULL);
SELECT * FROM public.fn_get_activity_feed_unified(5, 0, 'new_spender');
SELECT * FROM public.fn_get_activity_feed_unified(5, 0, 'enrichment');
SELECT * FROM public.fn_get_activity_feed_unified(5, 0, 'message');
-- Attendu: pas d'erreur, rows selon les données

-- ── TEST 7: Insert event de chaque type (smoke) ───────────────────────────────
-- Décommenter pour insérer des events de test (nettoyer après)
/*
DO $$
DECLARE
  v_tg bigint := 999999999;
BEGIN
  PERFORM fn_insert_spender_event(v_tg, 'new_spender', 'test:new', '{}'::jsonb);
  PERFORM fn_insert_spender_event(v_tg, 'profile_updated', 'test:profile', '{}'::jsonb);
  PERFORM fn_insert_spender_event(v_tg, 'new_message', 'test:msg', '{}'::jsonb);
  -- Nettoyage
  DELETE FROM spender_events WHERE tg_user_id = v_tg;
END $$;
*/
