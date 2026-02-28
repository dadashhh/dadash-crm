-- ═══════════════════════════════════════════════════════════════════════════════
-- DIAGNOSTIC + FIX AGRESSIF
-- Coller dans Supabase SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- DIAG 1: Combien de spenders manuels (sans tg_user_id) ?
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'DIAG 1: Spenders sans tg_user_id' AS diagnostic,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE handle IS NOT NULL AND handle <> '') AS with_handle,
  COUNT(*) FILTER (WHERE telegram_username IS NOT NULL AND telegram_username <> '') AS with_tg_username
FROM spenders
WHERE tg_user_id IS NULL OR tg_user_id::text = '' OR tg_user_id::text = '0';

-- ─────────────────────────────────────────────────────────────────────────────
-- DIAG 2: Les spenders manuels et leurs handles
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'DIAG 2' AS diag, id, handle, telegram_username, tg_user_id::text, name, display_name, age, city, job
FROM spenders
WHERE tg_user_id IS NULL OR tg_user_id::text = '' OR tg_user_id::text = '0'
ORDER BY updated_at DESC
LIMIT 30;

-- ─────────────────────────────────────────────────────────────────────────────
-- DIAG 3: Combien de conversations ont un username ?
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'DIAG 3: Conversations' AS diagnostic,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE username IS NOT NULL AND username <> '') AS with_username,
  COUNT(*) FILTER (WHERE tg_user_id IS NOT NULL) AS with_tg_user_id,
  COUNT(*) FILTER (WHERE spender_id IS NOT NULL) AS with_spender_linked
FROM tg_conversations;

-- ─────────────────────────────────────────────────────────────────────────────
-- DIAG 4: Usernames dans tg_messages.meta (la source de vérité)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'DIAG 4: tg_messages.meta usernames' AS diagnostic,
  COUNT(DISTINCT conversation_id) AS convs_with_username
FROM tg_messages
WHERE direction = 'in'
  AND meta IS NOT NULL
  AND meta->>'username' IS NOT NULL
  AND TRIM(meta->>'username') <> '';

-- ─────────────────────────────────────────────────────────────────────────────
-- DIAG 5: Échantillon de tg_messages.meta pour voir le format
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'DIAG 5' AS diag,
  conversation_id,
  meta->>'username' AS msg_username,
  meta->>'tg_user_id' AS msg_tg_user_id,
  meta->>'display_name' AS msg_display_name,
  LEFT(text, 80) AS text_preview
FROM tg_messages
WHERE direction = 'in' AND meta IS NOT NULL
ORDER BY created_at DESC
LIMIT 20;

-- ─────────────────────────────────────────────────────────────────────────────
-- DIAG 6: Est-ce que les spenders avec données (LTV>0) ont des conversations ?
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'DIAG 6' AS diag,
  s.id, s.handle, s.telegram_username, s.tg_user_id::text,
  s.age, s.city,
  (SELECT COUNT(*) FROM tg_conversations c WHERE c.spender_id = s.id) AS conv_count,
  (SELECT COUNT(*) FROM transactions t WHERE t.spender_id = s.id) AS tx_count
FROM spenders s
WHERE (s.tg_user_id IS NULL OR s.tg_user_id::text = '' OR s.tg_user_id::text = '0')
ORDER BY (SELECT COUNT(*) FROM transactions t WHERE t.spender_id = s.id) DESC
LIMIT 20;

-- ─────────────────────────────────────────────────────────────────────────────
-- DIAG 7: Toutes les conversations avec leur username et le spender lié
-- ─────────────────────────────────────────────────────────────────────────────
SELECT 'DIAG 7' AS diag,
  c.id AS conv_id,
  c.tg_chat_id,
  c.username AS conv_username,
  c.tg_user_id::text AS conv_tg_user_id,
  c.spender_id,
  s.handle AS spender_handle,
  s.telegram_username AS spender_tg_username,
  (SELECT COUNT(*) FROM tg_messages m WHERE m.conversation_id = c.id) AS msg_count
FROM tg_conversations c
LEFT JOIN spenders s ON s.id = c.spender_id
ORDER BY c.last_message_at DESC NULLS LAST
LIMIT 30;
