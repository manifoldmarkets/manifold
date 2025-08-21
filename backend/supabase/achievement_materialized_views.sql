-- Materialized view for user achievement metrics with ranks and percentiles
-- Refresh with: REFRESH MATERIALIZED VIEW CONCURRENTLY mv_user_achievement_stats;
create materialized view if not exists
  mv_user_achievement_stats as
with
  volume as (
    select
      ucm.user_id,
      sum(
        coalesce((ucm.data ->> 'totalAmountSold')::numeric, 0) + coalesce((ucm.data ->> 'totalAmountInvested')::numeric, 0)
      ) filter (
        where
          c.token = 'MANA'
      ) as total_volume_mana
    from
      user_contract_metrics ucm
      join contracts c on c.id = ucm.contract_id
    where
      ucm.answer_id is null
    group by
      ucm.user_id
  ),
  trades as (
    select
      b.user_id,
      count(*) filter (
        where
          not coalesce(b.is_redemption, false)
          and coalesce(b.is_filled, true)
          and not coalesce(b.is_cancelled, false)
          and c.token = 'MANA'
      ) as total_trades_count
    from
      contract_bets b
      join contracts c on c.id = b.contract_id
    group by
      b.user_id
  ),
  markets_created as (
    select
      c.creator_id as user_id,
      count(*) filter (
        where
          c.token = 'MANA'
      ) as total_markets_created
    from
      contracts c
    group by
      c.creator_id
  ),
  comments as (
    select
      user_id,
      sum(cnt) as number_of_comments
    from
      (
        select
          cc.user_id,
          count(*) as cnt
        from
          contract_comments cc
        group by
          cc.user_id
        union all
        select
          opc.user_id,
          count(*) as cnt
        from
          old_post_comments opc
        group by
          opc.user_id
      ) s
    group by
      user_id
  ),
  leagues_agg as (
    select
      l.user_id,
      count(*) filter (
        where
          l.division >= 3
      ) as seasons_gold_or_higher,
      count(*) filter (
        where
          l.division >= 4
      ) as seasons_platinum_or_higher,
      count(*) filter (
        where
          l.division >= 5
      ) as seasons_diamond_or_higher,
      count(*) filter (
        where
          l.division = 6
      ) as seasons_masters,
      (
        select
          count(*)
        from
          user_league_info uli
        where
          uli.user_id = l.user_id
          and uli.rank = 1
      ) as seasons_rank1_by_cohort,
      (
        select
          count(*)
        from
          user_league_info uli
        where
          uli.user_id = l.user_id
          and uli.rank = 1
          and uli.division = 6
      ) as seasons_rank1_masters,
      max(l.mana_earned) as largest_league_season_earnings
    from
      leagues l
    group by
      l.user_id
  ),
  liquidity as (
    select
      c.creator_id as user_id,
      coalesce(sum((c.data ->> 'totalLiquidity')::numeric), 0) filter (
        where
          c.token = 'MANA'
      ) as total_liquidity_created_markets
    from
      contracts c
    group by
      c.creator_id
  ),
  ucm_pnl as (
    select
      ucm.user_id,
      count(*) filter (
        where
          coalesce(ucm.profit, 0) > 0
          and c.token = 'MANA'
      ) as profitable_markets_count,
      count(*) filter (
        where
          coalesce(ucm.profit, 0) < 0
          and c.token = 'MANA'
      ) as unprofitable_markets_count,
      max(ucm.profit) filter (
        where
          c.token = 'MANA'
      ) as largest_profitable_trade_value,
      min(ucm.profit) filter (
        where
          c.token = 'MANA'
      ) as largest_unprofitable_trade_value
    from
      user_contract_metrics ucm
      join contracts c on c.id = ucm.contract_id
    where
      ucm.answer_id is null
    group by
      ucm.user_id
  ),
  portfolio_maxes as (
    select
      user_id,
      max(balance) as highest_balance_mana,
      max(investment_value) as highest_invested_mana,
      max(balance + investment_value) as highest_networth_mana,
      max(loan_total) as highest_loan_mana
    from
      user_portfolio_history
    group by
      user_id
  ),
  all_users as (
    select
      id as user_id
    from
      users
  )
select
  u.user_id,
  coalesce(v.total_volume_mana, 0) as total_volume_mana,
  coalesce(t.total_trades_count, 0) as total_trades_count,
  coalesce(mc.total_markets_created, 0) as total_markets_created,
  coalesce(cm.number_of_comments, 0) as number_of_comments,
  coalesce(la.seasons_gold_or_higher, 0) as seasons_gold_or_higher,
  coalesce(la.seasons_platinum_or_higher, 0) as seasons_platinum_or_higher,
  coalesce(la.seasons_diamond_or_higher, 0) as seasons_diamond_or_higher,
  coalesce(la.seasons_masters, 0) as seasons_masters,
  coalesce(la.seasons_rank1_by_cohort, 0) as seasons_rank1_by_cohort,
  coalesce(la.seasons_rank1_masters, 0) as seasons_rank1_masters,
  coalesce(la.largest_league_season_earnings, 0) as largest_league_season_earnings,
  coalesce(lq.total_liquidity_created_markets, 0) as total_liquidity_created_markets,
  coalesce(pnl.profitable_markets_count, 0) as profitable_markets_count,
  coalesce(pnl.unprofitable_markets_count, 0) as unprofitable_markets_count,
  coalesce(pnl.largest_profitable_trade_value, 0) as largest_profitable_trade_value,
  coalesce(pnl.largest_unprofitable_trade_value, 0) as largest_unprofitable_trade_value,
  coalesce(pm.highest_balance_mana, 0) as highest_balance_mana,
  coalesce(pm.highest_invested_mana, 0) as highest_invested_mana,
  coalesce(pm.highest_networth_mana, 0) as highest_networth_mana,
  coalesce(pm.highest_loan_mana, 0) as highest_loan_mana,
  -- Ranks (desc unless noted)
  rank() over (
    order by
      coalesce(v.total_volume_mana, 0) desc
  ) as volume_rank,
  (
    (
      count(*) over () - rank() over (
        order by
          coalesce(v.total_volume_mana, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as volume_percentile,
  rank() over (
    order by
      coalesce(t.total_trades_count, 0) desc
  ) as trades_rank,
  (
    (
      count(*) over () - rank() over (
        order by
          coalesce(t.total_trades_count, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as trades_percentile,
  rank() over (
    order by
      coalesce(mc.total_markets_created, 0) desc
  ) as markets_created_rank,
  (
    (
      count(*) over () - rank() over (
        order by
          coalesce(mc.total_markets_created, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as markets_created_percentile,
  rank() over (
    order by
      coalesce(cm.number_of_comments, 0) desc
  ) as comments_rank,
  (
    (
      count(*) over () - rank() over (
        order by
          coalesce(cm.number_of_comments, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as comments_percentile,
  rank() over (
    order by
      coalesce(la.seasons_masters, 0) desc
  ) as seasons_masters_rank,
  (
    (
      count(*) over () - rank() over (
        order by
          coalesce(la.seasons_masters, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as seasons_masters_percentile,
  rank() over (
    order by
      coalesce(la.seasons_rank1_by_cohort, 0) desc
  ) as seasons_rank1_by_cohort_rank,
  (
    (
      count(*) over () - rank() over (
        order by
          coalesce(la.seasons_rank1_by_cohort, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as seasons_rank1_by_cohort_percentile,
  rank() over (
    order by
      coalesce(la.seasons_rank1_masters, 0) desc
  ) as seasons_rank1_masters_rank,
  (
    (
      count(*) over () - rank() over (
        order by
          coalesce(la.seasons_rank1_masters, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as seasons_rank1_masters_percentile,
  rank() over (
    order by
      coalesce(la.largest_league_season_earnings, 0) desc
  ) as largest_league_season_earnings_rank,
  (
    (
      count(*) over () - rank() over (
        order by
          coalesce(la.largest_league_season_earnings, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as largest_league_season_earnings_percentile,
  rank() over (
    order by
      coalesce(lq.total_liquidity_created_markets, 0) desc
  ) as liquidity_rank,
  (
    (
      count(*) over () - rank() over (
        order by
          coalesce(lq.total_liquidity_created_markets, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as liquidity_percentile,
  rank() over (
    order by
      coalesce(pnl.profitable_markets_count, 0) desc
  ) as profitable_markets_rank,
  (
    (
      count(*) over () - rank() over (
        order by
          coalesce(pnl.profitable_markets_count, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as profitable_markets_percentile,
  rank() over (
    order by
      coalesce(pnl.unprofitable_markets_count, 0) desc
  ) as unprofitable_markets_rank,
  (
    (
      count(*) over () - rank() over (
        order by
          coalesce(pnl.unprofitable_markets_count, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as unprofitable_markets_percentile,
  rank() over (
    order by
      coalesce(pnl.largest_profitable_trade_value, 0) desc
  ) as largest_profitable_trade_rank,
  (
    (
      count(*) over () - rank() over (
        order by
          coalesce(pnl.largest_profitable_trade_value, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as largest_profitable_trade_percentile,
  rank() over (
    order by
      coalesce(pnl.largest_unprofitable_trade_value, 0) asc
  ) as largest_unprofitable_trade_rank,
  (
    (
      count(*) over () - rank() over (
        order by
          coalesce(pnl.largest_unprofitable_trade_value, 0) asc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as largest_unprofitable_trade_percentile,
  rank() over (
    order by
      coalesce(pm.highest_balance_mana, 0) desc
  ) as highest_balance_rank,
  (
    (
      count(*) over () - rank() over (
        order by
          coalesce(pm.highest_balance_mana, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as highest_balance_percentile,
  rank() over (
    order by
      coalesce(pm.highest_invested_mana, 0) desc
  ) as highest_invested_rank,
  (
    (
      count(*) over () - rank() over (
        order by
          coalesce(pm.highest_invested_mana, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as highest_invested_percentile,
  rank() over (
    order by
      coalesce(pm.highest_networth_mana, 0) desc
  ) as highest_networth_rank,
  (
    (
      count(*) over () - rank() over (
        order by
          coalesce(pm.highest_networth_mana, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as highest_networth_percentile,
  rank() over (
    order by
      coalesce(pm.highest_loan_mana, 0) desc
  ) as highest_loan_rank,
  (
    (
      count(*) over () - rank() over (
        order by
          coalesce(pm.highest_loan_mana, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as highest_loan_percentile
from
  all_users u
  left join volume v on v.user_id = u.user_id
  left join trades t on t.user_id = u.user_id
  left join markets_created mc on mc.user_id = u.user_id
  left join comments cm on cm.user_id = u.user_id
  left join leagues_agg la on la.user_id = u.user_id
  left join liquidity lq on lq.user_id = u.user_id
  left join ucm_pnl pnl on pnl.user_id = u.user_id
  left join portfolio_maxes pm on pm.user_id = u.user_id;

-- Index needed for CONCURRENTLY refresh
create unique index if not exists mv_user_achievement_stats_user_id_idx on public.mv_user_achievement_stats (user_id);
