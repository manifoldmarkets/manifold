import { groupBy } from 'lodash'

import { BANNED_TRADING_USER_IDS } from 'common/envs/constants'
import {
  MARKET_CREATED_MIN_TRADERS,
  MAX_TROPHY_RANK,
  NET_WORTH_RANK_ACTIVE_DAYS,
  RANKED_TROPHY_DEFINITIONS,
  REFERRAL_MIN_TRADES,
  getRankPrizeRewardId,
  getRankPrizeTiers,
  getRankTierPrize,
  getTopMilestone,
  getTrophyRankTitle,
} from 'common/trophies'
import {
  RANK_TIER_PRIZES,
  isEmptyPrizeTotal,
  totalPrizes,
} from 'common/trophy-prizes'
import { EPSILON } from 'common/util/math'
import {
  createSupabaseDirectClient,
  pgp,
  READ_ONLY_REPEATABLE_MODE,
  SupabaseTransaction,
} from 'shared/supabase/init'
import {
  TROPHY_FRESH_PORTFOLIO_FILTER,
  TROPHY_NET_WORTH_PEAK_CONFLICT,
  TROPHY_PERSON_FILTER,
  TROPHY_SNAPSHOT_NET_WORTH,
  trophyLikedCommentsQuery,
} from 'shared/supabase/trophy-eligibility'
import { transactWithRetries } from 'shared/transact-with-retries'
import {
  getAccountPrizeStanding,
  payTrophyPrizes,
  settleTrophyMembershipPrizes,
} from 'shared/trophy-prizes'
import { log } from 'shared/utils'
import { relayTrophyPrizeBroadcasts } from './settle-trophy-prizes'

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
          and b.is_redemption is not true
          and (b.data->>'isAutoRedemption') is distinct from 'true'
        limit 1)
      or (select true from perp_orders p
        where p.user_id = n.user_id
          and p.created_time between now() - make_interval(days => $[activeDays]) and now()
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
  'liked-comments': trophyLikedCommentsQuery('all'),
  // Ready for the referrals flag. Unranked definitions never run their query.
  referrals: `select person.data->>'referredByUserId' as user_id, count(*) as value
    from users person
    left join user_stats s on s.user_id = person.id
    left join user_stats_baseline baseline on baseline.user_id = person.id
    where person.id <> (person.data->>'referredByUserId') and ${TROPHY_PERSON_FILTER}
      and coalesce(s.trades, 0) + coalesce(baseline.trades, 0) >= $[minReferralTrades]
    group by person.data->>'referredByUserId'`,
  // Keep this mapping identical to getLeagueLevel in common/trophies.
  leagues: `select user_id, case
      when count(*) filter (where division = 6) > 0 then 4 + count(*) filter (where division = 6)
      when max(division) >= 5 then 4
      when max(division) >= 4 then 3
      when max(division) >= 3 then 2
      when max(division) >= 2 then 1
      else 0 end as value
    from leagues group by user_id`,
}

// PostgreSQL numeric sorts NaN above Infinity.
const finiteValue = `value > '-Infinity'::numeric and value < 'Infinity'::numeric`
const writeMode = new pgp.txMode.TransactionMode({
  tiLevel: pgp.txMode.isolationLevel.readCommitted,
  readOnly: false,
})

export async function updateTrophyRanks() {
  const started = Date.now()
  await createSupabaseDirectClient().task(async (session) => {
    // Acquire before opening the snapshot so a waiting publisher samples anew.
    await session.one(
      "select pg_advisory_lock(hashtext('update-trophy-ranks'))"
    )
    try {
      const snapshot = await session.tx(
        { mode: READ_ONLY_REPEATABLE_MODE },
        readTrophyRanks
      )
      const updatedPeaks = await transactWithRetries(
        session,
        3,
        (tx) => publishTrophyRanks(tx, snapshot),
        { mode: writeMode }
      )
      for (const summary of snapshot.summaries) log(summary)
      log(
        `Raised ${updatedPeaks} net worth peaks from ${snapshot.peakCandidates.length} candidates`
      )
      // The ranks are published. A prize that fails here is still owed, and
      // tomorrow's run pays it: best ranks are kept, and a prize pays once.
      try {
        await payRankTitlePrizes()
      } catch (error) {
        log.error('Failed to pay trophy rank title prizes', { error })
      }
    } finally {
      await session.one(
        "select pg_advisory_unlock(hashtext('update-trophy-ranks'))"
      )
    }
  })
  log(`Updated trophy ranks in ${Date.now() - started}ms`)
}

/**
 * Pays RANK_TIER_PRIZES to every account whose best rank on a ranked trophy
 * has reached Super or Mega and hasn't been paid for it: once per account,
 * trophy and title, the first run after the best rank gets there. Mega also
 * pays Super. Like a claim, each account is paid in its own transaction with
 * its row locked, and what its standing leaves empty stays unpaid.
 */
export async function payRankTitlePrizes() {
  const pg = createSupabaseDirectClient()
  const params = {
    rankedIds: RANKED_TROPHY_DEFINITIONS.map((def) => def.id),
    maxRank: MAX_TROPHY_RANK,
    bannedTradingIds: BANNED_TRADING_USER_IDS,
  }
  const peaks = await pg.manyOrNone<{
    user_id: string
    trophy_id: string
    best_rank: number
    paid_ids: string[]
  }>(
    `select peak.user_id, peak.trophy_id, peak.best_rank,
       array(select r.milestone_id from user_trophy_rewards r
         where r.user_id = peak.user_id and r.trophy_id = peak.trophy_id) as paid_ids
     from user_trophy_rank_peaks peak
     join users person on person.id = peak.user_id
     where peak.trophy_id in ($[rankedIds:csv]) and peak.best_rank <= $[maxRank]
       and ${TROPHY_PERSON_FILTER}
       and not exists (select 1 from trophy_rank_exclusions e where e.user_id = peak.user_id)
     order by peak.user_id, peak.trophy_id`,
    params
  )
  const owed = peaks.flatMap(({ user_id, trophy_id, best_rank, paid_ids }) => {
    const definition = RANKED_TROPHY_DEFINITIONS.find((d) => d.id === trophy_id)
    const tiers = getRankPrizeTiers(best_rank).filter(
      (tier) => !paid_ids.includes(getRankPrizeRewardId(tier))
    )
    return definition && tiers.length ? [{ user_id, definition, tiers }] : []
  })

  let accounts = 0
  let prizes = 0
  let failed = 0
  for (const [userId, trophies] of Object.entries(groupBy(owed, 'user_id'))) {
    try {
      const paid = await pg.tx(async (tx) => {
        // The same person and exclusion rules as the ranks, checked again
        // under the lock.
        const person = await tx.oneOrNone<{ bonus_eligibility: string | null }>(
          `select person.data->>'bonusEligibility' as bonus_eligibility
           from users person
           where person.id = $[userId] and ${TROPHY_PERSON_FILTER}
             and not exists (select 1 from trophy_rank_exclusions e where e.user_id = person.id)
           for no key update of person`,
          { ...params, userId }
        )
        if (!person) return []
        const { effectiveTier, standing } = await getAccountPrizeStanding(
          tx,
          userId,
          person.bonus_eligibility
        )
        const paid: string[] = []
        for (const { definition, tiers } of trophies) {
          const due = tiers
            .map((tier) => ({
              rewardId: getRankPrizeRewardId(tier),
              name: getTrophyRankTitle(definition, tier),
              baseMana: totalPrizes([RANK_TIER_PRIZES[tier]]).mana,
              prize: getRankTierPrize(tier, standing),
            }))
            .filter(({ prize }) => !isEmptyPrizeTotal(prize))
          if (!due.length) continue
          const result = await payTrophyPrizes(tx, {
            userId,
            trophyId: definition.id,
            prizes: due,
            effectiveTier,
            multiplier: standing.manaMultiplier,
            describe: (names) => `Trophy title prize: ${names.join(', ')}`,
            // The scheduler has no browser sockets: see the relay below.
            onUserUpdates: () => {},
          })
          paid.push(...result.paidRewardIds)
        }
        return paid
      })
      if (!paid.length) continue
      accounts++
      prizes += paid.length
      // After commit, outside the transaction: grantMembershipDays opens its
      // own. A part that fails stays pending for settle-trophy-prizes.
      const { failed: pending } = await settleTrophyMembershipPrizes(pg, {
        userId,
      })
      failed += pending
      await relayTrophyPrizeBroadcasts([userId])
    } catch (error) {
      failed++
      log.error('Failed to pay trophy rank title prizes to an account', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  log(
    `Rank title prizes: paid ${prizes} to ${accounts} accounts, ${failed} failed`
  )
}

// Read the portfolio once for both consumers. A null rank identifies a peak
// candidate, including highs set by users who do not qualify for a title.
const withNetWorthPeaks = (holders: string) =>
  `with trophy_net_worth_sample as materialized (
     select uphl.user_id, ${TROPHY_SNAPSHOT_NET_WORTH} as value,
       u.balance as spendable_balance, (u.data->'lastBetTime')::bigint as last_bet_time
     from user_portfolio_history_latest uphl join users u on u.id = uphl.user_id
     where ${TROPHY_FRESH_PORTFOLIO_FILTER}
   ), holders as (${holders})
   select user_id, value, rank from holders
   union all
   select sample.user_id, sample.value::text, null as rank from trophy_net_worth_sample sample
   left join user_net_worth_peaks peak on peak.user_id = sample.user_id
   where sample.value > coalesce(peak.peak_net_worth, 0) and ${finiteValue}`

// Preserve exact PostgreSQL numerics when passing the snapshot back for writing.
type Score = { user_id: string; value: string }

async function readTrophyRanks(tx: SupabaseTransaction) {
  const computedTime = new Date().toISOString()
  const summaries: string[] = []
  const ranks: (Score & { trophy_id: string; rank: number })[] = []
  const peakCandidates: Score[] = []
  for (const def of RANKED_TROPHY_DEFINITIONS) {
    const query = valueQueries[def.id]
    if (!query) throw new Error(`Missing trophy rank query for ${def.id}`)
    const holders = `with scores as (${query}), ranked as (
         select scores.*, rank() over (order by value desc) as rank
         from scores join users person on person.id = scores.user_id
         where value >= $[threshold] and ${finiteValue} and ${TROPHY_PERSON_FILTER}
           and not exists (select 1 from trophy_rank_exclusions e where e.user_id = scores.user_id)
       )
       select user_id, value::text, rank from ranked where rank <= $[maxRank]`
    const rows = await tx.manyOrNone<Score & { rank: number | null }>(
      def.id === 'net-worth' ? withNetWorthPeaks(holders) : holders,
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
    let holderCount = 0
    let cutoff = Infinity
    for (const { user_id, value, rank } of rows) {
      if (rank === null) {
        peakCandidates.push({ user_id, value })
      } else {
        ranks.push({ user_id, value, rank, trophy_id: def.id })
        holderCount++
        cutoff = Math.min(cutoff, Number(value))
      }
    }
    summaries.push(
      `${def.id}: ${holderCount} holders, cutoff ${
        holderCount ? cutoff : 'none'
      }`
    )
  }
  return { summaries, peakCandidates, ranks, computedTime }
}

async function publishTrophyRanks(
  tx: SupabaseTransaction,
  {
    peakCandidates,
    ranks,
    computedTime,
  }: Awaited<ReturnType<typeof readTrophyRanks>>
) {
  // A user can be removed between the snapshot and publication. Keep each
  // surviving parent row through commit when inserting its dependent rows.
  const peaks = await tx.result(
    `insert into user_net_worth_peaks (user_id, peak_net_worth, peak_time)
     select p.user_id, p.value, $[computedTime]
     from jsonb_to_recordset($[peakCandidates:json]::jsonb) as p(user_id text, value numeric)
     join users u on u.id = p.user_id
     order by p.user_id for key share of u
     ${TROPHY_NET_WORTH_PEAK_CONFLICT}`,
    { peakCandidates, computedTime }
  )
  await tx.none('delete from trophy_ranks')
  await tx.none(
    `insert into trophy_ranks (user_id, trophy_id, value, rank, computed_time)
     select r.user_id, r.trophy_id, r.value, r.rank, $[computedTime]
     from jsonb_to_recordset($[ranks:json]::jsonb) as r(user_id text, trophy_id text, value numeric, rank int)
     join users u on u.id = r.user_id
     order by r.user_id for key share of u`,
    { ranks, computedTime }
  )
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
    `insert into trophy_rank_state (computed_time) values ($1)
     on conflict (id) do update set computed_time = excluded.computed_time`,
    [computedTime]
  )
  return peaks.rowCount
}
