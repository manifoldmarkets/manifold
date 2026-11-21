-- Longest Daily Streak: rank the same number get-user-achievements shows, the
-- longest of any streak a bonus was paid for, the longest ended streak (kept
-- by reset-betting-streaks from this deploy on) and the current one. Before,
-- the rank counted paid bonuses only, so accounts that can't get streak
-- bonuses ranked at zero. Rebuilds the view under the same name; the profile
-- endpoint waits on it while it builds. Run as one transaction.
begin;

drop materialized view if exists mv_ach_txns_achievements;

create materialized view mv_ach_txns_achievements as
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
  -- The longest ended streak (kept by reset-betting-streaks) and the
  -- current one: accounts that get no streak bonus have no bonus txns.
  all_users as (
    select
      id as user_id,
      greatest(
        coalesce((data ->> 'longestBettingStreak')::int, 0),
        coalesce((data ->> 'currentBettingStreak')::int, 0)
      ) as user_streak
    from
      users
  )
select
  u.user_id,
  coalesce(m.mod_tickets_resolved, 0) as mod_tickets_resolved,
  coalesce(c.charity_donated_mana, 0) as charity_donated_mana,
  greatest(coalesce(s.longest_betting_streak, 0), u.user_streak) as longest_betting_streak,
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
      greatest(coalesce(s.longest_betting_streak, 0), u.user_streak) desc
  ) as longest_betting_streak_rank,
  (
    (
      (count(*) over ()) - rank() over (
        order by
          greatest(coalesce(s.longest_betting_streak, 0), u.user_streak) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as longest_betting_streak_percentile
from
  all_users u
  left join mod_tickets_agg m on m.user_id = u.user_id
  left join charity_agg c on c.user_id = u.user_id
  left join streaks_agg s on s.user_id = u.user_id;

create unique index if not exists mv_ach_txns_achievements_user_id_idx on public.mv_ach_txns_achievements (user_id);

commit;
