import {
  MARKET_CREATED_MIN_TRADERS,
  MAX_TROPHY_RANK,
  NET_WORTH_RANK_ACTIVE_DAYS,
  RANKED_TROPHY_DEFINITIONS,
  REFERRAL_MIN_TRADES,
  getTopMilestone,
} from 'common/trophies'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { TROPHY_PERSON_FILTER } from 'shared/supabase/trophy-eligibility'
import { bulkInsertQuery } from 'shared/supabase/utils'
import { log } from 'shared/utils'

const valueQueries: Record<string, string> = {
  'net-worth': `select p.user_id, p.balance + p.investment_value as value
    from user_portfolio_history_latest p
    join users u on u.id = p.user_id
    where (u.data->>'lastBetTime')::bigint between
      extract(epoch from (now() - make_interval(days => $[activeDays]))) * 1000
      and extract(epoch from now()) * 1000`,
  // Migration 2026112212 takes the same greatest of bonus, ended, and current
  // streaks as get-user-achievements. Its 03:40 refresh precedes this job.
  'prediction-streak': `select user_id, longest_betting_streak as value
    from mv_ach_txns_achievements`,
  'profitable-markets': `select ucm.user_id, count(*) as value
    from user_contract_metrics ucm
    join contracts c on c.id = ucm.contract_id
    where ucm.answer_id is null and ucm.profit > 0 and c.token = 'MANA'
      and c.resolution is not null and c.resolution <> 'CANCEL'
    group by ucm.user_id`,
  'markets-created': `select creator_id as user_id, count(*) as value
    from contracts
    where visibility = 'public' and not coalesce(deleted, false) and token = 'MANA'
      and unique_bettor_count >= $[minTraders]
    group by creator_id`,
  'creator-traders': `select id as user_id, (data->'creatorTraders'->>'allTime')::numeric as value
    from users`,
  'liked-comments': `select r.content_owner_id as user_id, count(distinct r.content_id) as value
    from user_reactions r
    join users person on person.id = r.user_id
    where r.content_type = 'comment' and r.reaction_type = 'like'
      and r.user_id <> r.content_owner_id and ${TROPHY_PERSON_FILTER}
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

export async function updateTrophyRanks() {
  const started = Date.now()
  const pg = createSupabaseDirectClient()
  const summaries = await pg.tx(async (tx) => {
    // Serialize overlapping runs before sampling, so a retry cannot publish an older result.
    await tx.one(
      "select pg_advisory_xact_lock(hashtext('update-trophy-ranks'))"
    )
    const computedTime = new Date().toISOString()
    await tx.none(
      `insert into user_net_worth_peaks (user_id, peak_net_worth, peak_time)
       select p.user_id, p.balance + p.investment_value, $1
       from user_portfolio_history_latest p join users u on u.id = p.user_id
       where p.balance + p.investment_value > 0
       on conflict (user_id) do update set
         peak_net_worth = excluded.peak_net_worth, peak_time = excluded.peak_time
       where excluded.peak_net_worth > user_net_worth_peaks.peak_net_worth`,
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
           where value >= $[threshold] and ${TROPHY_PERSON_FILTER}
             and not exists (select 1 from trophy_rank_exclusions e where e.user_id = scores.user_id)
         )
         select user_id, value, rank from ranked where rank <= $[maxRank] order by rank`,
        {
          threshold: getTopMilestone(def).threshold,
          maxRank: MAX_TROPHY_RANK,
          activeDays: NET_WORTH_RANK_ACTIVE_DAYS,
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
    return summaries
  })
  for (const summary of summaries) log(summary)
  log(`Updated trophy ranks in ${Date.now() - started}ms`)
}
