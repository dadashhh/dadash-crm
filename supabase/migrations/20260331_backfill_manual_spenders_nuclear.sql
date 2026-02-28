-- ═══════════════════════════════════════════════════════════════════════════════
-- NUCLEAR BACKFILL: Remplir TOUTES les fiches spender manuelles
-- 
-- À coller dans Supabase SQL Editor → Run
-- 
-- Étapes:
--   1) Backfill tg_conversations.username depuis tg_messages.meta
--   2) Lier les spenders manuels à leurs conversations
--   3) Extraire les données profil depuis les messages (regex SQL)
--   4) Mettre à jour les colonnes top-level des spenders
--   5) Re-enqueue pour enrichissement futur par le worker
--
-- SAFE: utilise COALESCE partout, ne supprime rien, n'écrase pas les valeurs existantes
-- Date: 2026-03-31
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Backfill tg_conversations.username + tg_user_id depuis tg_messages.meta
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE tg_conversations c SET
  username = sub.username,
  tg_user_id = CASE
    WHEN sub.tg_user_id ~ '^\d+$' AND c.tg_user_id IS NULL
    THEN sub.tg_user_id::bigint
    ELSE c.tg_user_id
  END,
  display_name = COALESCE(c.display_name, sub.display_name)
FROM (
  SELECT DISTINCT ON (m.conversation_id)
    m.conversation_id,
    NULLIF(TRIM(BOTH '@' FROM COALESCE(m.meta->>'username', '')), '') AS username,
    NULLIF(TRIM(COALESCE(m.meta->>'tg_user_id', '')), '') AS tg_user_id,
    NULLIF(TRIM(COALESCE(m.meta->>'display_name', '')), '') AS display_name
  FROM tg_messages m
  WHERE m.direction = 'in'
    AND m.meta IS NOT NULL
    AND COALESCE(m.meta->>'username', '') <> ''
  ORDER BY m.conversation_id, m.created_at ASC
) sub
WHERE c.id = sub.conversation_id
  AND (c.username IS NULL OR TRIM(c.username) = '');

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Lier les spenders manuels (tg_user_id NULL) aux conversations
-- Match par telegram_username OU handle
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE spenders s SET
  tg_user_id = conv.tg_user_id::text,
  updated_at = now()
FROM (
  SELECT DISTINCT ON (s2.id)
    s2.id AS spender_id,
    c.tg_user_id,
    c.id AS conv_id
  FROM spenders s2
  JOIN tg_conversations c ON (
    LOWER(TRIM(BOTH '@' FROM COALESCE(c.username, ''))) = LOWER(TRIM(BOTH '@' FROM COALESCE(s2.telegram_username, '')))
    OR LOWER(TRIM(BOTH '@' FROM COALESCE(c.username, ''))) = LOWER(TRIM(BOTH '@' FROM COALESCE(s2.handle, '')))
    OR LOWER(COALESCE(c.username, '')) = LOWER(COALESCE(s2.handle, ''))
  )
  WHERE (s2.tg_user_id IS NULL OR s2.tg_user_id::text = '' OR s2.tg_user_id::text = '0')
    AND c.tg_user_id IS NOT NULL
    AND c.username IS NOT NULL
    AND TRIM(c.username) <> ''
  ORDER BY s2.id, c.last_message_at DESC NULLS LAST
) conv
WHERE s.id = conv.spender_id;

-- Also link spender_id on conversations
UPDATE tg_conversations c SET
  spender_id = s.id
FROM spenders s
WHERE c.spender_id IS NULL
  AND s.tg_user_id IS NOT NULL
  AND c.tg_user_id IS NOT NULL
  AND s.tg_user_id::text = c.tg_user_id::text;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: Extract profile data from messages using SQL regex
-- Builds a temp table with extracted fields per spender
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE _extracted_profiles AS
WITH msg_corpus AS (
  SELECT
    c.spender_id,
    s.tg_user_id,
    string_agg(m.text, E'\n' ORDER BY m.created_at ASC) AS corpus
  FROM tg_messages m
  JOIN tg_conversations c ON c.id = m.conversation_id
  JOIN spenders s ON s.id = c.spender_id
  WHERE m.direction = 'in'
    AND m.text IS NOT NULL
    AND m.text <> ''
  GROUP BY c.spender_id, s.tg_user_id
)
SELECT
  mc.spender_id,
  mc.tg_user_id,

  -- Age extraction
  (regexp_match(mc.corpus, '(?:j[''']?ai|i[''']?m|i am)\s+(\d{2})\s*(?:ans|yo|y\.o|years?\s*old)', 'i'))[1]::int AS age_extracted,
  CASE WHEN (regexp_match(mc.corpus, '(\d{2})\s*ans', 'i'))[1] IS NOT NULL
    THEN (regexp_match(mc.corpus, '(\d{2})\s*ans', 'i'))[1]::int
    ELSE NULL
  END AS age_fallback,

  -- City extraction
  COALESCE(
    (regexp_match(mc.corpus, '(?:je\s+(?:suis|vis|habite)\s+(?:à|a|de|en))\s+([A-ZÀ-Ü][a-zà-ü]{2,}(?:\s+[A-ZÀ-Ü][a-zà-ü]{2,})?)', 'i'))[1],
    (regexp_match(mc.corpus, '(?:i\s+(?:live|am)\s+(?:in|from|at))\s+([A-Za-z]{3,}(?:\s+[A-Za-z]{3,})?)', 'i'))[1],
    (regexp_match(mc.corpus, '(?:basé|based)\s+(?:à|a|in)\s+([A-ZÀ-Ü][a-zà-ü]{2,})', 'i'))[1],
    CASE
      WHEN mc.corpus ~* '\mparis\M' THEN 'Paris'
      WHEN mc.corpus ~* '\mlyon\M' THEN 'Lyon'
      WHEN mc.corpus ~* '\mmarseille\M' THEN 'Marseille'
      WHEN mc.corpus ~* '\mtoulouse\M' THEN 'Toulouse'
      WHEN mc.corpus ~* '\mnice\M' THEN 'Nice'
      WHEN mc.corpus ~* '\mbordeaux\M' THEN 'Bordeaux'
      WHEN mc.corpus ~* '\mlille\M' THEN 'Lille'
      WHEN mc.corpus ~* '\mzurich\M' OR mc.corpus ~* '\mzürich\M' THEN 'Zurich'
      WHEN mc.corpus ~* '\mgen[eè]ve\M' THEN 'Genève'
      WHEN mc.corpus ~* '\mberne\M' THEN 'Berne'
      WHEN mc.corpus ~* '\mlausanne\M' THEN 'Lausanne'
      WHEN mc.corpus ~* '\mb[aâ]le\M' OR mc.corpus ~* '\mbasel\M' THEN 'Bâle'
      WHEN mc.corpus ~* '\mlondon\M' THEN 'London'
      WHEN mc.corpus ~* '\mberlin\M' THEN 'Berlin'
      WHEN mc.corpus ~* '\mmunich\M' OR mc.corpus ~* '\mmünchen\M' THEN 'Munich'
      WHEN mc.corpus ~* '\mdubai\M' OR mc.corpus ~* '\mdubaï\M' THEN 'Dubai'
      WHEN mc.corpus ~* '\mmonaco\M' THEN 'Monaco'
      WHEN mc.corpus ~* '\mbruxelles\M' OR mc.corpus ~* '\mbrussels\M' THEN 'Bruxelles'
      ELSE NULL
    END
  ) AS city_extracted,

  -- Country extraction
  COALESCE(
    (regexp_match(mc.corpus, '(?:je\s+(?:suis|vis|habite)\s+(?:en|au|aux))\s+([A-ZÀ-Ü][a-zà-ü]{3,})', 'i'))[1],
    (regexp_match(mc.corpus, '(?:i[''']?m?\s+from)\s+([A-Za-z]{3,})', 'i'))[1],
    CASE
      WHEN mc.corpus ~* '\mfrance\M' THEN 'France'
      WHEN mc.corpus ~* '\msuisse\M' OR mc.corpus ~* '\mswitzerland\M' THEN 'Suisse'
      WHEN mc.corpus ~* '\mbelgique\M' OR mc.corpus ~* '\mbelgium\M' THEN 'Belgique'
      WHEN mc.corpus ~* '\mallemagne\M' OR mc.corpus ~* '\mgermany\M' THEN 'Allemagne'
      WHEN mc.corpus ~* '\mitalie\M' OR mc.corpus ~* '\mitaly\M' THEN 'Italie'
      WHEN mc.corpus ~* '\mespagne\M' OR mc.corpus ~* '\mspain\M' THEN 'Espagne'
      WHEN mc.corpus ~* '\mangleterre\M' OR mc.corpus ~* '\mengland\M' OR mc.corpus ~* '\muk\M' THEN 'Angleterre'
      ELSE NULL
    END
  ) AS country_extracted,

  -- Job extraction
  COALESCE(
    (regexp_match(mc.corpus, '(?:je\s+(?:suis|travaille\s+comme|bosse\s+comme))\s+([a-zà-ü\s]{3,30})', 'i'))[1],
    (regexp_match(mc.corpus, '(?:i(?:[''']m|\s+am)\s+(?:a|an)\s+)([a-z\s]{3,30})', 'i'))[1],
    (regexp_match(mc.corpus, '(?:métier|job|travail|profession)\s*[:=]?\s*([a-zà-ü\s]{3,30})', 'i'))[1]
  ) AS job_extracted,

  -- Language detection
  CASE
    WHEN mc.corpus ~* '(?:français|french|je\s+parle\s+fran)' THEN 'FR'
    WHEN mc.corpus ~* '(?:anglais|english|i\s+speak\s+eng)' THEN 'EN'
    WHEN mc.corpus ~* '(?:allemand|german|deutsch)' THEN 'DE'
    WHEN mc.corpus ~* '(?:italien|italian|italiano)' THEN 'IT'
    WHEN mc.corpus ~* '(?:espagnol|spanish|español)' THEN 'ES'
    WHEN mc.corpus ~* '(?:arabe|arabic)' THEN 'AR'
    ELSE NULL
  END AS langue_extracted,

  -- Relationship status
  CASE
    WHEN mc.corpus ~* '(?:célibataire|single)' THEN 'single'
    WHEN mc.corpus ~* '(?:marié|married|mariée)' THEN 'married'
    WHEN mc.corpus ~* '(?:divorcé|divorced|divorcée)' THEN 'divorced'
    WHEN mc.corpus ~* '(?:en\s+couple|in\s+a?\s*relationship)' THEN 'in_relationship'
    ELSE NULL
  END AS relationship_extracted,

  -- Budget
  CASE
    WHEN (regexp_match(mc.corpus, '(\d{2,6})\s*(?:€|eur|chf|usd|\$)', 'i'))[1] IS NOT NULL THEN
      CASE
        WHEN (regexp_match(mc.corpus, '(\d{2,6})\s*(?:€|eur|chf|usd|\$)', 'i'))[1]::int < 100 THEN 'low'
        WHEN (regexp_match(mc.corpus, '(\d{2,6})\s*(?:€|eur|chf|usd|\$)', 'i'))[1]::int < 500 THEN 'medium'
        WHEN (regexp_match(mc.corpus, '(\d{2,6})\s*(?:€|eur|chf|usd|\$)', 'i'))[1]::int < 2000 THEN 'high'
        ELSE 'whale'
      END
    ELSE NULL
  END AS budget_extracted

FROM msg_corpus mc;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: Update spenders top-level columns (COALESCE = never overwrite existing)
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE spenders s SET
  age = COALESCE(s.age, ep.age_extracted, ep.age_fallback),
  city = COALESCE(s.city, ep.city_extracted),
  country = COALESCE(s.country, ep.country_extracted),
  job = COALESCE(NULLIF(TRIM(s.job), ''), NULLIF(TRIM(ep.job_extracted), '')),
  langue = COALESCE(NULLIF(TRIM(s.langue), ''), ep.langue_extracted),
  relationship_status = COALESCE(NULLIF(TRIM(s.relationship_status), ''), ep.relationship_extracted),
  budget_range = COALESCE(NULLIF(TRIM(s.budget_range), ''), ep.budget_extracted),
  meta = COALESCE(s.meta, '{}'::jsonb) || jsonb_build_object(
    'profile', COALESCE(s.meta->'profile', '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'identity', COALESCE(s.meta->'profile'->'identity', '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
        'age', COALESCE(ep.age_extracted, ep.age_fallback)
      )),
      'location', COALESCE(s.meta->'profile'->'location', '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
        'city', ep.city_extracted,
        'country', ep.country_extracted
      )),
      'job', ep.job_extracted,
      'language', ep.langue_extracted,
      'relationship_status', ep.relationship_extracted,
      'budget_range', ep.budget_extracted
    )),
    'last_enrich', now()::text,
    'last_enrich_source', 'sql_backfill'
  ),
  updated_at = now()
FROM _extracted_profiles ep
WHERE s.id = ep.spender_id
  AND (
    (s.age IS NULL AND (ep.age_extracted IS NOT NULL OR ep.age_fallback IS NOT NULL))
    OR (s.city IS NULL AND ep.city_extracted IS NOT NULL)
    OR (s.country IS NULL AND ep.country_extracted IS NOT NULL)
    OR ((s.job IS NULL OR TRIM(s.job) = '') AND ep.job_extracted IS NOT NULL AND TRIM(ep.job_extracted) <> '')
    OR ((s.langue IS NULL OR TRIM(s.langue) = '') AND ep.langue_extracted IS NOT NULL)
    OR ((s.relationship_status IS NULL OR TRIM(s.relationship_status) = '') AND ep.relationship_extracted IS NOT NULL)
    OR ((s.budget_range IS NULL OR TRIM(s.budget_range) = '') AND ep.budget_extracted IS NOT NULL)
  );

-- Log what was updated
DO $$
DECLARE
  v_count INT;
BEGIN
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RAISE NOTICE 'BACKFILL: Updated % spenders with extracted profile data', v_count;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5: Insert events for audit trail
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO spender_events (tg_user_id, spender_id, event_type, idempotency_key, data)
SELECT
  COALESCE(ep.tg_user_id::text, '0'),
  ep.spender_id,
  'profile_updated',
  'sql_backfill:' || ep.spender_id::text || ':' || extract(epoch from now())::bigint,
  jsonb_build_object(
    'summary', 'SQL backfill: ' || array_to_string(ARRAY[
      CASE WHEN ep.age_extracted IS NOT NULL OR ep.age_fallback IS NOT NULL THEN 'age' END,
      CASE WHEN ep.city_extracted IS NOT NULL THEN 'city' END,
      CASE WHEN ep.country_extracted IS NOT NULL THEN 'country' END,
      CASE WHEN ep.job_extracted IS NOT NULL THEN 'job' END,
      CASE WHEN ep.langue_extracted IS NOT NULL THEN 'langue' END,
      CASE WHEN ep.relationship_extracted IS NOT NULL THEN 'relationship' END,
      CASE WHEN ep.budget_extracted IS NOT NULL THEN 'budget' END
    ], ', '),
    'source', 'sql_backfill'
  )
FROM _extracted_profiles ep
WHERE ep.age_extracted IS NOT NULL
   OR ep.age_fallback IS NOT NULL
   OR ep.city_extracted IS NOT NULL
   OR ep.country_extracted IS NOT NULL
   OR ep.job_extracted IS NOT NULL
   OR ep.langue_extracted IS NOT NULL
   OR ep.relationship_extracted IS NOT NULL
   OR ep.budget_extracted IS NOT NULL
ON CONFLICT (event_type, tg_user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 6: Re-enqueue ALL conversations for future enrichment by the worker
-- (when the bot redeploys, the worker will process these and apply deeper extraction)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO spender_enrich_queue (conversation_id, tg_user_id, status)
SELECT c.id, c.tg_user_id, 'queued'
FROM tg_conversations c
WHERE c.spender_id IS NOT NULL
  AND c.tg_user_id IS NOT NULL
ON CONFLICT (conversation_id) DO UPDATE SET
  status = 'queued',
  attempts = 0,
  error = NULL,
  updated_at = now();

-- Cleanup
DROP TABLE IF EXISTS _extracted_profiles;

-- ─────────────────────────────────────────────────────────────────────────────
-- DIAGNOSTIC: Show results
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_total INT;
  v_with_age INT;
  v_with_city INT;
  v_with_job INT;
  v_linked INT;
  v_queued INT;
BEGIN
  SELECT COUNT(*) INTO v_total FROM spenders WHERE status = 'active' OR is_active = true;
  SELECT COUNT(*) INTO v_with_age FROM spenders WHERE age IS NOT NULL AND (status = 'active' OR is_active = true);
  SELECT COUNT(*) INTO v_with_city FROM spenders WHERE city IS NOT NULL AND TRIM(city) <> '' AND (status = 'active' OR is_active = true);
  SELECT COUNT(*) INTO v_with_job FROM spenders WHERE job IS NOT NULL AND TRIM(job) <> '' AND (status = 'active' OR is_active = true);
  SELECT COUNT(*) INTO v_linked FROM spenders WHERE tg_user_id IS NOT NULL AND (status = 'active' OR is_active = true);
  SELECT COUNT(*) INTO v_queued FROM spender_enrich_queue WHERE status = 'queued';

  RAISE NOTICE '═══════════════════════════════════════════';
  RAISE NOTICE 'BACKFILL RESULTS:';
  RAISE NOTICE '  Total spenders actifs: %', v_total;
  RAISE NOTICE '  Avec tg_user_id lié:   %', v_linked;
  RAISE NOTICE '  Avec age:              %', v_with_age;
  RAISE NOTICE '  Avec city:             %', v_with_city;
  RAISE NOTICE '  Avec job:              %', v_with_job;
  RAISE NOTICE '  En queue enrichment:   %', v_queued;
  RAISE NOTICE '═══════════════════════════════════════════';
END $$;

COMMIT;
