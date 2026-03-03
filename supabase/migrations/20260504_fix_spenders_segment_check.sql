-- ═══════════════════════════════════════════════════════════════════════════════
-- MIGRATION: Fix spenders_segment_check constraint
-- Problem: UI dropdown sent 'orang-outan' (hyphen) but constraint only accepts
--          'orang_outan' (underscore). Also covers capitalized/legacy variants.
-- Date: 2026-05-04
-- Safe to re-run: idempotent (DROP IF EXISTS + NOT VALID)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Ensure segment column exists ──
ALTER TABLE public.spenders ADD COLUMN IF NOT EXISTS segment TEXT;

-- ── 2. Backfill: normalize all known variants → canonical lowercase underscore ──
UPDATE public.spenders SET segment = 'orang_outan' WHERE segment IN ('orang-outan','Orang-Outan','Orang_Outan','orang-Outan','ORANG_OUTAN','ORANG-OUTAN');
UPDATE public.spenders SET segment = 'gorille'     WHERE segment IN ('Gorille','GORILLE');
UPDATE public.spenders SET segment = 'ouistiti'    WHERE segment IN ('Ouistiti','OUISTITI');
UPDATE public.spenders SET segment = 'timewaster'  WHERE segment IN ('Timewaster','TIMEWASTER','time-waster','time_waster');
UPDATE public.spenders SET segment = 'poussin'     WHERE segment IN ('Poussin','POUSSIN');
UPDATE public.spenders SET segment = 'whale'       WHERE segment IN ('Whale','WHALE');
UPDATE public.spenders SET segment = 'shark'       WHERE segment IN ('Shark','SHARK');
UPDATE public.spenders SET segment = 'vip'         WHERE segment IN ('VIP','Vip');
UPDATE public.spenders SET segment = 'bronze'      WHERE segment IN ('Bronze','BRONZE');
UPDATE public.spenders SET segment = 'argent'      WHERE segment IN ('Argent','ARGENT');
UPDATE public.spenders SET segment = 'gold'        WHERE segment IN ('Gold','GOLD');
UPDATE public.spenders SET segment = 'diamond'     WHERE segment IN ('Diamond','DIAMOND');

-- ── 3. Nullify any remaining values outside the valid set ──
--    (prevents constraint violation on rows that have truly unknown values)
UPDATE public.spenders
SET segment = NULL
WHERE segment IS NOT NULL
  AND segment NOT IN (
    'timewaster','poussin','ouistiti','orang_outan','gorille','whale','shark',
    'bronze','argent','gold','diamond','vip'
  );

-- ── 4. Drop old constraint (regardless of its current definition) ──
ALTER TABLE public.spenders DROP CONSTRAINT IF EXISTS spenders_segment_check;

-- ── 5. Recreate constraint with the full canonical set + NULL allowed ──
--    NOT VALID: skips re-scanning historical rows (already cleaned above).
--    VALIDATE CONSTRAINT can be run separately in a maintenance window if needed.
ALTER TABLE public.spenders
  ADD CONSTRAINT spenders_segment_check
  CHECK (
    segment IS NULL
    OR segment IN (
      'timewaster','poussin','ouistiti','orang_outan','gorille','whale','shark',
      'bronze','argent','gold','diamond','vip'
    )
  ) NOT VALID;

-- ── Verification queries (run manually to confirm) ──
-- SELECT conname, pg_get_constraintdef(c.oid)
-- FROM pg_constraint c
-- JOIN pg_class t ON t.oid = c.conrelid
-- JOIN pg_namespace n ON n.oid = t.relnamespace
-- WHERE n.nspname = 'public' AND t.relname = 'spenders' AND c.conname = 'spenders_segment_check';
--
-- SELECT segment, count(*) FROM public.spenders GROUP BY 1 ORDER BY 2 DESC;
--
-- UPDATE public.spenders SET segment = 'timewaster' WHERE id = (SELECT id FROM public.spenders LIMIT 1);
-- UPDATE public.spenders SET segment = NULL          WHERE id = (SELECT id FROM public.spenders LIMIT 1);
-- UPDATE public.spenders SET segment = 'invalid'     WHERE id = (SELECT id FROM public.spenders LIMIT 1); -- should error
