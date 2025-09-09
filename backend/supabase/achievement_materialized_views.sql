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
  left join volume v on v.user_id = u.user_id;

create unique index if not exists mv_ach_volume_user_id_idx on public.mv_ach_volume (user_id);

-- Trades
create table if not exists
  ach_trades (
    user_id text primary key,
    total_trades_count integer not null default 0,
    trades_rank integer,
    last_updated timestamp with time zone not null default to_timestamp(0)
  );

create unique index if not exists ach_trades_user_id_idx on public.ach_trades (user_id);

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
  left join liked_comments lc on lc.user_id = u.user_id;

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
      coalesce(la.seasons_gold_or_higher, 0) desc
  ) as seasons_gold_or_higher_rank,
  (
    (
      (count(*) over ()) - rank() over (
        order by
          coalesce(la.seasons_gold_or_higher, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as seasons_gold_or_higher_percentile,
  rank() over (
    order by
      coalesce(la.seasons_platinum_or_higher, 0) desc
  ) as seasons_platinum_or_higher_rank,
  (
    (
      (count(*) over ()) - rank() over (
        order by
          coalesce(la.seasons_platinum_or_higher, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as seasons_platinum_or_higher_percentile,
  rank() over (
    order by
      coalesce(la.seasons_diamond_or_higher, 0) desc
  ) as seasons_diamond_or_higher_rank,
  (
    (
      (count(*) over ()) - rank() over (
        order by
          coalesce(la.seasons_diamond_or_higher, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as seasons_diamond_or_higher_percentile,
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
  left join leagues_agg la on la.user_id = u.user_id;

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
      max(ucm.profit) filter (
        where
          coalesce(ucm.profit, 0) > 0
      ) as largest_profitable_trade_value,
      min(ucm.profit) filter (
        where
          coalesce(ucm.profit, 0) < 0
      ) as largest_unprofitable_trade_value
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
  left join ucm_pnl pnl on pnl.user_id = u.user_id;

create unique index if not exists mv_ach_pnl_user_id_idx on public.mv_ach_pnl (user_id);

-- Combined: Txns-based achievements (mod tickets resolved + charity donated + longest streak)
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
      and data -> 'data' ->> 'updateType' = 'resolved'
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
  streaks_agg as (
    select
      to_id as user_id,
      coalesce(
        max((data -> 'data' ->> 'currentBettingStreak')::int),
        0
      ) as longest_betting_streak
    from
      txns
    where
      category = 'BETTING_STREAK_BONUS'
    group by
      to_id
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
  coalesce(s.longest_betting_streak, 0) as longest_betting_streak,
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
  ) * 100 as charity_donated_percentile,
  rank() over (
    order by
      coalesce(s.longest_betting_streak, 0) desc
  ) as longest_betting_streak_rank,
  (
    (
      (count(*) over ()) - rank() over (
        order by
          coalesce(s.longest_betting_streak, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as longest_betting_streak_percentile
from
  all_users u
  left join mod_tickets_agg m on m.user_id = u.user_id
  left join charity_agg c on c.user_id = u.user_id
  left join streaks_agg s on s.user_id = u.user_id;

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
  left join creator_agg ca on ca.user_id = u.user_id;

create unique index if not exists mv_ach_creator_contracts_user_id_idx on public.mv_ach_creator_contracts (user_id);

-- Referrals (count and referred profit)
create materialized view if not exists
  mv_ach_referrals as
with
  referrals as (
    select
      id as user_id,
      coalesce(total_referrals, 0) as total_referrals,
      coalesce(total_referred_profit, 0) as total_referred_profit_mana
    from
      user_referrals_profit
  ),
  all_users as (
    select
      id as user_id
    from
      users
  )
select
  u.user_id,
  coalesce(r.total_referrals, 0) as total_referrals,
  coalesce(r.total_referred_profit_mana, 0) as total_referred_profit_mana,
  rank() over (
    order by
      coalesce(r.total_referrals, 0) desc
  ) as total_referrals_rank,
  (
    (
      (count(*) over ()) - rank() over (
        order by
          coalesce(r.total_referrals, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as total_referrals_percentile,
  rank() over (
    order by
      coalesce(r.total_referred_profit_mana, 0) desc
  ) as total_referred_profit_rank,
  (
    (
      (count(*) over ()) - rank() over (
        order by
          coalesce(r.total_referred_profit_mana, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as total_referred_profit_percentile
from
  all_users u
  left join referrals r on r.user_id = u.user_id;

create unique index if not exists mv_ach_referrals_user_id_idx on public.mv_ach_referrals (user_id);

-- Creator traders (unique traders on your markets)
create materialized view if not exists
  mv_ach_creator_traders as
with
  creator_traders as (
    select
      id as user_id,
      coalesce((data -> 'creatorTraders' ->> 'allTime')::int, 0) as creator_traders
    from
      users
  ),
  all_users as (
    select
      id as user_id
    from
      users
  )
select
  u.user_id,
  coalesce(ct.creator_traders, 0) as creator_traders,
  rank() over (
    order by
      coalesce(ct.creator_traders, 0) desc
  ) as creator_traders_rank,
  (
    (
      (count(*) over ()) - rank() over (
        order by
          coalesce(ct.creator_traders, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as creator_traders_percentile
from
  all_users u
  left join creator_traders ct on ct.user_id = u.user_id;

create unique index if not exists mv_ach_creator_traders_user_id_idx on public.mv_ach_creator_traders (user_id);

-- Account age (in years at refresh time)
create materialized view if not exists
  mv_ach_account_age as
with
  ages as (
    select
      id as user_id,
      extract(
        epoch
        from
          (now() - created_time)
      ) / (365.25 * 24 * 60 * 60) as account_age_years
    from
      users
  ),
  all_users as (
    select
      id as user_id
    from
      users
  )
select
  u.user_id,
  coalesce(a.account_age_years, 0) as account_age_years,
  rank() over (
    order by
      coalesce(a.account_age_years, 0) desc
  ) as account_age_rank,
  (
    (
      (count(*) over ()) - rank() over (
        order by
          coalesce(a.account_age_years, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as account_age_percentile
from
  all_users u
  left join ages a on a.user_id = u.user_id;

create unique index if not exists mv_ach_account_age_user_id_idx on public.mv_ach_account_age (user_id);
