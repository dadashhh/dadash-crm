-- ═══════════════════════════════════════════════════════════════════════════
-- AUDIT SUPABASE — Snapshot complet du schéma DB
-- Exécuter dans le SQL Editor Supabase AVANT tout fix
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. COLONNES + TYPES pour les tables clés
-- ─────────────────────────────────────────────────────────────────────────
SELECT
  table_name,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'transactions', 'spenders', 'spender_events',
    'tg_conversations', 'tg_messages',
    'payment_events', 'ledger_entries',
    'notifications', 'manager_settings',
    'manager_alerts', 'profiles'
  )
ORDER BY table_name, ordinal_position;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. CHECK CONSTRAINTS sur ledger_entries + payment_events
-- ─────────────────────────────────────────────────────────────────────────
SELECT
  c.conname   AS constraint_name,
  c.conrelid::regclass AS table_name,
  c.contype   AS constraint_type,
  pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class t ON c.conrelid = t.oid
JOIN pg_namespace n ON t.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND t.relname IN ('ledger_entries', 'payment_events', 'transactions')
  AND c.contype = 'c'
ORDER BY t.relname, c.conname;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. TRIGGERS sur payment_events, spenders, transactions
-- ─────────────────────────────────────────────────────────────────────────
SELECT
  tg.tgname       AS trigger_name,
  t.relname       AS table_name,
  p.proname       AS function_name,
  CASE tg.tgenabled
    WHEN 'O' THEN 'enabled'
    WHEN 'D' THEN 'disabled'
    ELSE tg.tgenabled::text
  END AS status,
  CASE
    WHEN tg.tgtype & 2 = 2 THEN 'BEFORE'
    WHEN tg.tgtype & 64 = 64 THEN 'INSTEAD OF'
    ELSE 'AFTER'
  END AS timing,
  CASE
    WHEN tg.tgtype & 4 = 4 THEN 'INSERT'
    WHEN tg.tgtype & 8 = 8 THEN 'DELETE'
    WHEN tg.tgtype & 16 = 16 THEN 'UPDATE'
    WHEN tg.tgtype & 20 = 20 THEN 'INSERT OR UPDATE'
    ELSE 'OTHER'
  END AS event
FROM pg_trigger tg
JOIN pg_class t ON tg.tgrelid = t.oid
JOIN pg_proc p ON tg.tgfoid = p.oid
JOIN pg_namespace n ON t.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND t.relname IN ('payment_events', 'spenders', 'transactions')
  AND NOT tg.tgisinternal
ORDER BY t.relname, tg.tgname;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. RLS POLICIES sur tables clés
-- ─────────────────────────────────────────────────────────────────────────
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'transactions', 'spenders', 'payment_events',
    'ledger_entries', 'notifications', 'profiles',
    'manager_alerts', 'manager_settings'
  )
ORDER BY tablename, policyname;

-- ─────────────────────────────────────────────────────────────────────────
-- 5. ROW COUNTS pour valider la présence de données
-- ─────────────────────────────────────────────────────────────────────────
SELECT 'transactions' AS tbl, COUNT(*) AS cnt FROM transactions
UNION ALL SELECT 'spenders', COUNT(*) FROM spenders
UNION ALL SELECT 'spender_events', COUNT(*) FROM spender_events
UNION ALL SELECT 'payment_events', COUNT(*) FROM payment_events
UNION ALL SELECT 'ledger_entries', COUNT(*) FROM ledger_entries
UNION ALL SELECT 'notifications', COUNT(*) FROM notifications
UNION ALL SELECT 'profiles', COUNT(*) FROM profiles
UNION ALL SELECT 'manager_alerts', COUNT(*) FROM manager_alerts
ORDER BY tbl;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. TRANSACTIONS par status (vérifier distribution)
-- ─────────────────────────────────────────────────────────────────────────
SELECT status, currency, COUNT(*), SUM(amount) AS total_amount
FROM transactions
GROUP BY status, currency
ORDER BY status, currency;

-- ─────────────────────────────────────────────────────────────────────────
-- 7. DISTINCT entry_type dans ledger_entries (vérifier cohérence)
-- ─────────────────────────────────────────────────────────────────────────
SELECT DISTINCT entry_type, COUNT(*) AS cnt
FROM ledger_entries
GROUP BY entry_type;

-- ─────────────────────────────────────────────────────────────────────────
-- 8. FONCTIONS trigger (vérifier SECURITY DEFINER)
-- ─────────────────────────────────────────────────────────────────────────
SELECT
  p.proname AS function_name,
  p.prosecdef AS security_definer,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'fn_payment_event_paid',
    'fn_tx_validated',
    'fn_spender_vip',
    'fn_spender_hot',
    'fn_budget_high',
    'fn_tx_burst'
  );
