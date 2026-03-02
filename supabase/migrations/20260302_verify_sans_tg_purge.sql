-- ═══════════════════════════════════════════════════════════════════════
-- VERIFICATION — Spenders sans TG ID (avant/après purge)
-- Usage: exécuter avant purge, noter les chiffres, re-exécuter après.
-- ═══════════════════════════════════════════════════════════════════════

-- 1. Nombre de spenders SANS TG ID (candidats à la purge)
SELECT
  COUNT(*) AS total_sans_tg,
  COUNT(*) FILTER (
    WHERE id NOT IN (SELECT DISTINCT spender_id FROM transactions WHERE spender_id IS NOT NULL)
  ) AS sans_tg_sans_tx,
  COUNT(*) FILTER (
    WHERE id IN (SELECT DISTINCT spender_id FROM transactions WHERE spender_id IS NOT NULL)
  ) AS sans_tg_avec_tx
FROM public.spenders
WHERE (tg_user_id IS NULL OR tg_user_id = 0)
  AND (telegram_id IS NULL OR telegram_id = 0);

-- 2. Aperçu des fiches sans TG (nom, source, nb tx, ltv)
SELECT
  s.id,
  COALESCE(s.handle, s.name, 'N/A')   AS handle,
  s.source,
  s.created_at::date                   AS cree_le,
  COUNT(t.id)                          AS nb_tx,
  COALESCE(SUM(t.amount) FILTER (WHERE t.status = 'validated'), 0)::numeric(10,2) AS ltv
FROM public.spenders s
LEFT JOIN public.transactions t ON t.spender_id = s.id
WHERE (s.tg_user_id IS NULL OR s.tg_user_id = 0)
  AND (s.telegram_id IS NULL OR s.telegram_id = 0)
GROUP BY s.id, s.handle, s.name, s.source, s.created_at
ORDER BY nb_tx ASC, s.created_at DESC
LIMIT 50;

-- 3. Vérification post-purge : une fiche supprimée ne doit plus apparaître
-- Exemple (remplacer <ID> par l'UUID du spender supprimé) :
-- SELECT id FROM public.spenders WHERE id = '<ID>';
-- → doit retourner 0 lignes

-- 4. Transactions conservées après purge (spender_id = NULL)
SELECT COUNT(*) AS tx_orphelines
FROM public.transactions
WHERE spender_id IS NULL;
