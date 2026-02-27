-- ═══════════════════════════════════════════════════════════════════════════════
-- Vérifications post-migration 20260316 (sanity checks)
-- Exécuter après 20260316_spender_canonical_compat_layer.sql
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. v_spenders : colonnes canoniques présentes
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'v_spenders'
   AND column_name IN ('id', 'tg_user_id', 'first_name', 'age', 'job', 'city', 'country', 'language', 'notes_chatter', 'relationship', 'source', 'profile_updated_at', 'tg_user_id_text')
 ORDER BY ordinal_position;

-- 2. Sample v_spenders (5 lignes)
SELECT id, tg_user_id, username, handle, first_name, age, city
  FROM public.v_spenders
 ORDER BY last_activity_at DESC NULLS LAST
 LIMIT 5;

-- 3. fn_spender_apply_enrichment existe
SELECT proname, pg_get_function_arguments(oid) AS args
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
 WHERE n.nspname = 'public' AND proname = 'fn_spender_apply_enrichment';

-- 4. fn_merge_spenders existe
SELECT proname FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
 WHERE n.nspname = 'public' AND proname = 'fn_merge_spenders';

-- 5. Indexes spenders
SELECT indexname, indexdef
  FROM pg_indexes
 WHERE schemaname = 'public' AND tablename = 'spenders'
   AND (indexname LIKE 'idx_spenders%' OR indexname LIKE 'uq_spenders%')
 ORDER BY indexname;
