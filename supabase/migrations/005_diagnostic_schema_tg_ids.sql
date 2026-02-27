-- ═══════════════════════════════════════════════════════════════════════════════
-- DIAGNOSTIC SQL — Types exacts des colonnes tg_user_id et IDs Telegram
-- Exécuter pour confirmer l'état du schéma avant/après migrations
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Types des colonnes tg_user_id / tg_peer_id / conversation_id ────────────
SELECT
  c.table_schema,
  c.table_name,
  c.column_name,
  c.data_type,
  c.udt_name,
  c.is_nullable,
  c.column_default
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND (
    c.column_name IN ('tg_user_id', 'tg_peer_id', 'tg_chat_id', 'conversation_id', 'tg_message_id')
    OR (c.table_name IN ('spenders', 'spender_events', 'tg_conversations', 'tg_messages', 'spender_enrich_queue')
        AND c.column_name LIKE '%tg%')
  )
ORDER BY c.table_name, c.column_name;

-- ── 2. Résumé par table ──────────────────────────────────────────────────────
SELECT
  table_name,
  string_agg(column_name || ' (' || data_type || ')', ', ' ORDER BY ordinal_position) AS columns_with_types
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('spenders', 'spender_events', 'tg_conversations', 'tg_messages', 'spender_enrich_queue')
GROUP BY table_name;

-- ── 3. Index UNIQUE existants (anti-doublons) ──────────────────────────────────
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND (indexname LIKE '%uq_%' OR indexname LIKE '%unique%')
  AND tablename IN ('spenders', 'spender_events', 'tg_messages', 'spender_enrich_queue')
ORDER BY tablename;

-- ── 4. Échantillon de valeurs (détection bigint vs text) ──────────────────────
-- spenders.tg_user_id
SELECT 'spenders.tg_user_id' AS col, pg_typeof(tg_user_id)::text AS pg_type, COUNT(*) AS cnt
FROM public.spenders WHERE tg_user_id IS NOT NULL
GROUP BY pg_typeof(tg_user_id);

-- spender_events.tg_user_id
SELECT 'spender_events.tg_user_id' AS col, pg_typeof(tg_user_id)::text AS pg_type, COUNT(*) AS cnt
FROM public.spender_events WHERE tg_user_id IS NOT NULL
GROUP BY pg_typeof(tg_user_id);

-- tg_conversations.tg_user_id (exécuter si la colonne existe)
-- SELECT 'tg_conversations.tg_user_id' AS col, pg_typeof(tg_user_id)::text AS pg_type, COUNT(*) AS cnt
-- FROM public.tg_conversations WHERE tg_user_id IS NOT NULL GROUP BY pg_typeof(tg_user_id);

-- ── 5. Doublons potentiels spenders.tg_user_id ──────────────────────────────────
SELECT
  COALESCE(tg_user_id::text, 'NULL') AS tg_user_id_val,
  COUNT(*) AS cnt,
  array_agg(id::text) AS spender_ids
FROM public.spenders
WHERE tg_user_id IS NOT NULL
  AND (NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='spenders' AND column_name='is_active')
       OR is_active = true)
GROUP BY tg_user_id
HAVING COUNT(*) > 1;
