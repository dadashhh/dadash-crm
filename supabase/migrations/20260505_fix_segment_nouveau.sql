-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Comprehensive segment constraint fix — includes 'nouveau' + 'regular'
-- Problem:
--   1. DB contains segment='nouveau' (massively) which violates the old constraint.
--   2. Any UPDATE on a row with an invalid segment fails — even changing first_name only.
--   3. Previous migration (20260504) didn't include 'nouveau'/'regular' in valid set.
-- Solution:
--   A. lower(trim(segment)) normalization for ALL rows
--   B. Map all known aliases to their canonical value
--   C. Drop old constraint (whatever its current definition)
--   D. Nullify any truly unknown values
--   E. Recreate constraint with FULL canonical set (including 'nouveau' and 'regular')
--   F. VALIDATE CONSTRAINT — so the check is enforced and future bad inserts fail fast
-- Date: 2026-05-05
-- Safe to re-run: idempotent (IF NOT EXISTS / DROP IF EXISTS / lower(trim) is no-op if clean)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Ensure column exists ──
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS segment TEXT;

-- ── 2. lower(trim) normalization — one pass for all non-null values ──
UPDATE public.spenders
SET segment = lower(trim(segment))
WHERE segment IS NOT NULL
  AND segment IS DISTINCT FROM lower(trim(segment));

-- ── 3. Alias normalization (after lower(trim) so comparisons are clean) ──
UPDATE public.spenders SET segment = 'orang_outan' WHERE segment IN ('orang-outan','orang ouran','orang_ouran');
UPDATE public.spenders SET segment = 'timewaster'  WHERE segment IN ('time-waster','time_waster','timewasters');
UPDATE public.spenders SET segment = 'vip'         WHERE segment = 'vips';
UPDATE public.spenders SET segment = 'nouveau'     WHERE segment IN ('new','nouveaux','nouveau spender');
UPDATE public.spenders SET segment = 'regular'     WHERE segment IN ('regulier','régulier','regularr');

-- ── 4. Drop old constraint (any definition) ──
ALTER TABLE public.spenders DROP CONSTRAINT IF EXISTS spenders_segment_check;

-- ── 5. Nullify truly unknown values (not in any valid set) ──
--    'nouveau' and 'regular' are explicitly KEPT — they are real data.
UPDATE public.spenders
SET segment = NULL
WHERE segment IS NOT NULL
  AND segment NOT IN (
    'timewaster','poussin','ouistiti','orang_outan','gorille','whale','shark',
    'bronze','argent','gold','diamond','vip',
    'nouveau','regular'
  );

-- ── 6. Recreate constraint with full canonical set + NULL allowed ──
ALTER TABLE public.spenders
  ADD CONSTRAINT spenders_segment_check
  CHECK (
    segment IS NULL
    OR segment IN (
      'timewaster','poussin','ouistiti','orang_outan','gorille','whale','shark',
      'bronze','argent','gold','diamond','vip',
      'nouveau','regular'
    )
  );

-- ── 7. Validate — confirm existing data satisfies the constraint ──
--    This will error if step 5 missed any bad value (acts as a smoke test).
ALTER TABLE public.spenders VALIDATE CONSTRAINT spenders_segment_check;

-- ── Post-check queries (run manually after applying) ──
-- SELECT segment, count(*) FROM public.spenders GROUP BY 1 ORDER BY 2 DESC;
-- SELECT conname, pg_get_constraintdef(c.oid)
--   FROM pg_constraint c
--   JOIN pg_class t ON t.oid = c.conrelid
--   JOIN pg_namespace n ON n.oid = t.relnamespace
--   WHERE n.nspname='public' AND t.relname='spenders' AND c.conname='spenders_segment_check';
-- UPDATE public.spenders SET segment='timewaster' WHERE id=(SELECT id FROM public.spenders LIMIT 1);
-- UPDATE public.spenders SET segment=NULL         WHERE id=(SELECT id FROM public.spenders LIMIT 1);
-- UPDATE public.spenders SET segment='invalid'    WHERE id=(SELECT id FROM public.spenders LIMIT 1); -- must fail
