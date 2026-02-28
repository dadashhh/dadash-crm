-- ═══════════════════════════════════════════════════════════════════
-- Migration : Recalcul des badges spenders selon les nouvelles tranches
-- 5 badges : TIMEWASTER (manuel) / LEAD / OUISTITI / ORANG_OUTAN / GORILLE
-- Tranches : LEAD 0-49 | OUISTITI 50-199 | ORANG_OUTAN 200-599 | GORILLE 600+
-- TIMEWASTER = badge manuel uniquement, jamais écrasé
-- ═══════════════════════════════════════════════════════════════════

-- 1. Calcul du total dépensé par spender (TX validées uniquement)
WITH spent AS (
  SELECT
    spender_id,
    COALESCE(SUM(amount), 0) AS total_spent
  FROM transactions
  WHERE status = 'validated'
    AND spender_id IS NOT NULL
  GROUP BY spender_id
),
-- 2. Calcul du nouveau badge selon les tranches
new_badges AS (
  SELECT
    s.id,
    s.classification AS current_classification,
    COALESCE(sp.total_spent, 0) AS total_spent,
    CASE
      WHEN COALESCE(sp.total_spent, 0) >= 600 THEN 'gorille'
      WHEN COALESCE(sp.total_spent, 0) >= 200 THEN 'orang_outan'
      WHEN COALESCE(sp.total_spent, 0) >= 50  THEN 'ouistiti'
      ELSE 'lead'
    END AS computed_badge
  FROM spenders s
  LEFT JOIN spent sp ON sp.spender_id = s.id
  -- Exclure les TIMEWASTER (badge manuel, jamais écrasé)
  WHERE LOWER(COALESCE(s.classification, '')) != 'timewaster'
)
-- 3. Mise à jour
UPDATE spenders
SET
  classification = nb.computed_badge,
  updated_at = NOW()
FROM new_badges nb
WHERE spenders.id = nb.id
  AND spenders.classification IS DISTINCT FROM nb.computed_badge;

-- 4. Rapport
SELECT
  classification,
  COUNT(*) AS nb_spenders
FROM spenders
GROUP BY classification
ORDER BY nb_spenders DESC;
