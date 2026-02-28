-- ═══════════════════════════════════════════════════════════════════════════════
-- BACKFILL V3: Extraire age/job/budget depuis display_name
-- Format: "Name AMOUNT / AGE / JOB" ou "Name AMOUNT / AGE / JOB / TIMEWASTER"
-- Coller dans Supabase SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════════════════════

-- STEP 1: Parse display_name pour TOUS les spenders
CREATE TEMP TABLE _parsed AS
SELECT
  s.id,
  s.handle,
  s.display_name,
  s.name,
  COALESCE(s.display_name, s.name, '') AS raw,

  -- Extraire le vrai prénom (tout avant le premier chiffre ou /)
  NULLIF(TRIM(regexp_replace(
    split_part(COALESCE(s.display_name, s.name, ''), '/', 1),
    E'\\s*\\d+\\s*[eE€]?\\s*$', '', 'i'
  )), '') AS parsed_name,

  -- Extraire l'age: chercher un nombre entre 16-99 après / ou "age"
  (SELECT x[1]::int FROM regexp_match(COALESCE(s.display_name, s.name, ''),
    E'[/\\s]\\s*(\\d{2})\\s*(?:age|ans|/|$)', 'i') AS x
    WHERE x[1]::int BETWEEN 16 AND 99 LIMIT 1
  ) AS parsed_age,

  -- Fallback age: nombre isolé entre 16-99 après un /
  (SELECT x[1]::int FROM regexp_match(COALESCE(s.display_name, s.name, ''),
    E'/\\s*(\\d{2})\\s*/', 'i') AS x
    WHERE x[1]::int BETWEEN 16 AND 99 LIMIT 1
  ) AS parsed_age2,

  -- Extraire le job: texte après le 2ème /
  NULLIF(TRIM(BOTH ' /' FROM (
    CASE
      WHEN COALESCE(s.display_name, s.name, '') ~ E'.+/.+/.+'
      THEN regexp_replace(
        split_part(COALESCE(s.display_name, s.name, ''), '/', 3),
        E'\\s*(TIMEWASTER|\\?)\\s*', '', 'gi'
      )
      ELSE NULL
    END
  )), '') AS parsed_job,

  -- Détecter TIMEWASTER
  CASE WHEN COALESCE(s.display_name, s.name, '') ~* 'TIMEWASTER' THEN true ELSE false END AS is_timewaster,

  -- Extraire le budget depuis display_name: "XXXe" ou "XXX€" ou "XXX.-"
  (SELECT x[1]::int FROM regexp_match(COALESCE(s.display_name, s.name, ''),
    E'(\\d{1,6})\\s*[eE€]|\\b(\\d{1,6})\\.-', 'i') AS x
    WHERE x[1] IS NOT NULL LIMIT 1
  ) AS parsed_budget_amount

FROM spenders s;

-- Voir ce qu'on a extrait
SELECT id, handle, display_name,
  parsed_name, parsed_age, parsed_age2, parsed_job, is_timewaster, parsed_budget_amount
FROM _parsed
WHERE parsed_age IS NOT NULL OR parsed_age2 IS NOT NULL OR (parsed_job IS NOT NULL AND parsed_job <> '')
ORDER BY COALESCE(parsed_age, parsed_age2) NULLS LAST
LIMIT 40;
