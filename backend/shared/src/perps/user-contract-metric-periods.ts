import { PerpContract } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import {
  calculatePerpMetricPeriods,
  PERP_METRIC_PERIOD_MS,
  PERP_METRIC_PERIODS,
  PerpMetricPeriod,
} from 'common/perps/metric-periods'
import { PerpEvent, PerpPosition } from 'common/perps/position'
import { Row } from 'common/supabase/utils'
import { filterDefined } from 'common/util/array'
import { keyBy, uniq, uniqBy } from 'lodash'
import {
  READ_ONLY_REPEATABLE_MODE,
  SupabaseDirectClientTimeout,
  SupabaseTransaction,
} from 'shared/supabase/init'
import { log } from 'shared/utils'
import { rowToPosition } from './queries'

type PerpEventRow = {
  id: number | string
  contract_id: string
  user_id: string
  event_type: string
  applied_ts: string
  ts: string
  oracle_price: number | string | null
  size_delta: number | string
  cost_basis_delta: number | string
  original_cost_basis_delta: number | string
  direction: string | null
  leverage: number | string | null
  data: Record<string, unknown> | null
}

type CutoffPriceRow = {
  period: string
  feed_id: string
  price: number | string | null
}

const metricKey = (userId: string, contractId: string) =>
  `${userId}\u0000${contractId}`

const isPerpMetricPeriod = (period: string): period is PerpMetricPeriod =>
  PERP_METRIC_PERIODS.includes(period as PerpMetricPeriod)

const loadMetricsAndContracts = async (
  tx: SupabaseTransaction,
  userIds: string[],
  contractIds: string[]
) => {
  const [metricRows, contractRows] = await Promise.all([
    tx.manyOrNone<{
      id: number
      data: ContractMetric
      margin_loan: number | string | null
      loan: number | string | null
    }>(
      `with targets(user_id, contract_id) as (
         select * from unnest($1::text[], $2::text[])
       )
       select ucm.id, ucm.data, ucm.margin_loan, ucm.loan
         from user_contract_metrics ucm
         join targets t using (user_id, contract_id)
         join contracts c on c.id = ucm.contract_id
        where ucm.answer_id is null
          and c.mechanism = 'perp'`,
      [userIds, contractIds]
    ),
    tx.manyOrNone<{ id: string; data: PerpContract }>(
      `select id, data
         from contracts
        where id = any($1)
          and mechanism = 'perp'`,
      [contractIds]
    ),
  ])

  return {
    metrics: metricRows.map(
      (row) =>
        ({
          ...row.data,
          id: row.id,
          loan: Number(row.loan ?? row.data.loan ?? 0),
          marginLoan: Number(row.margin_loan ?? row.data.marginLoan ?? 0),
        } as ContractMetric)
    ),
    contractsById: keyBy(
      contractRows.map((row) => row.data),
      (contract) => contract.id
    ),
  }
}

const loadCurrentPositions = async (
  tx: SupabaseTransaction,
  userIds: string[],
  contractIds: string[]
) => {
  const rows = await tx.manyOrNone<Row<'contract_perp_positions'>>(
    `with targets(user_id, contract_id) as (
       select * from unnest($1::text[], $2::text[])
     )
     select p.*
       from contract_perp_positions p
       join targets t using (user_id, contract_id)`,
    [userIds, contractIds]
  )
  const positionsByMetric: Record<string, PerpPosition[]> = {}
  for (const row of rows) {
    const position = rowToPosition(row)
    const key = metricKey(position.userId, position.contractId)
    if (!positionsByMetric[key]) positionsByMetric[key] = []
    positionsByMetric[key].push(position)
  }
  return positionsByMetric
}

const loadRecentEvents = async (
  tx: SupabaseTransaction,
  userIds: string[],
  contractIds: string[],
  monthCutoff: number,
  asOf: number
) => {
  const rows = await tx.manyOrNone<PerpEventRow>(
    `with targets(user_id, contract_id) as (
       select * from unnest($1::text[], $2::text[])
     )
     select e.id, e.contract_id, e.user_id, e.event_type, e.applied_ts,
            e.ts, e.oracle_price, e.size_delta, e.cost_basis_delta,
            e.original_cost_basis_delta, e.direction, e.leverage, e.data
       from contract_perp_events e
       join targets t using (user_id, contract_id)
      where e.applied_ts >= $3
        and e.applied_ts < $4
      order by e.id desc`,
    [
      userIds,
      contractIds,
      new Date(monthCutoff).toISOString(),
      new Date(asOf).toISOString(),
    ]
  )

  const eventsByMetric: Record<string, PerpEvent[]> = {}
  for (const row of rows) {
    const key = metricKey(row.user_id, row.contract_id)
    if (!eventsByMetric[key]) eventsByMetric[key] = []
    eventsByMetric[key].push({
      id: Number(row.id),
      contractId: row.contract_id,
      userId: row.user_id,
      eventType: row.event_type as PerpEvent['eventType'],
      appliedTime: new Date(row.applied_ts).getTime(),
      ts: new Date(row.ts).getTime(),
      oraclePrice: Number(row.oracle_price ?? 0),
      sizeDelta: Number(row.size_delta),
      costBasisDelta: Number(row.cost_basis_delta),
      originalCostBasisDelta: Number(row.original_cost_basis_delta),
      direction: row.direction as PerpEvent['direction'],
      leverage: row.leverage == null ? null : Number(row.leverage),
      data: row.data ?? undefined,
    })
  }
  return eventsByMetric
}

const loadCutoffPrices = async (
  tx: SupabaseTransaction,
  feedIds: string[],
  asOf: number
) => {
  if (feedIds.length === 0) {
    return {} as Record<string, Partial<Record<PerpMetricPeriod, number>>>
  }

  const cutoffIso = Object.fromEntries(
    PERP_METRIC_PERIODS.map((period) => [
      period,
      new Date(asOf - PERP_METRIC_PERIOD_MS[period]).toISOString(),
    ])
  ) as Record<PerpMetricPeriod, string>
  // Boundary valuation deliberately uses the newest feed-effective point that
  // Manifold had published by the cutoff. This is an index-mark convention:
  // oracle fan-out is not atomic, so it can briefly differ from the cached
  // executable price on one contract. Reconstructing that executable price
  // would require a separate per-contract oracle-application history.
  const rows = await tx.manyOrNone<CutoffPriceRow>(
    `with periods(period, cutoff) as (
       values
         ('day'::text, $2::timestamptz),
         ('week'::text, $3::timestamptz),
         ('month'::text, $4::timestamptz)
     ),
     feeds as (
       select unnest($1::text[]) as feed_id
     )
     select periods.period, feeds.feed_id, latest.price
       from periods
       cross join feeds
       left join lateral (
         select price
           from oracle_prices
          where feed_id = feeds.feed_id
            and published_at <= periods.cutoff
          order by ts desc
          limit 1
       ) latest on true`,
    [feedIds, cutoffIso.day, cutoffIso.week, cutoffIso.month]
  )

  const pricesByFeed: Record<
    string,
    Partial<Record<PerpMetricPeriod, number>>
  > = {}
  for (const row of rows) {
    if (!isPerpMetricPeriod(row.period) || row.price == null) continue
    const price = Number(row.price)
    if (!Number.isFinite(price) || price <= 0) continue
    if (!pricesByFeed[row.feed_id]) pricesByFeed[row.feed_id] = {}
    pricesByFeed[row.feed_id][row.period] = price
  }
  return pricesByFeed
}

const calculateSnapshot = async (
  tx: SupabaseTransaction,
  targets: { userId: string; contractId: string }[]
) => {
  // statement_timestamp(), NOT transaction_timestamp(). This is the first
  // statement in the REPEATABLE READ transaction, so it is what acquires the
  // snapshot, and its statement timestamp is the instant that snapshot was
  // taken. transaction_timestamp() returns when BEGIN ran — a full round trip
  // earlier — and events are filtered by `applied_ts < asOf` while positions
  // are not. An engine transaction committing inside that gap was therefore
  // visible as a POSITION while its EVENTS were excluded, so a seconds-old
  // position was reconstructed as if held for the whole period (and a close
  // landing in the window zeroed the day's realized P&L). Both healed on the
  // next run, but get-daily-changed-metrics-and-contracts serves this on
  // demand right after a trade.
  const asOfRow = await tx.one<{ as_of: string }>(
    'select statement_timestamp() as as_of'
  )
  const asOf = new Date(asOfRow.as_of).getTime()
  if (!Number.isFinite(asOf)) {
    throw new Error('Invalid PERP metric snapshot timestamp')
  }

  const userIds = targets.map((target) => target.userId)
  const contractIds = targets.map((target) => target.contractId)
  const { metrics, contractsById } = await loadMetricsAndContracts(
    tx,
    userIds,
    contractIds
  )
  const relevantMetrics = metrics.filter(
    (metric) => contractsById[metric.contractId] !== undefined
  )
  if (relevantMetrics.length === 0) return []

  const metricUserIds = relevantMetrics.map((metric) => metric.userId)
  const metricContractIds = relevantMetrics.map((metric) => metric.contractId)
  const feedIds = uniq(
    metricContractIds.map(
      (contractId) => contractsById[contractId].oracleFeedId
    )
  )
  const monthCutoff = asOf - PERP_METRIC_PERIOD_MS.month
  const [positionsByMetric, eventsByMetric, pricesByFeed] = await Promise.all([
    loadCurrentPositions(tx, metricUserIds, metricContractIds),
    loadRecentEvents(tx, metricUserIds, metricContractIds, monthCutoff, asOf),
    loadCutoffPrices(tx, feedIds, asOf),
  ])

  return filterDefined(
    relevantMetrics.map((metric) => {
      const contract = contractsById[metric.contractId]
      const key = metricKey(metric.userId, metric.contractId)
      const failures: string[] = []
      const calculation = calculatePerpMetricPeriods({
        failures,
        currentPositions: positionsByMetric[key] ?? [],
        events: eventsByMetric[key] ?? [],
        currentPrice: contract.oraclePrice,
        periods: {
          day: {
            cutoff: asOf - PERP_METRIC_PERIOD_MS.day,
            price: pricesByFeed[contract.oracleFeedId]?.day,
          },
          week: {
            cutoff: asOf - PERP_METRIC_PERIOD_MS.week,
            price: pricesByFeed[contract.oracleFeedId]?.week,
          },
          month: {
            cutoff: asOf - PERP_METRIC_PERIOD_MS.month,
            price: pricesByFeed[contract.oracleFeedId]?.month,
          },
        },
      })
      if (!calculation) {
        // Day/week/month are written together or not at all, so one bad
        // period suppresses all three and leaves the previous `from` block
        // in place. Name the period and the reason, otherwise this is an
        // unactionable nightly error line.
        log.error(
          `Could not calculate PERP periods for user ${
            metric.userId
          }, contract ${metric.contractId}${
            failures.length ? ` — ${failures.join('; ')}` : ''
          }`
        )
        return undefined
      }
      return { ...metric, from: calculation.from }
    })
  )
}

/**
 * Read all PERP accounting inputs from one repeatable snapshot. The engine
 * remains the sole writer of current/lifetime fields; callers persist only
 * the returned `from` block.
 */
export const calculatePerpPeriodMetricUpdates = async (args: {
  pg: SupabaseDirectClientTimeout
  targets: { userId: string; contractId: string }[]
}) => {
  const { pg } = args
  const targets = uniqBy(
    args.targets,
    (target) => `${target.userId}\u0000${target.contractId}`
  )
  if (targets.length === 0) return []
  return pg.tx({ mode: READ_ONLY_REPEATABLE_MODE }, (tx) =>
    calculateSnapshot(tx, targets)
  )
}
