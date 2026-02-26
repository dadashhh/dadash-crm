-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 006: Tests SQL — vérification des contraintes, idempotence, views
-- Pipeline: Telegram → Spender
-- Date: 2026-02-26
--
-- Ce fichier utilise des DO blocks qui RAISE EXCEPTION en cas d'échec.
-- Safe to re-run: chaque test nettoie ses données (DELETE WHERE ... test markers).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- TEST 1: Vérifier que les tables existent avec les bonnes colonnes
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  col_count integer;
BEGIN
  -- spenders: tg_user_id doit être BIGINT
  SELECT count(*) INTO col_count
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'spenders'
     AND column_name = 'tg_user_id'
     AND data_type = 'bigint';
  IF col_count = 0 THEN
    RAISE EXCEPTION 'TEST FAIL: spenders.tg_user_id must be BIGINT';
  END IF;

  -- spenders: meta doit exister
  SELECT count(*) INTO col_count
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'spenders'
     AND column_name = 'meta';
  IF col_count = 0 THEN
    RAISE EXCEPTION 'TEST FAIL: spenders.meta column missing';
  END IF;

  -- spenders: last_seen_at doit exister
  SELECT count(*) INTO col_count
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'spenders'
     AND column_name = 'last_seen_at';
  IF col_count = 0 THEN
    RAISE EXCEPTION 'TEST FAIL: spenders.last_seen_at column missing';
  END IF;

  -- spender_events: idempotency_key doit exister NOT NULL
  SELECT count(*) INTO col_count
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'spender_events'
     AND column_name = 'idempotency_key'
     AND is_nullable = 'NO';
  IF col_count = 0 THEN
    RAISE EXCEPTION 'TEST FAIL: spender_events.idempotency_key must exist and be NOT NULL';
  END IF;

  -- spender_events: data doit exister
  SELECT count(*) INTO col_count
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'spender_events'
     AND column_name = 'data';
  IF col_count = 0 THEN
    RAISE EXCEPTION 'TEST FAIL: spender_events.data column missing';
  END IF;

  -- spender_enrich_queue: table must exist
  SELECT count(*) INTO col_count
    FROM information_schema.tables
   WHERE table_schema = 'public'
     AND table_name = 'spender_enrich_queue';
  IF col_count = 0 THEN
    RAISE EXCEPTION 'TEST FAIL: spender_enrich_queue table missing';
  END IF;

  RAISE NOTICE 'TEST 1 PASSED: All tables and columns verified';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- TEST 2: Vérifier les index critiques
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  idx_count integer;
BEGIN
  -- spenders: unique index on tg_user_id
  SELECT count(*) INTO idx_count
    FROM pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'spenders'
     AND indexname = 'uq_spenders_tg_user_id';
  IF idx_count = 0 THEN
    RAISE EXCEPTION 'TEST FAIL: uq_spenders_tg_user_id index missing';
  END IF;

  -- spender_events: dedup index
  SELECT count(*) INTO idx_count
    FROM pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'spender_events'
     AND indexname = 'uq_spender_events_dedup';
  IF idx_count = 0 THEN
    RAISE EXCEPTION 'TEST FAIL: uq_spender_events_dedup index missing';
  END IF;

  -- spender_enrich_queue: unique on conversation_id
  SELECT count(*) INTO idx_count
    FROM pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'spender_enrich_queue'
     AND indexname = 'uq_enrich_queue_conversation_id';
  IF idx_count = 0 THEN
    RAISE EXCEPTION 'TEST FAIL: uq_enrich_queue_conversation_id index missing';
  END IF;

  -- spender_enrich_queue: status + updated_at composite index
  SELECT count(*) INTO idx_count
    FROM pg_indexes
   WHERE schemaname = 'public'
     AND tablename = 'spender_enrich_queue'
     AND indexname = 'idx_enrich_queue_status_updated';
  IF idx_count = 0 THEN
    RAISE EXCEPTION 'TEST FAIL: idx_enrich_queue_status_updated index missing';
  END IF;

  RAISE NOTICE 'TEST 2 PASSED: All critical indexes verified';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- TEST 3: Idempotent event insertion (dedup via fn_insert_spender_event)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_id1 UUID;
  v_id2 UUID;
  v_count integer;
BEGIN
  -- Insert first event
  v_id1 := public.fn_insert_spender_event(
    p_tg_user_id      := 999999901,
    p_event_type      := 'new_spender',
    p_idempotency_key := '__test_idem_001',
    p_data            := '{"test": true}'::jsonb
  );

  IF v_id1 IS NULL THEN
    RAISE EXCEPTION 'TEST FAIL: fn_insert_spender_event returned NULL on first insert';
  END IF;

  -- Insert same event again (should return same id, no duplicate)
  v_id2 := public.fn_insert_spender_event(
    p_tg_user_id      := 999999901,
    p_event_type      := 'new_spender',
    p_idempotency_key := '__test_idem_001',
    p_data            := '{"test": true, "attempt": 2}'::jsonb
  );

  IF v_id1 <> v_id2 THEN
    RAISE EXCEPTION 'TEST FAIL: Idempotent insert returned different IDs: % vs %', v_id1, v_id2;
  END IF;

  -- Verify only 1 row exists
  SELECT count(*) INTO v_count
    FROM public.spender_events
   WHERE tg_user_id = 999999901
     AND event_type = 'new_spender'
     AND idempotency_key = '__test_idem_001';

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL: Expected 1 row, found %', v_count;
  END IF;

  -- Cleanup
  DELETE FROM public.spender_events
   WHERE tg_user_id = 999999901
     AND idempotency_key LIKE '__test_%';

  RAISE NOTICE 'TEST 3 PASSED: Idempotent event insertion verified';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- TEST 4: Enrich queue idempotence
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_conv_id UUID := gen_random_uuid();
  v_id1 UUID;
  v_id2 UUID;
  v_status text;
  v_count integer;
BEGIN
  -- Enqueue
  v_id1 := public.fn_enqueue_enrich(v_conv_id, 999999902, 100);

  IF v_id1 IS NULL THEN
    RAISE EXCEPTION 'TEST FAIL: fn_enqueue_enrich returned NULL';
  END IF;

  -- Double-enqueue (should not create duplicate)
  v_id2 := public.fn_enqueue_enrich(v_conv_id, 999999902, 200);

  IF v_id1 <> v_id2 THEN
    RAISE EXCEPTION 'TEST FAIL: Double enqueue returned different IDs';
  END IF;

  SELECT count(*) INTO v_count
    FROM public.spender_enrich_queue
   WHERE conversation_id = v_conv_id;

  IF v_count <> 1 THEN
    RAISE EXCEPTION 'TEST FAIL: Expected 1 queue row, found %', v_count;
  END IF;

  -- last_message_id should be updated to 200
  SELECT status INTO v_status
    FROM public.spender_enrich_queue
   WHERE conversation_id = v_conv_id;

  IF v_status <> 'queued' THEN
    RAISE EXCEPTION 'TEST FAIL: Expected status queued, got %', v_status;
  END IF;

  -- Complete the job
  PERFORM public.fn_complete_enrich_job(v_id1, 'done');

  SELECT status INTO v_status
    FROM public.spender_enrich_queue
   WHERE id = v_id1;

  IF v_status <> 'done' THEN
    RAISE EXCEPTION 'TEST FAIL: Expected status done after complete, got %', v_status;
  END IF;

  -- Re-enqueue completed job → should go back to 'queued'
  PERFORM public.fn_enqueue_enrich(v_conv_id, 999999902, 300);

  SELECT status INTO v_status
    FROM public.spender_enrich_queue
   WHERE conversation_id = v_conv_id;

  IF v_status <> 'queued' THEN
    RAISE EXCEPTION 'TEST FAIL: Re-enqueue of done job should set status to queued, got %', v_status;
  END IF;

  -- Cleanup
  DELETE FROM public.spender_enrich_queue WHERE conversation_id = v_conv_id;

  RAISE NOTICE 'TEST 4 PASSED: Enrich queue idempotence verified';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- TEST 5: v_activity_feed returns data
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_feed_count integer;
  v_feed_row record;
BEGIN
  -- Insert test event
  PERFORM public.fn_insert_spender_event(
    p_tg_user_id      := 999999903,
    p_event_type      := 'new_spender',
    p_idempotency_key := '__test_feed_001',
    p_data            := '{"summary": "Test feed item"}'::jsonb
  );

  -- Query the view
  SELECT count(*) INTO v_feed_count
    FROM public.v_activity_feed
   WHERE tg_user_id = 999999903;

  IF v_feed_count = 0 THEN
    RAISE EXCEPTION 'TEST FAIL: v_activity_feed returned 0 rows for test event';
  END IF;

  -- Verify columns
  SELECT * INTO v_feed_row
    FROM public.v_activity_feed
   WHERE tg_user_id = 999999903
   LIMIT 1;

  IF v_feed_row.event_type IS NULL THEN
    RAISE EXCEPTION 'TEST FAIL: v_activity_feed.event_type is NULL';
  END IF;

  IF v_feed_row.title IS NULL THEN
    RAISE EXCEPTION 'TEST FAIL: v_activity_feed.title is NULL';
  END IF;

  IF v_feed_row.subtitle IS NULL THEN
    RAISE EXCEPTION 'TEST FAIL: v_activity_feed.subtitle is NULL';
  END IF;

  -- Test fn_get_activity_feed RPC
  SELECT count(*) INTO v_feed_count
    FROM public.fn_get_activity_feed(10, 0, 'new_spender')
   WHERE tg_user_id = 999999903;

  IF v_feed_count = 0 THEN
    RAISE EXCEPTION 'TEST FAIL: fn_get_activity_feed returned 0 rows';
  END IF;

  -- Cleanup
  DELETE FROM public.spender_events
   WHERE tg_user_id = 999999903
     AND idempotency_key LIKE '__test_%';

  RAISE NOTICE 'TEST 5 PASSED: v_activity_feed and fn_get_activity_feed verified';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- TEST 6: RLS is enabled on all pipeline tables
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  rls_enabled boolean;
BEGIN
  SELECT relrowsecurity INTO rls_enabled
    FROM pg_class
   WHERE relname = 'spenders' AND relnamespace = 'public'::regnamespace;
  IF NOT rls_enabled THEN
    RAISE EXCEPTION 'TEST FAIL: RLS not enabled on spenders';
  END IF;

  SELECT relrowsecurity INTO rls_enabled
    FROM pg_class
   WHERE relname = 'spender_events' AND relnamespace = 'public'::regnamespace;
  IF NOT rls_enabled THEN
    RAISE EXCEPTION 'TEST FAIL: RLS not enabled on spender_events';
  END IF;

  SELECT relrowsecurity INTO rls_enabled
    FROM pg_class
   WHERE relname = 'spender_enrich_queue' AND relnamespace = 'public'::regnamespace;
  IF NOT rls_enabled THEN
    RAISE EXCEPTION 'TEST FAIL: RLS not enabled on spender_enrich_queue';
  END IF;

  RAISE NOTICE 'TEST 6 PASSED: RLS enabled on all pipeline tables';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- TEST 7: CHECK constraint on spender_events.event_type
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- This should fail due to CHECK constraint
  BEGIN
    INSERT INTO public.spender_events (tg_user_id, event_type, idempotency_key, data)
    VALUES (999999904, 'INVALID_TYPE_XYZ', '__test_check_001', '{}'::jsonb);

    -- If we get here, the constraint is missing
    DELETE FROM public.spender_events
     WHERE tg_user_id = 999999904 AND idempotency_key = '__test_check_001';
    RAISE EXCEPTION 'TEST FAIL: CHECK constraint on event_type did not reject invalid value';
  EXCEPTION
    WHEN check_violation THEN
      -- Expected behavior
      NULL;
  END;

  RAISE NOTICE 'TEST 7 PASSED: CHECK constraint on event_type works';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- TEST 8: CHECK constraint on spender_enrich_queue.status
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  BEGIN
    INSERT INTO public.spender_enrich_queue (conversation_id, tg_user_id, status)
    VALUES (gen_random_uuid(), 999999905, 'INVALID_STATUS');

    DELETE FROM public.spender_enrich_queue WHERE tg_user_id = 999999905;
    RAISE EXCEPTION 'TEST FAIL: CHECK constraint on queue status did not reject invalid value';
  EXCEPTION
    WHEN check_violation THEN
      NULL;
  END;

  RAISE NOTICE 'TEST 8 PASSED: CHECK constraint on queue status works';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
DO $$ BEGIN
  RAISE NOTICE '═══════════════════════════════════════════════════';
  RAISE NOTICE '  ALL TESTS PASSED — Pipeline Spender DB verified';
  RAISE NOTICE '═══════════════════════════════════════════════════';
END $$;
-- ═══════════════════════════════════════════════════════════════════════════════
