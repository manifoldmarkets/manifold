import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import {
  TROPHY_DEFINITIONS,
  type TrophyStatKey,
} from 'common/trophies'

/**
 * Returns a SQL query producing (uid text, stat_value numeric) for all users
 * with non-zero values for the given stat key. These mirror the CTEs in
 * get-user-achievements.ts but are designed for batch computation across all users.
 */
function buildStatQuery(statKey: TrophyStatKey): string {
  switch (statKey) {
    case 'longestBettingStreak':
      return `
        select to_id as uid,
               max((data->'data'->>'currentBettingStreak')::numeric) as stat_value
        from txns
        where category = 'BETTING_STREAK_BONUS'
        group by to_id`

    case 'totalMarketsCreated':
      return `
        select creator_id as uid, count(*)::numeric as stat_value
        from contracts
        where token = 'MANA'
        group by creator_id`

    case 'creatorTraders':
      return `
        select id as uid,
               (data->'creatorTraders'->>'allTime')::numeric as stat_value
        from users
        where (data->'creatorTraders'->>'allTime')::numeric > 0`

    case 'totalVolumeMana':
      return `
        select ucm.user_id as uid,
               sum(
                 coalesce((ucm.data->>'totalAmountSold')::numeric, 0) +
                 coalesce((ucm.data->>'totalAmountInvested')::numeric, 0)
               ) as stat_value
        from user_contract_metrics ucm
        join contracts c on c.id = ucm.contract_id
        where c.token = 'MANA' and ucm.answer_id is null
        group by ucm.user_id`

    case 'totalTradesCount':
      return `
        select user_id as uid, total_trades_count::numeric as stat_value
        from ach_trades
        where total_trades_count > 0`

    case 'totalReferrals':
      return `
        select id as uid, total_referrals::numeric as stat_value
        from user_referrals_profit
        where total_referrals > 0`

    case 'numberOfComments':
      return `
        select uid, sum(cnt)::numeric as stat_value from (
          select user_id as uid, count(*) as cnt
          from contract_comments group by user_id
          union all
          select user_id as uid, count(*) as cnt
          from old_post_comments group by user_id
        ) sub
        group by uid`

    case 'profitableMarketsCount':
      return `
        select ucm.user_id as uid, count(*)::numeric as stat_value
        from user_contract_metrics ucm
        join contracts c on c.id = ucm.contract_id
        where ucm.answer_id is null
          and c.token = 'MANA'
          and coalesce(ucm.profit, 0) > 0
        group by ucm.user_id`

    case 'seasonsPlatinumOrHigher':
      return `
        select user_id as uid, count(*)::numeric as stat_value
        from leagues
        where division >= 4
        group by user_id`

    case 'seasonsDiamondOrHigher':
      return `
        select user_id as uid, count(*)::numeric as stat_value
        from leagues
        where division >= 5
        group by user_id`

    case 'seasonsMasters':
      return `
        select user_id as uid, count(*)::numeric as stat_value
        from leagues
        where division = 6
        group by user_id`

    case 'accountAgeYears':
      return `
        select id as uid,
               round(
                 (extract(epoch from (now() - created_time)) / (365.25*24*60*60))::numeric,
                 2
               ) as stat_value
        from users`

    case 'charityDonatedMana':
      return `
        select from_id as uid,
               coalesce(
                 sum(case when token = 'M$' then amount / 100.0 else 0 end), 0
               ) +
               coalesce(
                 sum(case when token = 'CASH' then amount else 0 end), 0
               ) +
               coalesce(
                 sum(case when token = 'SPICE' then amount / 1000.0 else 0 end), 0
               ) as stat_value
        from txns
        where category = 'CHARITY'
        group by from_id`

    case 'modTicketsResolved':
      return `
        select to_id as uid, count(*)::numeric as stat_value
        from txns
        where category = 'ADMIN_REWARD'
          and data->'data'->>'updateType' = 'resolved'
        group by to_id`
  }
}

export const updateTrophyProgress = async () => {
  const pg = createSupabaseDirectClient()

  for (const trophy of TROPHY_DEFINITIONS) {
    const statQuery = buildStatQuery(trophy.statKey)
    log(`Updating trophy progress: ${trophy.id} (${trophy.statKey})`)

    await pg.none(
      `insert into user_trophy_progress (user_id, trophy_id, current_value, last_updated)
       select uid, $1, coalesce(stat_value, 0), now()
       from (${statQuery}) computed
       where stat_value > 0
       on conflict (user_id, trophy_id) do update
         set current_value = excluded.current_value,
             last_updated = now()`,
      [trophy.id]
    )
  }

  log('Trophy progress update complete.')
}
