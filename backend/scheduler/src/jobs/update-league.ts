import { Bet } from 'common/bet'
import { Contract } from 'common/contract'
import {
  addLeagueProfitForContract,
  isLeagueScorableContract,
} from 'common/leagues'
import { convertContract } from 'common/supabase/contracts'
import { chunk, groupBy, sum, zipObject } from 'lodash'
import {
  SupabaseDirectClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import {
  getEffectiveCurrentSeason,
  getSeasonStartAndEnd,
} from 'shared/supabase/leagues'
import { bulkUpdate } from 'shared/supabase/utils'
import { contractColumnsToSelectWithPrefix, log } from 'shared/utils'

export async function updateLeague(
  manualSeason?: number,
  tx?: SupabaseDirectClient
) {
  const pg = tx ?? createSupabaseDirectClient()

  const season = manualSeason ?? (await getEffectiveCurrentSeason())
  const boundaries = await getSeasonStartAndEnd(pg, season)
  if (!boundaries) {
    log('Season boundaries not found. Exiting.')
    return
  }
  const { seasonStart, seasonEnd } = boundaries
  log(
    `Season ${season}: ${new Date(seasonStart).toISOString()} to ${new Date(
      seasonEnd
    ).toISOString()}`
  )

  if (Date.now() > seasonEnd) {
    log('Season has ended. Exiting.')
    return
  }

  // Candidate contracts come from contracts.last_bet_time, which the
  // contract_bets insert trigger bumps on every bet, so any market with a
  // season bet is in this set (a superset: a market whose only season
  // activity was unfilled orders is harmless, it scores nothing below). The
  // old `join contract_bets ... where created_time in season` found the same
  // contracts by walking every bet row of the season: 3.36M rows and 258 s on
  // 2026-10-09 for 5,104 contracts, versus 91 ms from the last_bet_time index.
  log('Loading users and contracts...')
  const results = await pg.multi(
    `select users.id from users
    join leagues on leagues.user_id = users.id
    where leagues.season = $1;
    select ${contractColumnsToSelectWithPrefix('contracts')}
    from contracts
    where contracts.last_bet_time >= millis_to_ts($2)
      and contracts.token = 'MANA'
      and contracts.visibility = 'public'
      and contracts.mechanism is distinct from 'perp'
      and coalesce((contracts.data->'isRanked')::boolean, true) = true;`,
    [season, seasonStart]
  )

  const userIds = results[0].map((r: any) => r.id as string)
  const contracts = results[1].map(convertContract)
  log(`Loaded ${userIds.length} user ids, ${contracts.length} contracts.`)

  log('Computing metric updates...')
  const profitByUserId = await computeSeasonProfit(
    pg,
    season,
    seasonStart,
    seasonEnd,
    userIds,
    contracts
  )
  const userProfit = userIds.map((userId) => ({
    user_id: userId,
    amount: profitByUserId[userId] ?? 0,
    category: 'profit' as const,
  }))

  // Include mana earned from unique trader bonuses during the season.
  const uniqueTraderBonuses = await pg.manyOrNone<{
    user_id: string
    amount: number
  }>(
    `select txns.to_id as user_id, sum(txns.amount)::numeric as amount
    from txns
    join contracts on contracts.id = (txns.data->'data'->>'contractId')
    where txns.category = 'UNIQUE_BETTOR_BONUS'
      and txns.token = 'M$'
      and txns.created_time > millis_to_ts($1)
      and txns.created_time < millis_to_ts($2)
      and txns.to_id = any($3)
      and contracts.created_time >= (txns.created_time - interval '31 days')
      and contracts.created_time <= txns.created_time
    group by txns.to_id`,
    [seasonStart, seasonEnd, userIds]
  )

  const userUniqueBonuses: {
    user_id: string
    amount: number
    category: 'UNIQUE_BETTOR_BONUS'
  }[] = uniqueTraderBonuses.map((r) => ({
    user_id: r.user_id,
    amount: +r.amount,
    category: 'UNIQUE_BETTOR_BONUS',
  }))

  // Launch policy: PERP position profit and loss does not count toward league
  // mana earned. Rolling day/week/month PERP metrics remain available for
  // portfolios and user reporting, but league inclusion must be designed and
  // enabled separately at a future season boundary.
  const combined = [
    ...userProfit.map((u) => ({ ...u, amount: +u.amount })),
    ...userUniqueBonuses,
  ]

  const amountByUserId = groupBy(combined, 'user_id')
  const manaEarnedUpdates = []
  for (const [userId, manaEarned] of Object.entries(amountByUserId)) {
    const keys = manaEarned.map((a) => a.category)
    const amounts = manaEarned.map((a) => a.amount)
    const manaEarnedBreakdown = zipObject(keys, amounts)
    const total = sum(amounts)

    manaEarnedUpdates.push({
      user_id: userId,
      season,
      mana_earned: total,
      mana_earned_breakdown: `${JSON.stringify(manaEarnedBreakdown)}::jsonb`,
    })
  }

  log(`Mana earned updates: ${manaEarnedUpdates.length}`)

  await bulkUpdate(pg, 'leagues', ['user_id', 'season'], manaEarnedUpdates)
  log('Done.')
}

// How many contracts' bets are held in memory at once. 300 contracts of the
// current season came back as 6,387 rows / 4.3 MB of bet JSON on 2026-10-09.
const CONTRACT_CHUNK_SIZE = 250

// Sums each league member's profit over the season's scorable contracts.
//
// Season bets are loaded per chunk of contracts, never all at once. This job
// used to run `select cb.data from contract_bets` for the whole season every
// 15 minutes and score it in JavaScript. A limit order that never fills still
// leaves a row, and a market-making bot quoting with a 2-second TTL took the
// current season past 3.1M rows within eight days (the job's own log line:
// "Loaded 3671 user ids, 3147604 bets, 4760 contracts"). Parsing that took
// 5-20 minutes per run, froze the event loop for minutes at a time (long
// enough for Postgres to kill every other job's open transaction on the 60s
// idle-in-transaction timeout), and two overlapping results exhausted the
// 14 GB heap: the scheduler container OOM-crashed every day between 10:00 and
// 11:50 UTC for at least the month of logs we keep.
//
// Two things bound it now:
//  - rows with amount = 0 and shares = 0 (unfilled or expired limit orders)
//    are excluded in SQL. getCpmmOrDpmProfit adds nothing for them: no
//    invested amount, no sale value, and zero shares pay out zero. A fill
//    against your own order always references a row that did fill, so
//    amount <> 0, and excludeSelfTrades still sees it. On 2026-10-09 that was
//    92% of the season's rows (3,232,186 -> 247,559).
//  - what remains is fetched CONTRACT_CHUNK_SIZE contracts at a time, joined
//    to the season's league members (the only users ever scored), so the
//    heap holds one chunk and the loop yields between chunks.
//
// The scoring itself is unchanged: per user, per contract, excludeSelfTrades,
// then filterBetsForLeagueScoring, then getProfitMetrics, now in
// common/leagues.ts (addLeagueProfitForContract) where it is unit-tested
// against the old whole-season loop. Every member gets an entry, 0 if they
// have no scorable bets, as before.
export const computeSeasonProfit = async (
  pg: SupabaseDirectClient,
  season: number,
  seasonStart: number,
  seasonEnd: number,
  userIds: string[],
  contracts: Contract[]
) => {
  const profitByUserId: Record<string, number> = Object.fromEntries(
    userIds.map((id) => [id, 0])
  )
  const scorable = contracts.filter(isLeagueScorableContract)
  const chunks = chunk(scorable, CONTRACT_CHUNK_SIZE)
  let betCount = 0

  for (const chunkContracts of chunks) {
    const bets = await pg.map(
      `select cb.data
      from contract_bets cb
      join leagues l on l.user_id = cb.user_id and l.season = $1
      where cb.contract_id in ($2:list)
        and cb.created_time > millis_to_ts($3)
        and cb.created_time < millis_to_ts($4)
        and (cb.amount <> 0 or cb.shares <> 0)`,
      [season, chunkContracts.map((c) => c.id), seasonStart, seasonEnd],
      (r) => r.data as Bet
    )
    betCount += bets.length
    const betsByContractId = groupBy(bets, (b) => b.contractId)

    for (const contract of chunkContracts) {
      const betsByUserId = groupBy(
        betsByContractId[contract.id] ?? [],
        (b) => b.userId
      )
      const nanUserIds = addLeagueProfitForContract(
        contract,
        betsByUserId,
        profitByUserId
      )
      for (const userId of nanUserIds) {
        log.error(
          `Profit is NaN! contract ${contract.slug} (${contract.id}) userId ${userId}`
        )
      }
    }
  }

  log(
    `Scored ${betCount} bets across ${scorable.length} contracts in ${chunks.length} chunks.`
  )
  return profitByUserId
}
