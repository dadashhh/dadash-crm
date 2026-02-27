-- ═══════════════════════════════════════════════════════════════════════════════
-- SMOKE TESTS — Fix bot autofill spender_events (PROD)
-- Exécuter APRÈS 20260329_fix_bot_autofill_spender_events.sql
-- Ces statements sont des tests READ/WRITE manuels, pas de schema change.
-- En cas d'échec: lire les RAISE WARNING dans les logs Railway/Supabase.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- TEST 1: Vérification du CHECK constraint (non-vide)
-- Attendu: La contrainte chk_spender_events_event_type doit être ABSENTE
--          et chk_spender_events_event_type_nonempty doit être PRÉSENTE
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  conname,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.spender_events'::regclass
  AND contype  = 'c';

-- ─────────────────────────────────────────────────────────────────────────────
-- TEST 2: Vérification de l'index unique partiel
-- Attendu: ux_spender_events_idem présent avec predicate IS NOT NULL
-- ─────────────────────────────────────────────────────────────────────────────
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename  = 'spender_events'
  AND indexname  IN ('uq_spender_events_dedup', 'ux_spender_events_idem');

-- ─────────────────────────────────────────────────────────────────────────────
-- TEST 3: INSERT spender_events avec event_type='spender_enriched'
-- Attendu: 1 ligne retournée, pas de 23514 ni 42P10
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.spender_events (tg_user_id, spender_id, event_type, idempotency_key, data)
VALUES (
  '1580711786',
  NULL,
  'spender_enriched',
  'tg:1580711786:sync:test',
  jsonb_build_object('source', 'sql_test', 'summary', 'ok')
)
ON CONFLICT (event_type, tg_user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
RETURNING *;

-- ─────────────────────────────────────────────────────────────────────────────
-- TEST 3b: Réexécuter TEST 3 → doit retourner 0 ligne (idempotency OK)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.spender_events (tg_user_id, spender_id, event_type, idempotency_key, data)
VALUES (
  '1580711786',
  NULL,
  'spender_enriched',
  'tg:1580711786:sync:test',
  jsonb_build_object('source', 'sql_test', 'summary', 'ok')
)
ON CONFLICT (event_type, tg_user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
RETURNING *;

-- ─────────────────────────────────────────────────────────────────────────────
-- TEST 4: INSERT tg_messages (trigger complet)
-- Attendu: upsert réussi, trigger ne lève plus 23514/42P10
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.tg_messages (conversation_id, tg_message_id, direction, text, created_at, meta)
VALUES (
  'c379d68a-b54a-4bbc-baf8-eecb77cb7a23',
  999999,
  'in',
  'test upsert smoke',
  now(),
  '{}'::jsonb
)
ON CONFLICT (conversation_id, tg_message_id)
DO UPDATE SET
  text       = EXCLUDED.text,
  created_at = EXCLUDED.created_at
RETURNING id, conversation_id, tg_message_id, text, created_at;

-- ─────────────────────────────────────────────────────────────────────────────
-- TEST 5: fn_upsert_spender_from_tg direct (tg_user_id TEXT)
-- Attendu: retourne un UUID valide, pas d'erreur
-- ─────────────────────────────────────────────────────────────────────────────
SELECT public.fn_upsert_spender_from_tg(
  '1580711786',
  'test_user_smoke',
  'Test Smoke User',
  'TestSmoke',
  '{"source": "smoke_test"}'::jsonb,
  'smoke_test'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TEST 6: Vérifier que spender_events se remplit
-- Attendu: au moins 1 ligne avec event_type='spender_enriched' ou 'new_spender'
-- ─────────────────────────────────────────────────────────────────────────────
SELECT event_type, tg_user_id, idempotency_key, created_at
FROM public.spender_events
WHERE tg_user_id = '1580711786'
ORDER BY created_at DESC
LIMIT 10;

-- ─────────────────────────────────────────────────────────────────────────────
-- TEST 7: Métriques bot autofill (H24)
-- Attendu: colonnes spenders_updated_24h et errors_24h lisibles
-- ─────────────────────────────────────────────────────────────────────────────
SELECT * FROM public.v_bot_autofill_metrics;

-- ─────────────────────────────────────────────────────────────────────────────
-- NETTOYAGE: supprimer les lignes de smoke test
-- Décommenter après vérification manuelle
-- ─────────────────────────────────────────────────────────────────────────────
-- DELETE FROM public.spender_events
--  WHERE idempotency_key = 'tg:1580711786:sync:test';
-- DELETE FROM public.tg_messages
--  WHERE conversation_id = 'c379d68a-b54a-4bbc-baf8-eecb77cb7a23'
--    AND tg_message_id = 999999;
