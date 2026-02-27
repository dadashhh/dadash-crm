-- ═══════════════════════════════════════════════════════════════════════════════
-- 5 REQUÊTES DE VÉRIFICATION — Canon views (exécuter après 20260327_005_canon_views)
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1) Count: v_spenders_canon, v_activity_feed, v_last_messages
SELECT 'v_spenders_canon' AS view_name, COUNT(*) AS cnt FROM public.v_spenders_canon
UNION ALL
SELECT 'v_activity_feed', COUNT(*) FROM public.v_activity_feed
UNION ALL
SELECT 'v_last_messages', COUNT(*) FROM public.v_last_messages;

-- 2) Latest events (10 derniers de l'Activity)
SELECT id, event_type, tg_user_id_text, title, detail, created_at
FROM public.v_activity_feed
ORDER BY created_at DESC
LIMIT 10;

-- 3) Join events → spenders (vérifier que tg_user_id_text matche)
SELECT
  e.id AS event_id,
  e.event_type,
  e.tg_user_id_text,
  e.spender_id,
  s.spender_id AS canon_spender_id,
  s.username AS canon_username
FROM public.v_activity_feed e
LEFT JOIN public.v_spenders_canon s ON s.tg_user_id_text = e.tg_user_id_text
ORDER BY e.created_at DESC
LIMIT 15;

-- 4) Last messages par tg_user_id
SELECT tg_user_id_text, last_message_text, last_message_at, direction
FROM public.v_last_messages
ORDER BY last_message_at DESC
LIMIT 10;

-- 5) Doublons tg_user_id (doit être vide si unique index actif)
SELECT tg_user_id_text, COUNT(*) AS cnt
FROM public.v_spenders_canon
WHERE tg_user_id_text IS NOT NULL
GROUP BY tg_user_id_text
HAVING COUNT(*) > 1;
