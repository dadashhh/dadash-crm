-- ═══════════════════════════════════════════════════════════════════════════════
-- TÂCHE A — AUDIT SQL : Colonnes exactes des tables clés
-- DADASH compatibilité — Exécuter en lecture seule pour diagnostic
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. Colonnes de chaque table (information_schema.columns)
SELECT
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable,
  c.column_default
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN ('tg_conversations', 'tg_messages', 'spenders', 'spender_events', 'spender_enrich_queue')
ORDER BY c.table_name, c.ordinal_position;

-- 2. Contraintes UNIQUE / PK / index sur spenders.tg_user_id et spender_enrich_queue
SELECT
  i.schemaname,
  i.tablename,
  i.indexname,
  i.indexdef
FROM pg_indexes i
WHERE i.schemaname = 'public'
  AND (
    (i.tablename = 'spenders' AND i.indexdef ILIKE '%tg_user_id%')
    OR (i.tablename = 'spender_enrich_queue')
  )
ORDER BY i.tablename, i.indexname;

-- 3. CHECK constraints sur spender_events.event_type
SELECT
  tc.constraint_name,
  tc.table_name,
  cc.check_clause
FROM information_schema.check_constraints cc
JOIN information_schema.table_constraints tc
  ON tc.constraint_name = cc.constraint_name
  AND tc.constraint_schema = cc.constraint_schema
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'spender_events';
