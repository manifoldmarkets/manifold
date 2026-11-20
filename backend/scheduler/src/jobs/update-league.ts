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

  // Preserve the old season-bet candidate set without duplicating contract
  // payloads for every bet. Synthetic bets (e.g. shares from adding an answer)
  // do not advance contracts.last_bet_time. EXISTS can use the existing
  // (contract_id, created_time) index and stop at the first season bet.
  log('Loading users and contracts...')
  const results = await pg.multi(
    `select users.id from users
    join leagues on leagues.user_id = users.id
    where leagues.season = $1;
    select ${contractColumnsToSelectWithPrefix('contracts')}
    from contracts
    where exists (
      select 1 from contract_bets cb
      where cb.contract_id = contracts.id
        and cb.created_time > millis_to_ts($2)
        and cb.created_time < millis_to_ts($3)
    )
      and contracts.token = 'MANA'
      and contracts.visibility = 'public'
      and contracts.mechanism is distinct from 'perp'
      and coalesce((contracts.data->'isRanked')::boolean, true) = true;`,
    [season, seasonStart, seasonEnd]
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

// A fill that matched another bet rather than the AMM. Passed as a parameter
// so pg-promise never sees `$[` in the query text.
const MATCHED_FILL_PATH = '$[*] ? (@.matchedBetId != null)'

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
// Two things reduce the rows held at once:
//  - rows that cannot move a score are excluded in SQL. A row counts only if
//    it has a non-zero amount or shares (getCpmmOrDpmProfit reads nothing
//    else), or one of its fills names another bet (excludeSelfTrades
//    subtracts a fill that matched the user's own order from the bet's
//    amount, so a zero-amount bet with a self-matched fill becomes a
//    synthetic sale and must stay). A zero row whose fills name no bet, the
//    shape every redemption written on a sums-to-one market has (two AMM
//    fills that cancel), does nothing in either path. On 2026-10-18 the
//    season's member rows were 722k non-zero, 29k zero with a matched fill,
//    and 2.13M zero with only unmatched fills; keeping the first two and not
//    the third cut the rows scored per run from 2.88M to 761k. Null amounts
//    or shares are kept (`is distinct from 0`), as before.
//  - what remains is fetched CONTRACT_CHUNK_SIZE contracts at a time, joined
//    to the season's league members (the only users ever scored), so the
//    heap holds one chunk and the loop yields between chunks. The number of
//    bets on a single contract is not bounded by the contract chunk size.
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
        and (
          cb.amount is distinct from 0
          or cb.shares is distinct from 0
          or jsonb_path_exists(cb.data->'fills', $5::jsonpath)
        )`,
      [
        season,
        chunkContracts.map((c) => c.id),
        seasonStart,
        seasonEnd,
        MATCHED_FILL_PATH,
      ],
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
