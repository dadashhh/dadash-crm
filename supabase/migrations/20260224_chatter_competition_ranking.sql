-- ═══════════════════════════════════════════════════════════════════════════════
-- feat/espace-chatter — RPC classement compétition chatter
-- Retourne le ranking anonymisé pour les chatters (Chatter 1, Chatter 2...)
-- Le user connecté voit son vrai nom, les autres sont anonymisés
-- Date: 2026-02-24
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- USAGE: SELECT * FROM get_chatter_competition_ranking('2026-02-01'::timestamptz, now());
-- Appelé par ChatterCompetitionTab quand user.role === 'chatter'
--
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_chatter_competition_ranking(
  p_period_start timestamptz,
  p_period_end timestamptz
)
RETURNS TABLE (
  chatter_id uuid,
  display_name text,
  rank_pos int,
  score bigint,
  ca numeric,
  nb_tx bigint,
  active_spenders bigint,
  total_spenders bigint,
  conv_rate numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid := auth.uid();
  v_row_num int := 0;
BEGIN
  RETURN QUERY
  WITH chatters AS (
    SELECT p.id, p.name, p.assigned_models
    FROM profiles p
    WHERE p.role = 'chatter'
      AND (p.assigned_models IS NULL OR jsonb_array_length(COALESCE(p.assigned_models, '[]'::jsonb)) > 0)
  ),
  period_txs AS (
    SELECT t.id AS tx_id, t.model_id, t.chatter_id, t.amount, t.currency, t.date, t.status, t.spender_handle
    FROM transactions t
    WHERE t.date >= p_period_start AND t.date < p_period_end
  ),
  chatter_stats AS (
    SELECT
      c.id AS ch_id,
      c.name AS ch_name,
      COUNT(DISTINCT pt.tx_id) FILTER (WHERE pt.status IN ('validated', 'confirmee')) AS nb_valid,
      COALESCE(SUM(pt.amount) FILTER (WHERE pt.status IN ('validated', 'confirmee') AND (pt.currency IS NULL OR pt.currency = 'EUR')), 0) AS ca_eur,
      COALESCE(SUM(pt.amount * 0.95) FILTER (WHERE pt.status IN ('validated', 'confirmee') AND pt.currency = 'USD'), 0) AS ca_usd,
      COALESCE(SUM(pt.amount * 1.05) FILTER (WHERE pt.status IN ('validated', 'confirmee') AND pt.currency = 'CHF'), 0) AS ca_chf,
      COALESCE(SUM(pt.amount * 1.18) FILTER (WHERE pt.status IN ('validated', 'confirmee') AND pt.currency = 'GBP'), 0) AS ca_gbp,
      COUNT(DISTINCT pt.spender_handle) FILTER (WHERE pt.date >= (p_period_end - interval '30 days')) AS active_sp,
      COUNT(DISTINCT pt.spender_handle) AS total_sp
    FROM chatters c
    LEFT JOIN period_txs pt ON (
      pt.model_id IN (SELECT (elem)::uuid FROM jsonb_array_elements_text(COALESCE(c.assigned_models, '[]'::jsonb)) AS elem)
      OR pt.chatter_id = c.id
    )
    GROUP BY c.id, c.name
  ),
  ranked AS (
    SELECT
      cs.ch_id,
      cs.ch_name,
      ROW_NUMBER() OVER (ORDER BY
        (cs.ca_eur + cs.ca_usd + cs.ca_chf + cs.ca_gbp) / 10
        + cs.nb_valid * 5
        + cs.active_sp * 10
        + CASE WHEN cs.total_sp > 0 THEN (cs.active_sp::numeric / cs.total_sp * 100 * 3) ELSE 0 END
      DESC) AS rn,
      GREATEST(0, ROUND(
        (cs.ca_eur + cs.ca_usd + cs.ca_chf + cs.ca_gbp) / 10
        + cs.nb_valid * 5
        + cs.active_sp * 10
        + CASE WHEN cs.total_sp > 0 THEN (cs.active_sp::numeric / cs.total_sp * 100 * 3) ELSE 0 END
      )::bigint) AS sc,
      (cs.ca_eur + cs.ca_usd + cs.ca_chf + cs.ca_gbp) AS revenue,
      cs.nb_valid AS tx_count,
      cs.active_sp AS act_sp,
      cs.total_sp AS tot_sp,
      CASE WHEN cs.total_sp > 0 THEN ROUND((cs.active_sp::numeric / cs.total_sp) * 100, 0) ELSE 0 END AS conv
    FROM chatter_stats cs
  )
  SELECT
    r.ch_id,
    CASE WHEN r.ch_id = v_caller_id THEN COALESCE(r.ch_name, '?') ELSE 'Chatter ' || r.rn::text END,
    r.rn::int,
    r.sc,
    r.revenue,
    r.tx_count,
    r.act_sp,
    r.tot_sp,
    r.conv
  FROM ranked r
  ORDER BY r.rn;
END;
$$;

COMMENT ON FUNCTION get_chatter_competition_ranking(timestamptz, timestamptz) IS
  'Classement compétition chatter: anonymise les autres (Chatter 1, 2...), le user connecté voit son nom';

-- Grant execute to authenticated users (chatter role)
GRANT EXECUTE ON FUNCTION get_chatter_competition_ranking(timestamptz, timestamptz) TO authenticated;
