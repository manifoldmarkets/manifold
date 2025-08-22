-- Materialized view for user achievement metrics with ranks and percentiles
-- First-time populate (run separately): REFRESH MATERIALIZED VIEW CONCURRENTLY mv_user_achievement_stats;

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_user_achievement_stats AS
WITH
  -- Prefilter MANA contracts once; reuse everywhere
  mana_contracts AS (
    SELECT
      id,
      creator_id,
      (data->>'totalLiquidity')::numeric AS total_liq
    FROM contracts
    WHERE token = 'MANA'
  ),

  volume AS (
    SELECT
      ucm.user_id,
      SUM(
        COALESCE((ucm.data->>'totalAmountSold')::numeric, 0)
        + COALESCE((ucm.data->>'totalAmountInvested')::numeric, 0)
      ) AS total_volume_mana
    FROM user_contract_metrics ucm
    JOIN mana_contracts mc ON mc.id = ucm.contract_id
    WHERE ucm.answer_id IS NULL
    GROUP BY ucm.user_id
  ),

  trades AS (
    SELECT
      b.user_id,
      COUNT(*) AS total_trades_count
    FROM contract_bets b
    JOIN mana_contracts mc ON mc.id = b.contract_id
    WHERE COALESCE(b.is_redemption, false) = false
      AND COALESCE(b.is_filled, true) = true
      AND COALESCE(b.is_cancelled, false) = false
    GROUP BY b.user_id
  ),

  markets_created AS (
    SELECT
      mc.creator_id AS user_id,
      COUNT(*) AS total_markets_created
    FROM mana_contracts mc
    GROUP BY mc.creator_id
  ),

  comments AS (
    SELECT
      user_id,
      SUM(cnt) AS number_of_comments
    FROM (
      SELECT cc.user_id, COUNT(*) AS cnt
      FROM contract_comments cc
      GROUP BY cc.user_id
      UNION ALL
      SELECT opc.user_id, COUNT(*) AS cnt
      FROM old_post_comments opc
      GROUP BY opc.user_id
    ) s
    GROUP BY user_id
  ),

  -- Pre-aggregate league wins to avoid correlated subqueries
  uli AS (
    SELECT
      user_id,
      COUNT(*) FILTER (WHERE rank = 1) AS seasons_rank1_by_cohort,
      COUNT(*) FILTER (WHERE rank = 1 AND division = 6) AS seasons_rank1_masters
    FROM user_league_info
    GROUP BY user_id
  ),

  leagues_agg AS (
    SELECT
      l.user_id,
      COUNT(*) FILTER (WHERE l.division >= 3) AS seasons_gold_or_higher,
      COUNT(*) FILTER (WHERE l.division >= 4) AS seasons_platinum_or_higher,
      COUNT(*) FILTER (WHERE l.division >= 5) AS seasons_diamond_or_higher,
      COUNT(*) FILTER (WHERE l.division = 6)  AS seasons_masters,
      MAX(l.mana_earned) AS largest_league_season_earnings,
      COALESCE(uli.seasons_rank1_by_cohort, 0)  AS seasons_rank1_by_cohort,
      COALESCE(uli.seasons_rank1_masters, 0)    AS seasons_rank1_masters
    FROM leagues l
    LEFT JOIN uli ON uli.user_id = l.user_id
    GROUP BY l.user_id, uli.seasons_rank1_by_cohort, uli.seasons_rank1_masters
  ),

  liquidity AS (
    SELECT
      mc.creator_id AS user_id,
      COALESCE(SUM(mc.total_liq), 0) AS total_liquidity_created_markets
    FROM mana_contracts mc
    GROUP BY mc.creator_id
  ),

  ucm_pnl AS (
    SELECT
      ucm.user_id,
      COUNT(*) FILTER (WHERE COALESCE(ucm.profit, 0) > 0) AS profitable_markets_count,
      COUNT(*) FILTER (WHERE COALESCE(ucm.profit, 0) < 0) AS unprofitable_markets_count,
      MAX(ucm.profit) AS largest_profitable_trade_value,
      MIN(ucm.profit) AS largest_unprofitable_trade_value
    FROM user_contract_metrics ucm
    JOIN mana_contracts mc ON mc.id = ucm.contract_id
    WHERE ucm.answer_id IS NULL
    GROUP BY ucm.user_id
  ),

  portfolio_maxes AS (
    SELECT
      user_id,
      MAX(balance) AS highest_balance_mana,
      MAX(investment_value) AS highest_invested_mana,
      MAX(balance + investment_value) AS highest_networth_mana,
      MAX(loan_total) AS highest_loan_mana
    FROM user_portfolio_history
    GROUP BY user_id
  ),

  all_users AS (
    SELECT id AS user_id
    FROM users
  )

SELECT
  u.user_id,

  COALESCE(v.total_volume_mana, 0) AS total_volume_mana,
  COALESCE(t.total_trades_count, 0) AS total_trades_count,
  COALESCE(mc.total_markets_created, 0) AS total_markets_created,
  COALESCE(cm.number_of_comments, 0) AS number_of_comments,

  COALESCE(la.seasons_gold_or_higher, 0) AS seasons_gold_or_higher,
  COALESCE(la.seasons_platinum_or_higher, 0) AS seasons_platinum_or_higher,
  COALESCE(la.seasons_diamond_or_higher, 0) AS seasons_diamond_or_higher,
  COALESCE(la.seasons_masters, 0) AS seasons_masters,
  COALESCE(la.seasons_rank1_by_cohort, 0) AS seasons_rank1_by_cohort,
  COALESCE(la.seasons_rank1_masters, 0) AS seasons_rank1_masters,
  COALESCE(la.largest_league_season_earnings, 0) AS largest_league_season_earnings,

  COALESCE(lq.total_liquidity_created_markets, 0) AS total_liquidity_created_markets,

  COALESCE(pnl.profitable_markets_count, 0) AS profitable_markets_count,
  COALESCE(pnl.unprofitable_markets_count, 0) AS unprofitable_markets_count,
  COALESCE(pnl.largest_profitable_trade_value, 0) AS largest_profitable_trade_value,
  COALESCE(pnl.largest_unprofitable_trade_value, 0) AS largest_unprofitable_trade_value,

  COALESCE(pm.highest_balance_mana, 0) AS highest_balance_mana,
  COALESCE(pm.highest_invested_mana, 0) AS highest_invested_mana,
  COALESCE(pm.highest_networth_mana, 0) AS highest_networth_mana,
  COALESCE(pm.highest_loan_mana, 0) AS highest_loan_mana,

  -- Ranks (desc unless noted)
  RANK() OVER (ORDER BY COALESCE(v.total_volume_mana, 0) DESC) AS volume_rank,
  (((COUNT(*) OVER ()) - RANK() OVER (ORDER BY COALESCE(v.total_volume_mana, 0) DESC) + 1)::numeric / (COUNT(*) OVER ())) * 100 AS volume_percentile,

  RANK() OVER (ORDER BY COALESCE(t.total_trades_count, 0) DESC) AS trades_rank,
  (((COUNT(*) OVER ()) - RANK() OVER (ORDER BY COALESCE(t.total_trades_count, 0) DESC) + 1)::numeric / (COUNT(*) OVER ())) * 100 AS trades_percentile,

  RANK() OVER (ORDER BY COALESCE(mc.total_markets_created, 0) DESC) AS markets_created_rank,
  (((COUNT(*) OVER ()) - RANK() OVER (ORDER BY COALESCE(mc.total_markets_created, 0) DESC) + 1)::numeric / (COUNT(*) OVER ())) * 100 AS markets_created_percentile,

  RANK() OVER (ORDER BY COALESCE(cm.number_of_comments, 0) DESC) AS comments_rank,
  (((COUNT(*) OVER ()) - RANK() OVER (ORDER BY COALESCE(cm.number_of_comments, 0) DESC) + 1)::numeric / (COUNT(*) OVER ())) * 100 AS comments_percentile,

  RANK() OVER (ORDER BY COALESCE(la.seasons_masters, 0) DESC) AS seasons_masters_rank,
  (((COUNT(*) OVER ()) - RANK() OVER (ORDER BY COALESCE(la.seasons_masters, 0) DESC) + 1)::numeric / (COUNT(*) OVER ())) * 100 AS seasons_masters_percentile,

  RANK() OVER (ORDER BY COALESCE(la.seasons_rank1_by_cohort, 0) DESC) AS seasons_rank1_by_cohort_rank,
  (((COUNT(*) OVER ()) - RANK() OVER (ORDER BY COALESCE(la.seasons_rank1_by_cohort, 0) DESC) + 1)::numeric / (COUNT(*) OVER ())) * 100 AS seasons_rank1_by_cohort_percentile,

  RANK() OVER (ORDER BY COALESCE(la.seasons_rank1_masters, 0) DESC) AS seasons_rank1_masters_rank,
  (((COUNT(*) OVER ()) - RANK() OVER (ORDER BY COALESCE(la.seasons_rank1_masters, 0) DESC) + 1)::numeric / (COUNT(*) OVER ())) * 100 AS seasons_rank1_masters_percentile,

  RANK() OVER (ORDER BY COALESCE(la.largest_league_season_earnings, 0) DESC) AS largest_league_season_earnings_rank,
  (((COUNT(*) OVER ()) - RANK() OVER (ORDER BY COALESCE(la.largest_league_season_earnings, 0) DESC) + 1)::numeric / (COUNT(*) OVER ())) * 100 AS largest_league_season_earnings_percentile,

  RANK() OVER (ORDER BY COALESCE(lq.total_liquidity_created_markets, 0) DESC) AS liquidity_rank,
  (((COUNT(*) OVER ()) - RANK() OVER (ORDER BY COALESCE(lq.total_liquidity_created_markets, 0) DESC) + 1)::numeric / (COUNT(*) OVER ())) * 100 AS liquidity_percentile,

  RANK() OVER (ORDER BY COALESCE(pnl.profitable_markets_count, 0) DESC) AS profitable_markets_rank,
  (((COUNT(*) OVER ()) - RANK() OVER (ORDER BY COALESCE(pnl.profitable_markets_count, 0) DESC) + 1)::numeric / (COUNT(*) OVER ())) * 100 AS profitable_markets_percentile,

  RANK() OVER (ORDER BY COALESCE(pnl.unprofitable_markets_count, 0) DESC) AS unprofitable_markets_rank,
  (((COUNT(*) OVER ()) - RANK() OVER (ORDER BY COALESCE(pnl.unprofitable_markets_count, 0) DESC) + 1)::numeric / (COUNT(*) OVER ())) * 100 AS unprofitable_markets_percentile,

  RANK() OVER (ORDER BY COALESCE(pnl.largest_profitable_trade_value, 0) DESC) AS largest_profitable_trade_rank,
  (((COUNT(*) OVER ()) - RANK() OVER (ORDER BY COALESCE(pnl.largest_profitable_trade_value, 0) DESC) + 1)::numeric / (COUNT(*) OVER ())) * 100 AS largest_profitable_trade_percentile,

  RANK() OVER (ORDER BY COALESCE(pnl.largest_unprofitable_trade_value, 0) ASC) AS largest_unprofitable_trade_rank,
  (((COUNT(*) OVER ()) - RANK() OVER (ORDER BY COALESCE(pnl.largest_unprofitable_trade_value, 0) ASC) + 1)::numeric / (COUNT(*) OVER ())) * 100 AS largest_unprofitable_trade_percentile,

  RANK() OVER (ORDER BY COALESCE(pm.highest_balance_mana, 0) DESC) AS highest_balance_rank,
  (((COUNT(*) OVER ()) - RANK() OVER (ORDER BY COALESCE(pm.highest_balance_mana, 0) DESC) + 1)::numeric / (COUNT(*) OVER ())) * 100 AS highest_balance_percentile,

  RANK() OVER (ORDER BY COALESCE(pm.highest_invested_mana, 0) DESC) AS highest_invested_rank,
  (((COUNT(*) OVER ()) - RANK() OVER (ORDER BY COALESCE(pm.highest_invested_mana, 0) DESC) + 1)::numeric / (COUNT(*) OVER ())) * 100 AS highest_invested_percentile,

  RANK() OVER (ORDER BY COALESCE(pm.highest_networth_mana, 0) DESC) AS highest_networth_rank,
  (((COUNT(*) OVER ()) - RANK() OVER (ORDER BY COALESCE(pm.highest_networth_mana, 0) DESC) + 1)::numeric / (COUNT(*) OVER ())) * 100 AS highest_networth_percentile,

  RANK() OVER (ORDER BY COALESCE(pm.highest_loan_mana, 0) DESC) AS highest_loan_rank,
  (((COUNT(*) OVER ()) - RANK() OVER (ORDER BY COALESCE(pm.highest_loan_mana, 0) DESC) + 1)::numeric / (COUNT(*) OVER ())) * 100 AS highest_loan_percentile

FROM all_users u
LEFT JOIN volume v      ON v.user_id = u.user_id
LEFT JOIN trades t      ON t.user_id = u.user_id
LEFT JOIN markets_created mc ON mc.user_id = u.user_id
LEFT JOIN comments cm   ON cm.user_id = u.user_id
LEFT JOIN leagues_agg la ON la.user_id = u.user_id
LEFT JOIN liquidity lq  ON lq.user_id = u.user_id
LEFT JOIN ucm_pnl pnl   ON pnl.user_id = u.user_id
LEFT JOIN portfolio_maxes pm ON pm.user_id = u.user_id
WITH NO DATA;

-- Unique index needed for CONCURRENTLY refresh
CREATE UNIQUE INDEX IF NOT EXISTS mv_user_achievement_stats_user_id_idx
  ON public.mv_user_achievement_stats (user_id);