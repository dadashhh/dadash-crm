-- ═══════════════════════════════════════════════════════════════════════════════
-- BACKFILL V2: Part directement des MESSAGES (6074 msgs, 284 convs, 320 spenders)
-- Coller dans Supabase SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1: Trouver le tg_user_id et username de chaque conversation
--         depuis les messages eux-mêmes (meta.tg_user_id, meta.username)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE _conv_identity AS
SELECT DISTINCT ON (m.conversation_id)
  m.conversation_id,
  NULLIF(TRIM(COALESCE(m.meta->>'tg_user_id', '')), '') AS tg_user_id,
  NULLIF(TRIM(BOTH '@' FROM COALESCE(m.meta->>'username', '')), '') AS username,
  NULLIF(TRIM(COALESCE(m.meta->>'display_name', '')), '') AS display_name
FROM tg_messages m
WHERE m.direction = 'in'
  AND m.meta IS NOT NULL
ORDER BY m.conversation_id, m.created_at ASC;

-- Patch: mettre à jour tg_conversations avec ces infos
UPDATE tg_conversations c SET
  username = COALESCE(ci.username, c.username),
  tg_user_id = COALESCE(ci.tg_user_id, c.tg_user_id::text),
  display_name = COALESCE(ci.display_name, c.display_name)
FROM _conv_identity ci
WHERE c.id = ci.conversation_id;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2: Lier conversations → spenders par tg_user_id
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE tg_conversations c SET
  spender_id = s.id
FROM _conv_identity ci
JOIN spenders s ON s.tg_user_id::text = ci.tg_user_id
WHERE c.id = ci.conversation_id
  AND ci.tg_user_id IS NOT NULL
  AND (c.spender_id IS NULL OR c.spender_id <> s.id);

-- Lier aussi par username/handle
UPDATE tg_conversations c SET
  spender_id = s.id
FROM _conv_identity ci
JOIN spenders s ON (
  LOWER(TRIM(BOTH '@' FROM COALESCE(s.telegram_username, ''))) = LOWER(ci.username)
  OR LOWER(TRIM(BOTH '@' FROM COALESCE(s.handle, ''))) = LOWER(ci.username)
)
WHERE c.id = ci.conversation_id
  AND c.spender_id IS NULL
  AND ci.username IS NOT NULL
  AND ci.username <> '';

-- Lier spenders manuels (sans tg_user_id) → mettre le tg_user_id
UPDATE spenders s SET
  tg_user_id = ci.tg_user_id,
  updated_at = now()
FROM tg_conversations c
JOIN _conv_identity ci ON ci.conversation_id = c.id
WHERE c.spender_id = s.id
  AND ci.tg_user_id IS NOT NULL
  AND (s.tg_user_id IS NULL OR s.tg_user_id::text = '' OR s.tg_user_id::text = '0');

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 3: Extraire les profils depuis les messages (texte brut)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TEMP TABLE _msg_profiles AS
WITH msg_corpus AS (
  SELECT
    c.spender_id,
    s.tg_user_id::text AS tg_user_id,
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

  (SELECT x[1]::int FROM regexp_match(mc.corpus, E'(\\d{2})\\s*ans', 'i') AS x WHERE x[1]::int BETWEEN 16 AND 99 LIMIT 1) AS age_v1,
  (SELECT x[1]::int FROM regexp_match(mc.corpus, E'j.?ai\\s+(\\d{2})', 'i') AS x WHERE x[1]::int BETWEEN 16 AND 99 LIMIT 1) AS age_v2,
  (SELECT x[1]::int FROM regexp_match(mc.corpus, E'i.?m\\s+(\\d{2})', 'i') AS x WHERE x[1]::int BETWEEN 16 AND 99 LIMIT 1) AS age_v3,

  COALESCE(
    (SELECT x[1] FROM regexp_match(mc.corpus, E'(?:je\\s+(?:suis|vis|habite)\\s+(?:à|a|de|en))\\s+([A-ZÀ-Ü][a-zà-ü]{2,})', 'i') AS x),
    (SELECT x[1] FROM regexp_match(mc.corpus, E'(?:i\\s+(?:live|am)\\s+(?:in|from|at))\\s+([A-Za-z]{3,})', 'i') AS x),
    CASE
      WHEN mc.corpus ~* E'\\mparis\\M' THEN 'Paris'
      WHEN mc.corpus ~* E'\\mlyon\\M' THEN 'Lyon'
      WHEN mc.corpus ~* E'\\mmarseille\\M' THEN 'Marseille'
      WHEN mc.corpus ~* E'\\mzurich\\M' THEN 'Zurich'
      WHEN mc.corpus ~* E'\\mgen[eè]ve\\M' THEN 'Genève'
      WHEN mc.corpus ~* E'\\mlausanne\\M' THEN 'Lausanne'
      WHEN mc.corpus ~* E'\\mlondon\\M' THEN 'London'
      WHEN mc.corpus ~* E'\\mberlin\\M' THEN 'Berlin'
      WHEN mc.corpus ~* E'\\mdubai\\M' THEN 'Dubai'
      WHEN mc.corpus ~* E'\\mmonaco\\M' THEN 'Monaco'
      WHEN mc.corpus ~* E'\\mnice\\M' THEN 'Nice'
      WHEN mc.corpus ~* E'\\mbordeaux\\M' THEN 'Bordeaux'
      WHEN mc.corpus ~* E'\\mlille\\M' THEN 'Lille'
      WHEN mc.corpus ~* E'\\mbruxelles\\M' THEN 'Bruxelles'
      WHEN mc.corpus ~* E'\\mb[aâ]le\\M' THEN 'Bâle'
      WHEN mc.corpus ~* E'\\mberne\\M' THEN 'Berne'
      WHEN mc.corpus ~* E'\\mmunich\\M' THEN 'Munich'
      WHEN mc.corpus ~* E'\\mtoulouse\\M' THEN 'Toulouse'
      ELSE NULL
    END
  ) AS city_extracted,

  COALESCE(
    (SELECT x[1] FROM regexp_match(mc.corpus, E'(?:je\\s+(?:suis|vis)\\s+(?:en|au|aux))\\s+([A-ZÀ-Ü][a-zà-ü]{3,})', 'i') AS x),
    CASE
      WHEN mc.corpus ~* E'\\mfrance\\M' THEN 'France'
      WHEN mc.corpus ~* E'\\msuisse\\M' OR mc.corpus ~* E'\\mswitzerland\\M' THEN 'Suisse'
      WHEN mc.corpus ~* E'\\mbelgique\\M' THEN 'Belgique'
      WHEN mc.corpus ~* E'\\mallemagne\\M' OR mc.corpus ~* E'\\mgermany\\M' THEN 'Allemagne'
      WHEN mc.corpus ~* E'\\mitalie\\M' OR mc.corpus ~* E'\\mitaly\\M' THEN 'Italie'
      WHEN mc.corpus ~* E'\\mespagne\\M' THEN 'Espagne'
      WHEN mc.corpus ~* E'\\mangleterre\\M' OR mc.corpus ~* E'\\mengland\\M' THEN 'Angleterre'
      ELSE NULL
    END
  ) AS country_extracted,

  COALESCE(
    (SELECT x[1] FROM regexp_match(mc.corpus, E'(?:je\\s+(?:suis|travaille comme|bosse comme))\\s+([a-zà-ü\\s]{3,30})', 'i') AS x),
    (SELECT x[1] FROM regexp_match(mc.corpus, E'(?:i.m\\s+(?:a|an)\\s+)([a-z\\s]{3,30})', 'i') AS x),
    (SELECT x[1] FROM regexp_match(mc.corpus, E'(?:métier|job|travail|profession)\\s*[:=]?\\s*([a-zà-ü\\s]{3,30})', 'i') AS x)
  ) AS job_extracted,

  CASE
    WHEN mc.corpus ~* 'fran[cç]ais|french' THEN 'FR'
    WHEN mc.corpus ~* 'anglais|english' THEN 'EN'
    WHEN mc.corpus ~* 'allemand|german|deutsch' THEN 'DE'
    WHEN mc.corpus ~* 'italien|italian' THEN 'IT'
    WHEN mc.corpus ~* 'espagnol|spanish' THEN 'ES'
    WHEN mc.corpus ~* 'arabe|arabic' THEN 'AR'
    ELSE NULL
  END AS langue_extracted,

  CASE
    WHEN mc.corpus ~* E'c[ée]libataire|\\msingle\\M' THEN 'single'
    WHEN mc.corpus ~* E'mari[ée]|\\mmarried\\M' THEN 'married'
    WHEN mc.corpus ~* E'divorc[ée]|\\mdivorced\\M' THEN 'divorced'
    WHEN mc.corpus ~* 'en couple|in.?a?.?relationship' THEN 'in_relationship'
    ELSE NULL
  END AS relationship_extracted,

  (SELECT
    CASE
      WHEN x[1]::int < 100 THEN 'low'
      WHEN x[1]::int < 500 THEN 'medium'
      WHEN x[1]::int < 2000 THEN 'high'
      ELSE 'whale'
    END
   FROM regexp_match(mc.corpus, E'(\\d{2,6})\\s*(?:€|eur|chf|usd|\\$)', 'i') AS x
   WHERE x[1] IS NOT NULL LIMIT 1
  ) AS budget_extracted

FROM msg_corpus mc;

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 4: Update les spenders
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE spenders s SET
  age = COALESCE(s.age, ep.age_v1, ep.age_v2, ep.age_v3),
  city = COALESCE(NULLIF(TRIM(s.city), ''), ep.city_extracted),
  country = COALESCE(NULLIF(TRIM(s.country), ''), ep.country_extracted),
  job = COALESCE(NULLIF(TRIM(s.job), ''), NULLIF(TRIM(ep.job_extracted), '')),
  langue = COALESCE(NULLIF(TRIM(s.langue), ''), ep.langue_extracted),
  relationship_status = COALESCE(NULLIF(TRIM(s.relationship_status), ''), ep.relationship_extracted),
  budget_range = COALESCE(NULLIF(TRIM(s.budget_range), ''), ep.budget_extracted),
  meta = COALESCE(s.meta, '{}'::jsonb) || jsonb_build_object(
    'profile', COALESCE(s.meta->'profile', '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
      'identity', COALESCE(s.meta->'profile'->'identity', '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
        'age', COALESCE(ep.age_v1, ep.age_v2, ep.age_v3)
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
    'last_enrich_source', 'sql_backfill_v2'
  ),
  updated_at = now()
FROM _msg_profiles ep
WHERE s.id = ep.spender_id
  AND (
    (s.age IS NULL AND COALESCE(ep.age_v1, ep.age_v2, ep.age_v3) IS NOT NULL)
    OR ((s.city IS NULL OR TRIM(s.city) = '') AND ep.city_extracted IS NOT NULL)
    OR ((s.country IS NULL OR TRIM(s.country) = '') AND ep.country_extracted IS NOT NULL)
    OR ((s.job IS NULL OR TRIM(s.job) = '') AND ep.job_extracted IS NOT NULL AND TRIM(ep.job_extracted) <> '')
    OR ((s.langue IS NULL OR TRIM(s.langue) = '') AND ep.langue_extracted IS NOT NULL)
    OR ((s.relationship_status IS NULL OR TRIM(s.relationship_status) = '') AND ep.relationship_extracted IS NOT NULL)
    OR ((s.budget_range IS NULL OR TRIM(s.budget_range) = '') AND ep.budget_extracted IS NOT NULL)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 5: Mettre le display_name des messages sur le spender.first_name
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE spenders s SET
  first_name = COALESCE(s.first_name, ci.display_name),
  display_name = COALESCE(NULLIF(TRIM(s.display_name), ''), ci.display_name),
  telegram_username = COALESCE(NULLIF(TRIM(s.telegram_username), ''), ci.username)
FROM tg_conversations c
JOIN _conv_identity ci ON ci.conversation_id = c.id
WHERE c.spender_id = s.id
  AND ci.display_name IS NOT NULL
  AND (s.first_name IS NULL OR TRIM(s.first_name) = '');

-- Cleanup
DROP TABLE IF EXISTS _conv_identity;
DROP TABLE IF EXISTS _msg_profiles;

-- ─────────────────────────────────────────────────────────────────────────────
-- RÉSULTAT: Combien de spenders ont été enrichis ?
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  COUNT(*) AS total_spenders,
  COUNT(*) FILTER (WHERE age IS NOT NULL) AS with_age,
  COUNT(*) FILTER (WHERE city IS NOT NULL AND city <> '') AS with_city,
  COUNT(*) FILTER (WHERE country IS NOT NULL AND country <> '') AS with_country,
  COUNT(*) FILTER (WHERE job IS NOT NULL AND job <> '') AS with_job,
  COUNT(*) FILTER (WHERE langue IS NOT NULL AND langue <> '') AS with_langue,
  COUNT(*) FILTER (WHERE relationship_status IS NOT NULL AND relationship_status <> '') AS with_relation,
  COUNT(*) FILTER (WHERE first_name IS NOT NULL AND first_name <> '') AS with_first_name,
  COUNT(*) FILTER (WHERE tg_user_id IS NOT NULL AND tg_user_id::text <> '' AND tg_user_id::text <> '0') AS with_tg_linked
FROM spenders;
