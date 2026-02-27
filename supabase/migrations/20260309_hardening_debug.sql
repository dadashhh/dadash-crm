-- ═══════════════════════════════════════════════════════════════════════════════
-- 5 REQUÊTES DEBUG — Hardening final
-- Exécuter manuellement
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. v_tg_conversations (Sync TG compat)
SELECT id, tg_chat_id, tg_peer_id, tg_user_id, tg_username, username, display_name, spender_id
FROM public.v_tg_conversations
LIMIT 5;

-- 2. Métriques bot autofill
SELECT * FROM public.v_bot_autofill_metrics;

-- 3. 10 derniers events bot
SELECT id, type, tg_user_id, message, created_at
FROM public.v_bot_autofill_events
LIMIT 10;

-- 4. Colonnes tg_conversations (audit)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'tg_conversations'
ORDER BY ordinal_position;

-- 5. Sync TG — conversations sans spender
SELECT c.id, c.tg_chat_id, c.tg_user_id, c.spender_id
FROM public.v_tg_conversations c
WHERE c.tg_user_id IS NOT NULL AND c.spender_id IS NULL
LIMIT 10;
