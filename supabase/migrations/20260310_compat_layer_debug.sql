-- ═══════════════════════════════════════════════════════════════════════════════
-- DEBUG — Compat layer incassable (exécuter APRÈS 20260310_compat_layer_incassable.sql)
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Vérifier les 5 views
SELECT 'v_tg_conversations' AS view_name, COUNT(*) AS n FROM v_tg_conversations
UNION ALL SELECT 'v_tg_messages', COUNT(*) FROM v_tg_messages
UNION ALL SELECT 'v_spenders', COUNT(*) FROM v_spenders
UNION ALL SELECT 'v_spender_events', COUNT(*) FROM v_spender_events
UNION ALL SELECT 'v_spender_enrich_queue', COUNT(*) FROM v_spender_enrich_queue;

-- 2. Sample v_tg_conversations (tg_username garanti)
SELECT id, tg_chat_id, tg_user_id, tg_username, username, display_name
FROM v_tg_conversations LIMIT 5;

-- 3. Sample v_spenders (colonnes stables)
SELECT id, tg_user_id, username, handle, first_name, age, city, country
FROM v_spenders LIMIT 5;

-- 4. Activity perf: last 150 events
SELECT COUNT(*) FROM (
  SELECT 1 FROM v_spender_events ORDER BY created_at DESC LIMIT 150
) x;
