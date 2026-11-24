-- Ranks now measure the same thing as the number shown next to them on the
-- profile (get-user-achievements):
--   Comments: every comment the user has posted (contract and post comments),
--     not only ones that got a like.
--   Markets created: every public mana market the user created, not only ones
--     with at least two traders. Unlisted and deleted markets don't count.
--     Liquidity still sums every mana market the user created.
--
-- Changed on 24 Nov 2026, before it ran on prod, to leave out unlisted and
-- deleted markets. If an earlier version already ran somewhere, run this one
-- there too: it rebuilds and swaps both views again.
--
-- Run after the API deploy, the contract guards (2026112219), the user_stats
-- install (2026112220) and its completed backfill. Deploy web after the swap.
--
-- Both views are built under other names first, so profiles keep reading the
-- old ones during the build, then swapped in one short transaction. The swap
-- drops them in the order the profile query reads them (creator contracts,
-- then comments), so it can't deadlock with one; if it can't get a lock
-- within 5 s it gives up. Run the file again to retry.

-- 1. Build.
drop materialized view if exists mv_ach_creator_contracts_next;

create materialized view mv_ach_creator_contracts_next as
with
  creator_agg as (
    select
      creator_id as user_id,
      count(*) filter (
        where visibility = 'public' and not coalesce(deleted, false)
      ) as total_markets_created,
      coalesce(sum((data ->> 'totalLiquidity')::numeric), 0) as total_liquidity_created_markets
    from contracts
    where token = 'MANA'
    group by creator_id
  ),
  all_users as (
    select id as user_id from users
  )
select
  u.user_id,
  coalesce(ca.total_markets_created, 0) as total_markets_created,
  coalesce(ca.total_liquidity_created_markets, 0) as total_liquidity_created_markets,
  rank() over (
    order by coalesce(ca.total_markets_created, 0) desc
  ) as markets_created_rank,
  (
    (
      (count(*) over ()) - rank() over (
        order by coalesce(ca.total_markets_created, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as markets_created_percentile,
  rank() over (
    order by coalesce(ca.total_liquidity_created_markets, 0) desc
  ) as liquidity_rank,
  (
    (
      (count(*) over ()) - rank() over (
        order by coalesce(ca.total_liquidity_created_markets, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as liquidity_percentile
from all_users u
left join creator_agg ca on ca.user_id = u.user_id;

create unique index mv_ach_creator_contracts_next_user_id_idx on mv_ach_creator_contracts_next (user_id);

drop materialized view if exists mv_ach_comments_next;

create materialized view mv_ach_comments_next as
with
  comment_counts as (
    select user_id, count(*) as number_of_comments
    from (
      select user_id from contract_comments
      union all
      select user_id from old_post_comments
    ) c
    group by user_id
  ),
  all_users as (
    select id as user_id from users
  )
select
  u.user_id,
  coalesce(cc.number_of_comments, 0) as number_of_comments,
  rank() over (
    order by coalesce(cc.number_of_comments, 0) desc
  ) as comments_rank,
  (
    (
      (count(*) over ()) - rank() over (
        order by coalesce(cc.number_of_comments, 0) desc
      ) + 1
    )::numeric / (count(*) over ())
  ) * 100 as comments_percentile
from all_users u
left join comment_counts cc on cc.user_id = u.user_id;

create unique index mv_ach_comments_next_user_id_idx on mv_ach_comments_next (user_id);

-- 2. Swap.
begin;

set local lock_timeout = '5s';

drop materialized view mv_ach_creator_contracts;

drop materialized view mv_ach_comments;

alter materialized view mv_ach_creator_contracts_next rename to mv_ach_creator_contracts;

alter index mv_ach_creator_contracts_next_user_id_idx rename to mv_ach_creator_contracts_user_id_idx;

alter materialized view mv_ach_comments_next rename to mv_ach_comments;

alter index mv_ach_comments_next_user_id_idx rename to mv_ach_comments_user_id_idx;

commit;
