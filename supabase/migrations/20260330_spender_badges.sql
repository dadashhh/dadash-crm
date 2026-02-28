-- ============================================================
-- spender_badges — persistent badge storage for spenders
-- Replaces in-memory computeSpenderBadges for DB-backed metrics
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.spender_badges (
  spender_id UUID NOT NULL REFERENCES public.spenders(id) ON DELETE CASCADE,
  badge      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (spender_id, badge)
);

CREATE INDEX IF NOT EXISTS idx_spender_badges_badge ON public.spender_badges(badge);
CREATE INDEX IF NOT EXISTS idx_spender_badges_spender ON public.spender_badges(spender_id);

ALTER TABLE public.spender_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read badges"
  ON public.spender_badges FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can insert badges"
  ON public.spender_badges FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated can delete badges"
  ON public.spender_badges FOR DELETE
  USING (auth.role() = 'authenticated');

-- ============================================================
-- BACKFILL: compute badges from existing transaction data
-- Logic mirrors computeSpenderBadges / computeSpenderTier in JS:
--   GORILLE     = validated tx count > 0 AND total_spent >= 250
--   ORANG-OUTAN = validated tx count > 0 AND total_spent >= 100 AND < 250
--   OUISTITI    = validated tx count > 0 AND total_spent < 100
--   TIMEWASTER  = validated tx count = 0
--   ACTIF       = last tx within 7 days AND has txs
--   INACTIF     = last tx > 30 days ago AND has txs
--   NOUVEAU     = tx count <= 1 AND first tx within 7 days
--   RÉGULIER    = 3+ txs in last 30 days
-- ============================================================

-- Tier badges (GORILLE, ORANG-OUTAN, OUISTITI, TIMEWASTER)
INSERT INTO public.spender_badges (spender_id, badge)
SELECT s.id,
  CASE
    WHEN COALESCE(agg.valid_count, 0) = 0 THEN 'TIMEWASTER'
    WHEN COALESCE(agg.total_spent, 0) >= 250 THEN 'GORILLE'
    WHEN COALESCE(agg.total_spent, 0) >= 100 THEN 'ORANG-OUTAN'
    ELSE 'OUISTITI'
  END
FROM public.spenders s
LEFT JOIN (
  SELECT spender_id,
    SUM(CASE WHEN status = 'validated' THEN amount ELSE 0 END) AS total_spent,
    COUNT(*) FILTER (WHERE status = 'validated') AS valid_count
  FROM public.transactions
  WHERE spender_id IS NOT NULL
  GROUP BY spender_id
) agg ON agg.spender_id = s.id
ON CONFLICT (spender_id, badge) DO NOTHING;

-- ACTIF badge (last tx within 7 days)
INSERT INTO public.spender_badges (spender_id, badge)
SELECT DISTINCT t.spender_id, 'ACTIF'
FROM public.transactions t
WHERE t.spender_id IS NOT NULL
  AND t.date >= now() - interval '7 days'
ON CONFLICT (spender_id, badge) DO NOTHING;

-- INACTIF badge (has txs but none in 30 days)
INSERT INTO public.spender_badges (spender_id, badge)
SELECT s.id, 'INACTIF'
FROM public.spenders s
WHERE EXISTS (SELECT 1 FROM public.transactions t WHERE t.spender_id = s.id)
  AND NOT EXISTS (SELECT 1 FROM public.transactions t WHERE t.spender_id = s.id AND t.date >= now() - interval '30 days')
ON CONFLICT (spender_id, badge) DO NOTHING;

-- NOUVEAU badge (1 or fewer txs, first tx within 7 days)
INSERT INTO public.spender_badges (spender_id, badge)
SELECT t.spender_id, 'NOUVEAU'
FROM public.transactions t
WHERE t.spender_id IS NOT NULL
GROUP BY t.spender_id
HAVING COUNT(*) <= 1 AND MIN(t.date) >= now() - interval '7 days'
ON CONFLICT (spender_id, badge) DO NOTHING;

-- RÉGULIER badge (3+ txs in last 30 days)
INSERT INTO public.spender_badges (spender_id, badge)
SELECT t.spender_id, 'RÉGULIER'
FROM public.transactions t
WHERE t.spender_id IS NOT NULL AND t.date >= now() - interval '30 days'
GROUP BY t.spender_id
HAVING COUNT(*) >= 3
ON CONFLICT (spender_id, badge) DO NOTHING;

COMMIT;
