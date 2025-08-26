-- Materialized view for user achievement metrics with ranks and percentiles
-- First-time populate (run separately): REFRESH MATERIALIZED VIEW CONCURRENTLY mv_user_achievement_stats;
create materialized view if not exists
  mv_user_achievement_stats as
with
  -- Prefilter MANA contracts once; reuse everywhere
  mana_contracts as (
    select
      id,
      creator_id,
      (data ->> 'totalLiquidity')::numeric as total_liq
    from
      contracts
    where
      token = 'MANA'
  ),
  volume as (
    select
      ucm.user_id,
      sum(
        coalesce((ucm.data ->> 'totalAmountSold')::numeric, 0) + coalesce((ucm.data ->> 'totalAmountInvested')::numeric, 0)
      ) as total_volume_mana
    from
      user_contract_metrics ucm
      join mana_contracts mc on mc.id = ucm.contract_id
    where
      ucm.answer_id is null
    group by
      ucm.user_id
  ),
  trades as (
    select
      b.user_id,
      count(*) as total_trades_count
    from
      contract_bets b
      join mana_contracts mc on mc.id = b.contract_id
    where
      coalesce(b.is_redemption, false) = false
      and coalesce(b.is_filled, true) = true
      and coalesce(b.is_cancelled, false) = false
      and (
        b.is_api is null
        or b.is_api = false
      )
    group by
      b.user_id
  ),
  markets_created as (
    select
      mc.creator_id as user_id,
      count(*) filter (
        where
          (mc.data ->> 'uniqueBettorCount')::int >= 2
      ) as total_markets_created
    from
      contracts mc
    where
      mc.token = 'MANA'
    group by
      mc.creator_id
  ),
  comments as (
    select
      r.content_owner_id as user_id,
      count(distinct r.content_id) as number_of_comments
    from
      user_reactions r
    where
      r.content_type = 'comment'
      and r.reaction_type = 'like'
    group by
      r.content_owner_id
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
      max(l.mana_earned) as largest_league_season_earnings
    from
      leagues l
    group by
      l.user_id
  ),
  liquidity as (
    select
      mc.creator_id as user_id,
      coalesce(sum(mc.total_liq), 0) as total_liquidity_created_markets
    from
      mana_contracts mc
    group by
      mc.creator_id
  ),
  ucm_pnl as (
    select
      ucm.user_id,
      count(*) filter (
        where
          coalesce(ucm.profit, 0) > 0
      ) as profitable_markets_count,
      count(*) filter (
        where
          coalesce(ucm.profit, 0) < 0
      ) as unprofitable_markets_count,
      max(ucm.profit) as largest_profitable_trade_value,
      min(ucm.profit) as largest_unprofitable_trade_value
    from
      user_contract_metrics ucm
      join mana_contracts mc on mc.id = ucm.contract_id
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
  mod_tickets as (
    select
      to_id as user_id,
      count(*) as mod_tickets_resolved
    from
      txns
    where
      category = 'ADMIN_REWARD'
    group by
      to_id
  ),
  charity as (
    select
      from_id as user_id,
      (
        coalesce(
          sum(
            case
              when token = 'M$' then amount / 100.0
              else 0
            end
          ),
          0
        ) + coalesce(
          sum(
            case
              when token = 'CASH' then amount
              else 0
            end
          ),
          0
        ) + coalesce(
          sum(
            case
              when token = 'SPICE' then amount / 1000.0
              else 0
            end
          ),
          0
        )
      ) as charity_donated_mana
    from
      txns
    where
      category = 'CHARITY'
    group by
      from_id
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
  coalesce(mt.mod_tickets_resolved, 0) as mod_tickets_resolved,
  coalesce(ch.charity_donated_mana, 0) as charity_donated_mana,
  -- Ranks (desc unless noted)
  rank() over (
    order by
      coalesce(v.total_volume_mana, 0) desc
  ) as volume_rank,
  (
    (
      (count(*) over ()) - rank() over (
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
      (count(*) over ()) - rank() over (
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
      (count(*) over ()) - rank() over (
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
      (count(*) over ()) - rank() over (
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
      (count(*) over ()) - rank() over (
        order by
          coalesce(la.seasons_masters, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as seasons_masters_percentile,
  rank() over (
    order by
      coalesce(la.largest_league_season_earnings, 0) desc
  ) as largest_league_season_earnings_rank,
  (
    (
      (count(*) over ()) - rank() over (
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
      (count(*) over ()) - rank() over (
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
      (count(*) over ()) - rank() over (
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
      (count(*) over ()) - rank() over (
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
      (count(*) over ()) - rank() over (
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
      (count(*) over ()) - rank() over (
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
      (count(*) over ()) - rank() over (
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
      (count(*) over ()) - rank() over (
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
      (count(*) over ()) - rank() over (
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
      (count(*) over ()) - rank() over (
        order by
          coalesce(pm.highest_loan_mana, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as highest_loan_percentile,
  rank() over (
    order by
      coalesce(mt.mod_tickets_resolved, 0) desc
  ) as mod_tickets_rank,
  (
    (
      (count(*) over ()) - rank() over (
        order by
          coalesce(mt.mod_tickets_resolved, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as mod_tickets_percentile,
  rank() over (
    order by
      coalesce(ch.charity_donated_mana, 0) desc
  ) as charity_donated_rank,
  (
    (
      (count(*) over ()) - rank() over (
        order by
          coalesce(ch.charity_donated_mana, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as charity_donated_percentile
from
  all_users u
  left join volume v on v.user_id = u.user_id
  left join trades t on t.user_id = u.user_id
  left join markets_created mc on mc.user_id = u.user_id
  left join comments cm on cm.user_id = u.user_id
  left join leagues_agg la on la.user_id = u.user_id
  left join liquidity lq on lq.user_id = u.user_id
  left join ucm_pnl pnl on pnl.user_id = u.user_id
  left join portfolio_maxes pm on pm.user_id = u.user_id
  left join mod_tickets mt on mt.user_id = u.user_id
  left join charity ch on ch.user_id = u.user_id
with
  no data;

-- Unique index needed for CONCURRENTLY refresh
create unique index if not exists mv_user_achievement_stats_user_id_idx on public.mv_user_achievement_stats (user_id);

-- ---------------------------------------------------------------------------
-- New per-achievement materialized views (grouped where appropriate)
-- First-time populate (run separately), e.g.:
--   REFRESH MATERIALIZED VIEW CONCURRENTLY mv_ach_volume;
-- ---------------------------------------------------------------------------
-- Volume
create materialized view if not exists
  mv_ach_volume as
with
  mana_contracts as (
    select
      id
    from
      contracts
    where
      token = 'MANA'
  ),
  volume as (
    select
      ucm.user_id,
      sum(
        coalesce((ucm.data ->> 'totalAmountSold')::numeric, 0) + coalesce((ucm.data ->> 'totalAmountInvested')::numeric, 0)
      ) as total_volume_mana
    from
      user_contract_metrics ucm
      join mana_contracts mc on mc.id = ucm.contract_id
    where
      ucm.answer_id is null
    group by
      ucm.user_id
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
  rank() over (
    order by
      coalesce(v.total_volume_mana, 0) desc
  ) as volume_rank,
  (
    (
      (count(*) over ()) - rank() over (
        order by
          coalesce(v.total_volume_mana, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as volume_percentile
from
  all_users u
  left join volume v on v.user_id = u.user_id
with
  no data;

create unique index if not exists mv_ach_volume_user_id_idx on public.mv_ach_volume (user_id);

-- Trades
create materialized view if not exists
  mv_ach_trades as
with
  mana_contracts as (
    select
      id
    from
      contracts
    where
      token = 'MANA'
  ),
  trades as (
    select
      b.user_id,
      count(*) as total_trades_count
    from
      contract_bets b
      join mana_contracts mc on mc.id = b.contract_id
    where
      coalesce(b.is_redemption, false) = false
      and coalesce(b.is_filled, true) = true
      and coalesce(b.is_cancelled, false) = false
      and (
        b.is_api is null
        or b.is_api = false
      )
    group by
      b.user_id
  ),
  all_users as (
    select
      id as user_id
    from
      users
  )
select
  u.user_id,
  coalesce(t.total_trades_count, 0) as total_trades_count,
  rank() over (
    order by
      coalesce(t.total_trades_count, 0) desc
  ) as trades_rank,
  (
    (
      (count(*) over ()) - rank() over (
        order by
          coalesce(t.total_trades_count, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as trades_percentile
from
  all_users u
  left join trades t on t.user_id = u.user_id
with
  no data;

create unique index if not exists mv_ach_trades_user_id_idx on public.mv_ach_trades (user_id);

-- Comments (liked-only)
create materialized view if not exists
  mv_ach_comments as
with
  liked_comments as (
    select
      content_owner_id as user_id,
      count(distinct content_id) as liked_comments
    from
      user_reactions
    where
      content_type = 'comment'
      and reaction_type = 'like'
    group by
      content_owner_id
  ),
  all_users as (
    select
      id as user_id
    from
      users
  )
select
  u.user_id,
  coalesce(lc.liked_comments, 0) as number_of_comments,
  rank() over (
    order by
      coalesce(lc.liked_comments, 0) desc
  ) as comments_rank,
  (
    (
      (count(*) over ()) - rank() over (
        order by
          coalesce(lc.liked_comments, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as comments_percentile
from
  all_users u
  left join liked_comments lc on lc.user_id = u.user_id
with
  no data;

create unique index if not exists mv_ach_comments_user_id_idx on public.mv_ach_comments (user_id);

-- Leagues (grouped)
create materialized view if not exists
  mv_ach_leagues as
with
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
      max(l.mana_earned) as largest_league_season_earnings
    from
      leagues l
    group by
      l.user_id
  ),
  all_users as (
    select
      id as user_id
    from
      users
  )
select
  u.user_id,
  coalesce(la.seasons_gold_or_higher, 0) as seasons_gold_or_higher,
  coalesce(la.seasons_platinum_or_higher, 0) as seasons_platinum_or_higher,
  coalesce(la.seasons_diamond_or_higher, 0) as seasons_diamond_or_higher,
  coalesce(la.seasons_masters, 0) as seasons_masters,
  coalesce(la.largest_league_season_earnings, 0) as largest_league_season_earnings,
  rank() over (
    order by
      coalesce(la.seasons_masters, 0) desc
  ) as seasons_masters_rank,
  (
    (
      (count(*) over ()) - rank() over (
        order by
          coalesce(la.seasons_masters, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as seasons_masters_percentile,
  rank() over (
    order by
      coalesce(la.largest_league_season_earnings, 0) desc
  ) as largest_league_season_earnings_rank,
  (
    (
      (count(*) over ()) - rank() over (
        order by
          coalesce(la.largest_league_season_earnings, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as largest_league_season_earnings_percentile
from
  all_users u
  left join leagues_agg la on la.user_id = u.user_id
with
  no data;

create unique index if not exists mv_ach_leagues_user_id_idx on public.mv_ach_leagues (user_id);

-- PnL-like (profitable/unprofitable counts and largest trades)
create materialized view if not exists
  mv_ach_pnl as
with
  mana_contracts as (
    select
      id
    from
      contracts
    where
      token = 'MANA'
  ),
  ucm_pnl as (
    select
      ucm.user_id,
      count(*) filter (
        where
          coalesce(ucm.profit, 0) > 0
      ) as profitable_markets_count,
      count(*) filter (
        where
          coalesce(ucm.profit, 0) < 0
      ) as unprofitable_markets_count,
      max(ucm.profit) as largest_profitable_trade_value,
      min(ucm.profit) as largest_unprofitable_trade_value
    from
      user_contract_metrics ucm
      join mana_contracts mc on mc.id = ucm.contract_id
    where
      ucm.answer_id is null
    group by
      ucm.user_id
  ),
  all_users as (
    select
      id as user_id
    from
      users
  )
select
  u.user_id,
  coalesce(pnl.profitable_markets_count, 0) as profitable_markets_count,
  coalesce(pnl.unprofitable_markets_count, 0) as unprofitable_markets_count,
  coalesce(pnl.largest_profitable_trade_value, 0) as largest_profitable_trade_value,
  coalesce(pnl.largest_unprofitable_trade_value, 0) as largest_unprofitable_trade_value,
  rank() over (
    order by
      coalesce(pnl.profitable_markets_count, 0) desc
  ) as profitable_markets_rank,
  (
    (
      (count(*) over ()) - rank() over (
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
      (count(*) over ()) - rank() over (
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
      (count(*) over ()) - rank() over (
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
      (count(*) over ()) - rank() over (
        order by
          coalesce(pnl.largest_unprofitable_trade_value, 0) asc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as largest_unprofitable_trade_percentile
from
  all_users u
  left join ucm_pnl pnl on pnl.user_id = u.user_id
with
  no data;

create unique index if not exists mv_ach_pnl_user_id_idx on public.mv_ach_pnl (user_id);

-- Portfolio maxes
create materialized view if not exists
  mv_ach_portfolio_maxes as
with
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
  coalesce(pm.highest_balance_mana, 0) as highest_balance_mana,
  coalesce(pm.highest_invested_mana, 0) as highest_invested_mana,
  coalesce(pm.highest_networth_mana, 0) as highest_networth_mana,
  coalesce(pm.highest_loan_mana, 0) as highest_loan_mana,
  rank() over (
    order by
      coalesce(pm.highest_balance_mana, 0) desc
  ) as highest_balance_rank,
  (
    (
      (count(*) over ()) - rank() over (
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
      (count(*) over ()) - rank() over (
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
      (count(*) over ()) - rank() over (
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
      (count(*) over ()) - rank() over (
        order by
          coalesce(pm.highest_loan_mana, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as highest_loan_percentile
from
  all_users u
  left join portfolio_maxes pm on pm.user_id = u.user_id
with
  no data;

create unique index if not exists mv_ach_portfolio_maxes_user_id_idx on public.mv_ach_portfolio_maxes (user_id);

-- Combined: Txns-based achievements (mod tickets resolved + charity donated)
create materialized view if not exists
  mv_ach_txns_achievements as
with
  mod_tickets_agg as (
    select
      to_id as user_id,
      count(*) as mod_tickets_resolved
    from
      txns
    where
      category = 'ADMIN_REWARD'
    group by
      to_id
  ),
  charity_agg as (
    select
      from_id as user_id,
      sum(
        case
          when token = 'M$' then amount / 100.0
          when token = 'CASH' then amount
          when token = 'SPICE' then amount / 1000.0
          else 0
        end
      ) as charity_donated_mana
    from
      txns
    where
      category = 'CHARITY'
    group by
      from_id
  ),
  all_users as (
    select
      id as user_id
    from
      users
  )
select
  u.user_id,
  coalesce(m.mod_tickets_resolved, 0) as mod_tickets_resolved,
  coalesce(c.charity_donated_mana, 0) as charity_donated_mana,
  rank() over (
    order by
      coalesce(m.mod_tickets_resolved, 0) desc
  ) as mod_tickets_rank,
  (
    (
      (count(*) over ()) - rank() over (
        order by
          coalesce(m.mod_tickets_resolved, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as mod_tickets_percentile,
  rank() over (
    order by
      coalesce(c.charity_donated_mana, 0) desc
  ) as charity_donated_rank,
  (
    (
      (count(*) over ()) - rank() over (
        order by
          coalesce(c.charity_donated_mana, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as charity_donated_percentile
from
  all_users u
  left join mod_tickets_agg m on m.user_id = u.user_id
  left join charity_agg c on c.user_id = u.user_id
with
  no data;

create unique index if not exists mv_ach_txns_achievements_user_id_idx on public.mv_ach_txns_achievements (user_id);

-- Combined: Creator-contract achievements (markets created + liquidity)
create materialized view if not exists
  mv_ach_creator_contracts as
with
  mana_contracts as (
    select
      id,
      creator_id,
      (data ->> 'uniqueBettorCount')::int as unique_bettors,
      (data ->> 'totalLiquidity')::numeric as total_liq
    from
      contracts
    where
      token = 'MANA'
  ),
  creator_agg as (
    select
      creator_id as user_id,
      count(*) filter (
        where
          unique_bettors >= 2
      ) as total_markets_created,
      coalesce(sum(total_liq), 0) as total_liquidity_created_markets
    from
      mana_contracts
    group by
      creator_id
  ),
  all_users as (
    select
      id as user_id
    from
      users
  )
select
  u.user_id,
  coalesce(ca.total_markets_created, 0) as total_markets_created,
  coalesce(ca.total_liquidity_created_markets, 0) as total_liquidity_created_markets,
  rank() over (
    order by
      coalesce(ca.total_markets_created, 0) desc
  ) as markets_created_rank,
  (
    (
      (count(*) over ()) - rank() over (
        order by
          coalesce(ca.total_markets_created, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as markets_created_percentile,
  rank() over (
    order by
      coalesce(ca.total_liquidity_created_markets, 0) desc
  ) as liquidity_rank,
  (
    (
      (count(*) over ()) - rank() over (
        order by
          coalesce(ca.total_liquidity_created_markets, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as liquidity_percentile
from
  all_users u
  left join creator_agg ca on ca.user_id = u.user_id
with
  no data;

create unique index if not exists mv_ach_creator_contracts_user_id_idx on public.mv_ach_creator_contracts (user_id);
