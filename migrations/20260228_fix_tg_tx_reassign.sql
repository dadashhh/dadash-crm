-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION: Réassignation TX avec spender_handle de type "tg_XXXXXXX"
-- vers la bonne fiche spender via tg_user_id
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Réassigner les TX dont le spender_handle ressemble à "tg_XXXXXXX"
--    vers le spender qui a tg_user_id = XXXXXXX
UPDATE public.transactions t
SET
  spender_id = s.id,
  spender_handle = COALESCE(NULLIF(TRIM(s.handle), ''), s.name, t.spender_handle)
FROM public.spenders s
WHERE
  t.spender_handle ~ '^tg_[0-9]+$'
  AND s.tg_user_id::text = REGEXP_REPLACE(t.spender_handle, '^tg_', '')
  AND (t.spender_id IS NULL OR t.spender_id <> s.id);

-- 2. Réassigner les TX dont le spender_handle ressemble à "@tg_XXXXXXX"
UPDATE public.transactions t
SET
  spender_id = s.id,
  spender_handle = COALESCE(NULLIF(TRIM(s.handle), ''), s.name, t.spender_handle)
FROM public.spenders s
WHERE
  t.spender_handle ~ '^@tg_[0-9]+$'
  AND s.tg_user_id::text = REGEXP_REPLACE(t.spender_handle, '^@tg_', '')
  AND (t.spender_id IS NULL OR t.spender_id <> s.id);

-- 3. Réassigner les TX dont le spender_id est null mais dont le spender_handle
--    correspond exactement au handle d'un spender existant
UPDATE public.transactions t
SET spender_id = s.id
FROM public.spenders s
WHERE
  t.spender_id IS NULL
  AND (
    LOWER(TRIM(BOTH '@' FROM t.spender_handle)) = LOWER(TRIM(BOTH '@' FROM COALESCE(s.handle, '')))
    OR LOWER(TRIM(BOTH '@' FROM t.spender_handle)) = LOWER(TRIM(BOTH '@' FROM COALESCE(s.name, '')))
  )
  AND t.spender_handle IS NOT NULL
  AND t.spender_handle <> ''
  AND t.spender_handle <> 'unknown';

-- 4. Rapport : TX encore orphelines après réassignation
SELECT
  COUNT(*) AS tx_still_orphan,
  COUNT(DISTINCT spender_handle) AS distinct_handles
FROM public.transactions
WHERE spender_id IS NULL
  AND spender_handle IS NOT NULL
  AND spender_handle <> ''
  AND spender_handle <> 'unknown';
