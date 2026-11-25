import { BANNED_TRADING_USER_IDS } from 'common/envs/constants'
import {
  MARKET_CREATED_MIN_TRADERS,
  MAX_TROPHY_RANK,
  NET_WORTH_RANK_ACTIVE_DAYS,
  RANKED_TROPHY_DEFINITIONS,
  REFERRAL_MIN_TRADES,
  getTopMilestone,
} from 'common/trophies'
import { EPSILON } from 'common/util/math'
import { pgp, SupabaseTransaction } from 'shared/supabase/init'
import {
  TROPHY_FRESH_PORTFOLIO_FILTER,
  TROPHY_NET_WORTH_PEAK_CONFLICT,
  TROPHY_PERSON_FILTER,
  TROPHY_VISIBLE_COMMENT_FILTER,
} from 'shared/supabase/trophy-eligibility'
import { bulkInsertQuery } from 'shared/supabase/utils'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { log } from 'shared/utils'

const valueQueries: Record<string, string> = {
  // Restrict the indexed bet and order lookups to Whale candidates.
  'net-worth': `with candidates as materialized (
      select * from trophy_net_worth_sample
      where value >= $[threshold] and value < 'Infinity'::numeric
    )
    select n.user_id, n.value from candidates n
    where n.last_bet_time between
      extract(epoch from (now() - make_interval(days => $[activeDays]))) * 1000
      and extract(epoch from now()) * 1000
      or (select true from contract_bets b
        where b.user_id = n.user_id
          and b.created_time between now() - make_interval(days => $[activeDays]) and now()
        limit 1)
      or (select true from contract_bets b
        join contracts c on c.id = b.contract_id
        join system_trading_status s on s.token = c.token and s.status
        left join answers a on a.id = b.answer_id and a.contract_id = c.id
        where n.spendable_balance >= 1 and b.user_id = n.user_id
          and not b.is_filled and not b.is_cancelled
          and (b.expires_at is null or b.expires_at > now())
          and c.resolution is null and (c.close_time is null or c.close_time > now())
          and c.mechanism <> 'none' and not coalesce(c.deleted, false)
          and (b.answer_id is null or (a.id is not null and a.resolution is null))
        limit 1)`,
  // Migration 2026112212 takes the same greatest of bonus, ended, and current
  // streaks as get-user-achievements. Its 03:40 refresh precedes this job.
  'prediction-streak': `select user_id, longest_betting_streak as value
    from mv_ach_txns_achievements`,
  'profitable-markets': `select ucm.user_id, count(*) as value
    from user_contract_metrics ucm
    join contracts c on c.id = ucm.contract_id
    where ucm.answer_id is null and ucm.profit > $[epsilon] and ucm.profit < 'Infinity'::numeric
      and c.token = 'MANA'
      and c.resolution is not null and c.resolution <> 'CANCEL'
      and not coalesce(c.deleted, false)
    group by ucm.user_id`,
  'markets-created': `select creator_id as user_id, count(*) as value
    from contracts c
    where visibility = 'public' and not coalesce(deleted, false) and token = 'MANA'
      and c.mechanism <> 'none' and unique_bettor_count >= $[minTraders]
    group by creator_id`,
  'creator-traders': `select id as user_id, (data->'creatorTraders'->>'allTime')::numeric as value
    from users`,
  'liked-comments': `select r.content_owner_id as user_id, count(distinct r.content_id) as value
    from user_reactions r
    join users person on person.id = r.user_id
    where r.content_type = 'comment' and r.reaction_type = 'like'
      and r.user_id <> r.content_owner_id and ${TROPHY_PERSON_FILTER}
      and ${TROPHY_VISIBLE_COMMENT_FILTER}
    group by r.content_owner_id`,
  // Ready for the referrals flag. Unranked definitions never run their query.
  referrals: `select person.data->>'referredByUserId' as user_id, count(*) as value
    from users person
    left join user_stats s on s.user_id = person.id
    left join user_stats_baseline baseline on baseline.user_id = person.id
    where person.data->>'referredByUserId' is not null and ${TROPHY_PERSON_FILTER}
      and coalesce(s.trades, 0) + coalesce(baseline.trades, 0) >= $[minReferralTrades]
    group by person.data->>'referredByUserId'`,
  // Keep this mapping identical to getLeagueLevel in common/trophies.
  leagues: `select user_id, case
      when count(*) filter (where division = 6) > 0 then 3 + count(*) filter (where division = 6)
      when max(division) >= 5 then 3
      when max(division) >= 4 then 2
      when max(division) >= 3 then 1
      else 0 end as value
    from leagues group by user_id`,
}

// PostgreSQL numeric sorts NaN above Infinity.
const finiteValue = `value > '-Infinity'::numeric and value < 'Infinity'::numeric`
const mode = new pgp.txMode.TransactionMode({
  tiLevel: pgp.txMode.isolationLevel.repeatableRead,
  readOnly: false,
})

export async function updateTrophyRanks() {
  const started = Date.now()
  const summaries = await runTransactionWithRetries(publishTrophyRanks, 3, {
    mode,
  })
  for (const summary of summaries) log(summary)
  log(`Updated trophy ranks in ${Date.now() - started}ms`)
}

async function publishTrophyRanks(tx: SupabaseTransaction) {
  // Serialize publications. All rank sources use this transaction's snapshot.
  await tx.one("select pg_advisory_xact_lock(hashtext('update-trophy-ranks'))")
  const computedTime = new Date().toISOString()
  // A publisher that waited on the lock can have a stale snapshot. Make it
  // hit a retryable serialization failure before it can insert duplicate ranks.
  await tx.none(
    `insert into trophy_rank_state (computed_time) values ($1)
     on conflict (id) do update set computed_time = excluded.computed_time`,
    [computedTime]
  )
  await tx.none(
    `create temp table trophy_net_worth_sample on commit drop as
     select uphl.user_id, uphl.balance + uphl.investment_value as value,
       u.balance as spendable_balance, (u.data->>'lastBetTime')::bigint as last_bet_time
     from user_portfolio_history_latest uphl join users u on u.id = uphl.user_id
     where ${TROPHY_FRESH_PORTFOLIO_FILTER}`
  )
  await tx.none(
    `insert into user_net_worth_peaks (user_id, peak_net_worth, peak_time)
     select user_id, value, $1 from trophy_net_worth_sample
     where value > 0 and ${finiteValue}
     ${TROPHY_NET_WORTH_PEAK_CONFLICT}`,
    [computedTime]
  )

  const summaries: string[] = []
  await tx.none('delete from trophy_ranks')
  for (const def of RANKED_TROPHY_DEFINITIONS) {
    const query = valueQueries[def.id]
    if (!query) throw new Error(`Missing trophy rank query for ${def.id}`)
    const rows = await tx.manyOrNone<{
      user_id: string
      value: number
      rank: number
    }>(
      `with scores as (${query}), ranked as (
         select scores.*, rank() over (order by value desc) as rank
         from scores join users person on person.id = scores.user_id
         where value >= $[threshold] and ${finiteValue} and ${TROPHY_PERSON_FILTER}
           and not exists (select 1 from trophy_rank_exclusions e where e.user_id = scores.user_id)
       )
       select user_id, value, rank from ranked where rank <= $[maxRank] order by rank`,
      {
        threshold: getTopMilestone(def).threshold,
        maxRank: MAX_TROPHY_RANK,
        activeDays: NET_WORTH_RANK_ACTIVE_DAYS,
        bannedTradingIds: BANNED_TRADING_USER_IDS,
        epsilon: EPSILON,
        minTraders: MARKET_CREATED_MIN_TRADERS,
        minReferralTrades: REFERRAL_MIN_TRADES,
      }
    )
    await tx.none(
      bulkInsertQuery(
        'trophy_ranks',
        rows.map((row) => ({
          ...row,
          trophy_id: def.id,
          computed_time: computedTime,
        })),
        false
      )
    )
    summaries.push(
      `${def.id}: ${rows.length} holders, cutoff ${
        rows[rows.length - 1]?.value ?? 'none'
      }`
    )
  }
  await tx.none(
    `insert into user_trophy_rank_peaks as peak
       (user_id, trophy_id, best_rank, first_ranked_time, best_rank_time)
     select user_id, trophy_id, rank, computed_time, computed_time from trophy_ranks
     on conflict (user_id, trophy_id) do update set
       best_rank = least(peak.best_rank, excluded.best_rank),
       best_rank_time = excluded.best_rank_time
     where excluded.best_rank < peak.best_rank`
  )
  await tx.none(
    'update trophy_rank_state set computed_time = $1 where id = true',
    [computedTime]
  )
  return summaries
}
