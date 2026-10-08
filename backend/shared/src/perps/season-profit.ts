// League-season PERP profit and loss. A season scores what each position made
// inside the season window, with the same replay as the portfolio's
// day/week/month numbers (common/perps/metric-periods.ts):
//
//   season P&L = current value + payouts - value at season start - new margin
//
// So a position carried into a season counts only for how its value moved
// after the boundary, and no mana is counted in two seasons.

import { PerpContract } from 'common/contract'
import { calculatePerpProfitSince } from 'common/perps/metric-periods'
import { PerpEvent, PerpPosition } from 'common/perps/position'
import { Row } from 'common/supabase/utils'
import { keyBy, uniq } from 'lodash'
import {
  READ_ONLY_REPEATABLE_MODE,
  SupabaseDirectClient,
  SupabaseTransaction,
} from 'shared/supabase/init'
import { PerpEventRow, rowToPerpEvent, rowToPosition } from './queries'

export type PerpSeasonProfit = {
  userId: string
  contractId: string
  profit: number
}

export type PerpSeasonProfitFailure = {
  userId: string
  contractId: string
  reasons: string[]
}

const pairKey = (userId: string, contractId: string) =>
  `${userId}\u0000${contractId}`

// The same eligibility update-league applies to ordinary markets.
const loadLeagueContracts = (tx: SupabaseTransaction) =>
  tx.map(
    `select data
       from contracts
      where mechanism = 'perp'
        and token = 'MANA'
        and visibility = 'public'
        and coalesce((data->'isRanked')::boolean, true) = true`,
    [],
    (row: { data: PerpContract }) => row.data
  )

const loadPositions = (
  tx: SupabaseTransaction,
  contractIds: string[],
  userIds: string[]
) =>
  tx.map(
    `select *
       from contract_perp_positions
      where contract_id = any($1)
        and user_id = any($2)`,
    [contractIds, userIds],
    (row: Row<'contract_perp_positions'>) => rowToPosition(row)
  )

// Hourly funding is most of a season's events: every open position gets one
// row an hour. Funding scales a position's size and cost basis by one common
// factor and never touches its entry price, so a run of funding rows with no
// other event of that user on that contract between them replays exactly as
// one row carrying their summed deltas. Collapse each run in SQL rather than
// ship ~720 rows per position per season to Node on every 15-minute run; the
// window carries no jsonb, which is fetched only for the rows returned.
//
// The sums are same-signed in exact arithmetic; if rounding ever leaves a
// net-zero run with opposite signs, that run falls back to its individual
// rows, so the replay's own funding checks see exactly what they always did.
const loadSeasonEvents = (
  tx: SupabaseTransaction,
  contractIds: string[],
  userIds: string[],
  seasonStart: number,
  asOf: number
) =>
  tx.map(
    `with windowed as (
       select e.id, e.contract_id, e.user_id, e.event_type, e.applied_ts,
              e.ts, e.oracle_price, e.size_delta, e.cost_basis_delta,
              e.original_cost_basis_delta, e.direction, e.leverage,
              count(*) filter (where e.event_type <> 'funding') over (
                partition by e.user_id, e.contract_id
                order by e.id desc
              ) as later_actions
         from contract_perp_events e
        where e.contract_id = any($1)
          and e.user_id = any($2)
          and e.applied_ts >= $3
          and e.applied_ts < $4
     ),
     runs as (
       select user_id, contract_id, direction, later_actions,
              max(id) as id,
              sum(size_delta) as size_delta,
              sum(cost_basis_delta) as cost_basis_delta,
              sum(original_cost_basis_delta) as original_cost_basis_delta
         from windowed
        where event_type = 'funding'
        group by user_id, contract_id, direction, later_actions
     )
     select w.id, w.contract_id, w.user_id, w.event_type, w.applied_ts, w.ts,
            w.oracle_price, w.size_delta, w.cost_basis_delta,
            w.original_cost_basis_delta, w.direction, w.leverage,
            (select x.data from contract_perp_events x where x.id = w.id)
              as data
       from windowed w
      where w.event_type <> 'funding'
     union all
     select w.id, w.contract_id, w.user_id, w.event_type, w.applied_ts, w.ts,
            w.oracle_price, r.size_delta, r.cost_basis_delta,
            r.original_cost_basis_delta, w.direction, w.leverage, null
       from runs r
       join windowed w on w.id = r.id
      where sign(r.size_delta) = sign(r.cost_basis_delta)
     union all
     select w.id, w.contract_id, w.user_id, w.event_type, w.applied_ts, w.ts,
            w.oracle_price, w.size_delta, w.cost_basis_delta,
            w.original_cost_basis_delta, w.direction, w.leverage, null
       from runs r
       join windowed w
         on w.user_id = r.user_id
        and w.contract_id = r.contract_id
        and w.later_actions = r.later_actions
        and w.direction is not distinct from r.direction
      where w.event_type = 'funding'
        and sign(r.size_delta) <> sign(r.cost_basis_delta)`,
    [
      contractIds,
      userIds,
      new Date(seasonStart).toISOString(),
      new Date(asOf).toISOString(),
    ],
    (row: PerpEventRow) => rowToPerpEvent(row)
  )

// Boundary valuation uses the newest feed-effective point Manifold had
// published by the season start — the same index-mark convention as the
// rolling periods. A point is never published before its effective time, so
// also bounding `ts` excludes nothing and lets the scan start at the boundary
// instead of walking back through every point published since (~1.3M a month
// on a 2-second feed) on each run.
const loadBoundaryPrices = async (
  tx: SupabaseTransaction,
  feedIds: string[],
  seasonStart: number
) => {
  const cutoff = new Date(seasonStart).toISOString()
  const rows = await tx.manyOrNone<{
    feed_id: string
    price: number | string | null
  }>(
    `select feeds.feed_id, latest.price
       from unnest($1::text[]) as feeds(feed_id)
       left join lateral (
         select price
           from oracle_prices
          where feed_id = feeds.feed_id
            and ts <= $2
            and published_at <= $2
          order by ts desc
          limit 1
       ) latest on true`,
    [feedIds, cutoff]
  )
  const pricesByFeed: Record<string, number> = {}
  for (const row of rows) {
    const price = Number(row.price)
    if (row.price != null && Number.isFinite(price) && price > 0)
      pricesByFeed[row.feed_id] = price
  }
  return pricesByFeed
}

const calculateSnapshot = async (
  tx: SupabaseTransaction,
  userIds: string[],
  seasonStart: number
) => {
  // First statement, so it is the snapshot's own instant: events are cut at
  // `applied_ts < asOf` while positions are read as of the snapshot, and the
  // two must agree (see calculateSnapshot in user-contract-metric-periods).
  const asOfRow = await tx.one<{ as_of: string }>(
    'select statement_timestamp() as as_of'
  )
  const asOf = new Date(asOfRow.as_of).getTime()
  if (!Number.isFinite(asOf)) {
    throw new Error('Invalid PERP season snapshot timestamp')
  }

  const profits: PerpSeasonProfit[] = []
  const failures: PerpSeasonProfitFailure[] = []

  const contractsById = keyBy(await loadLeagueContracts(tx), 'id')
  const contractIds = Object.keys(contractsById)
  if (contractIds.length === 0) return { profits, failures }

  const [positions, events] = await Promise.all([
    loadPositions(tx, contractIds, userIds),
    loadSeasonEvents(tx, contractIds, userIds, seasonStart, asOf),
  ])

  // A pair with neither an open position nor an event since the boundary
  // held nothing during the season.
  const targets: Record<string, { userId: string; contractId: string }> = {}
  const positionsByPair: Record<string, PerpPosition[]> = {}
  const eventsByPair: Record<string, PerpEvent[]> = {}
  for (const position of positions) {
    const key = pairKey(position.userId, position.contractId)
    targets[key] = { userId: position.userId, contractId: position.contractId }
    if (!positionsByPair[key]) positionsByPair[key] = []
    positionsByPair[key].push(position)
  }
  for (const event of events) {
    if (event.userId === null) continue
    const key = pairKey(event.userId, event.contractId)
    targets[key] = { userId: event.userId, contractId: event.contractId }
    if (!eventsByPair[key]) eventsByPair[key] = []
    eventsByPair[key].push(event)
  }

  const boundaryPrices = await loadBoundaryPrices(
    tx,
    uniq(
      Object.values(targets).map(
        ({ contractId }) => contractsById[contractId].oracleFeedId
      )
    ),
    seasonStart
  )

  for (const [key, { userId, contractId }] of Object.entries(targets)) {
    const contract = contractsById[contractId]
    const reasons: string[] = []
    const result = calculatePerpProfitSince({
      currentPositions: positionsByPair[key] ?? [],
      events: eventsByPair[key] ?? [],
      currentPrice: contract.oraclePrice,
      since: {
        cutoff: seasonStart,
        price: boundaryPrices[contract.oracleFeedId],
      },
      failures: reasons,
    })
    if (result) profits.push({ userId, contractId, profit: result.profit })
    else failures.push({ userId, contractId, reasons })
  }

  return { profits, failures }
}

/**
 * PERP profit and loss since `seasonStart` for each (user, league-eligible
 * PERP) pair the users held during the season, from one repeatable snapshot.
 * A pair whose history cannot be replayed is returned in `failures` rather
 * than guessed at.
 */
export const calculatePerpSeasonProfits = async (
  pg: SupabaseDirectClient,
  args: { userIds: string[]; seasonStart: number }
): Promise<{
  profits: PerpSeasonProfit[]
  failures: PerpSeasonProfitFailure[]
}> => {
  const { userIds, seasonStart } = args
  if (userIds.length === 0) return { profits: [], failures: [] }
  // Inside the season rollover's own transaction pg-promise nests this as a
  // savepoint and drops the mode, so that one run reads through the rollover
  // (on a season minutes old); every scheduled run gets a clean snapshot.
  return pg.tx({ mode: READ_ONLY_REPEATABLE_MODE }, (tx) =>
    calculateSnapshot(tx, userIds, seasonStart)
  )
}
