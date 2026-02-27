-- ═══════════════════════════════════════════════════════════════════════════════
-- DADASH — Queries de vérification (post-migration)
-- Exécuter après 20260313_dadash_tg_ids_zero_confusion + pipeline_compat
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Types et colonnes ─────────────────────────────────────────────────────
SELECT
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN ('spenders', 'spender_events', 'spender_enrich_queue', 'tg_conversations')
  AND c.column_name IN ('tg_user_id', 'is_active', 'merged_into_id')
ORDER BY c.table_name, c.column_name;

-- ── 2. Doublons spenders (tg_user_id normalisé) ──────────────────────────────
SELECT
  public.normalize_tg_user_id(tg_user_id) AS tg_user_id_norm,
  COUNT(*) AS cnt,
  array_agg(id::text) AS spender_ids
FROM public.spenders
WHERE tg_user_id IS NOT NULL AND is_active = true
GROUP BY public.normalize_tg_user_id(tg_user_id)
HAVING COUNT(*) > 1;

-- ── 3. Index unique spenders ─────────────────────────────────────────────────
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'spenders'
  AND indexdef ILIKE '%tg_user_id%';

-- ── 4. Counts par table ────────────────────────────────────────────────────
SELECT 'spenders (active)' AS tbl, COUNT(*) AS cnt FROM public.spenders WHERE is_active = true
UNION ALL
SELECT 'spenders (merged)' AS tbl, COUNT(*) FROM public.spenders WHERE is_active = false
UNION ALL
SELECT 'spender_events' AS tbl, COUNT(*) FROM public.spender_events
UNION ALL
SELECT 'spender_enrich_queue' AS tbl, COUNT(*) FROM public.spender_enrich_queue
UNION ALL
SELECT 'tg_conversations' AS tbl, COUNT(*) FROM public.tg_conversations
UNION ALL
SELECT 'tg_messages' AS tbl, COUNT(*) FROM public.tg_messages;

-- ── 5. Sample v_spenders ───────────────────────────────────────────────────
SELECT id, tg_user_id, username, handle, display_name, status, created_at
FROM public.v_spenders
ORDER BY created_at DESC
LIMIT 5;

-- ── 6. Sample v_activity_feed ─────────────────────────────────────────────
SELECT id, type, tg_user_id, spender_id, title, subtitle, created_at
FROM public.v_activity_feed
ORDER BY created_at DESC
LIMIT 10;

-- ── 7. Test normalize_tg_user_id ────────────────────────────────────────────
SELECT
  public.normalize_tg_user_id('123456') AS n1,
  public.normalize_tg_user_id(' 123456 ') AS n2,
  public.normalize_tg_user_id('tg:123456') AS n3,
  public.normalize_tg_user_id(NULL) AS n4;
