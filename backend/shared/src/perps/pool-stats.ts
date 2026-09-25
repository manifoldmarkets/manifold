import type { PerpContract } from 'common/contract'
import type { Row } from 'common/supabase/utils'
import { getPerpOpenInterest, getPositionValue } from 'common/perps/amm'
import type {
  PerpCashFlowTotals,
  PerpPoolStats,
  PerpPoolStatsPoint,
} from 'common/perps/pool-accounting'
import { groupBy, sumBy } from 'lodash'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
import { READ_ONLY_REPEATABLE_MODE } from 'shared/supabase/init'
import type { SupabaseDirectClientTimeout } from 'shared/supabase/init'
import { rowToPosition } from 'shared/perps/queries'

dayjs.extend(utc)
dayjs.extend(timezone)

type ContractRow = {
  id: string
  slug: string
  question: string
  created_time: string
  resolution_time: string | null
  data: PerpContract
}

type FlowRow = {
  contractId: string
  initialSubsidy: number | string
  addedSubsidy: number | string
  marginIn: number | string
  feesIn: number | string
  traderPayouts: number | string
  residualReturned: number | string
  cashIn: number | string
  cashOut: number | string
}

type SnapshotRow = {
  contractId: string
  date: string
  totalPool: number | string
  markedPositionValue: number | string | null
  source: 'snapshot' | 'backfill'
}

const finite = (value: number | string) => {
  const result = Number(value)
  if (!Number.isFinite(result)) throw new Error('Non-finite PERP stats value')
  return result
}

const emptyFlows = (): PerpCashFlowTotals => ({
  initialSubsidy: 0,
  addedSubsidy: 0,
  marginIn: 0,
  feesIn: 0,
  traderPayouts: 0,
  residualReturned: 0,
  cashIn: 0,
  cashOut: 0,
})

const asFlows = (row: FlowRow | undefined): PerpCashFlowTotals => {
  if (!row) return emptyFlows()
  return {
    initialSubsidy: finite(row.initialSubsidy),
    addedSubsidy: finite(row.addedSubsidy),
    marginIn: finite(row.marginIn),
    feesIn: finite(row.feesIn),
    traderPayouts: finite(row.traderPayouts),
    residualReturned: finite(row.residualReturned),
    cashIn: finite(row.cashIn),
    cashOut: finite(row.cashOut),
  }
}

const addFlows = (
  left: PerpCashFlowTotals,
  right: PerpCashFlowTotals
): PerpCashFlowTotals => ({
  initialSubsidy: left.initialSubsidy + right.initialSubsidy,
  addedSubsidy: left.addedSubsidy + right.addedSubsidy,
  marginIn: left.marginIn + right.marginIn,
  feesIn: left.feesIn + right.feesIn,
  traderPayouts: left.traderPayouts + right.traderPayouts,
  residualReturned: left.residualReturned + right.residualReturned,
  cashIn: left.cashIn + right.cashIn,
  cashOut: left.cashOut + right.cashOut,
})

export const getPerpPoolStats = async (
  pg: SupabaseDirectClientTimeout,
  limitDays: number
): Promise<PerpPoolStats> => {
  const start = dayjs()
    .tz('America/Los_Angeles')
    .subtract(limitDays - 1, 'day')
    .startOf('day')
  const end = dayjs().tz('America/Los_Angeles').startOf('day')
  const startIso = start.toISOString()

  const [contractRows, positionRows, flowRows, dailyRows, trackingRow] =
    await pg.tx({ mode: READ_ONLY_REPEATABLE_MODE }, (tx) =>
      Promise.all([
        tx.manyOrNone<ContractRow>(
          `select id, slug, question, created_time, resolution_time, data
       from contracts
       where outcome_type = 'PERP'
         and visibility = 'public' and deleted = false
       order by created_time`
        ),
        tx.manyOrNone<Row<'contract_perp_positions'>>(
          `select p.*
       from contract_perp_positions p
       join contracts c on c.id = p.contract_id
       where c.outcome_type = 'PERP'
         and c.visibility = 'public' and c.deleted = false`
        ),
        tx.manyOrNone<FlowRow>(
          `with perp_contracts as (
         select id from contracts where outcome_type = 'PERP'
           and visibility = 'public' and deleted = false
       ), cash as (
         select t.to_id as contract_id, t.category, t.amount, 'in' as direction
         from txns t
         join perp_contracts p on p.id = t.to_id
         where t.token = 'M$' and t.to_type = 'CONTRACT'
         union all
         select t.from_id as contract_id, t.category, t.amount, 'out' as direction
         from txns t
         join perp_contracts p on p.id = t.from_id
         where t.token = 'M$' and t.from_type = 'CONTRACT'
       )
       select
         contract_id as "contractId",
         coalesce(sum(amount) filter (
           where direction = 'in' and category = 'CREATE_CONTRACT_ANTE'
         ), 0) as "initialSubsidy",
         coalesce(sum(amount) filter (
           where direction = 'in' and category = 'ADD_SUBSIDY'
         ), 0) as "addedSubsidy",
         coalesce(sum(amount) filter (
           where direction = 'in' and category = 'PERP_OPEN_MARGIN'
         ), 0) as "marginIn",
         coalesce(sum(amount) filter (
           where direction = 'in' and category = 'PERP_TAKER_FEE'
         ), 0) as "feesIn",
         coalesce(sum(amount) filter (
           where direction = 'out' and category = 'PERP_CLOSE_PAYOUT'
         ), 0) as "traderPayouts",
         coalesce(sum(amount) filter (
           where direction = 'out' and category = 'PERP_RESOLVE_RESIDUAL'
         ), 0) as "residualReturned",
         coalesce(sum(amount) filter (where direction = 'in'), 0) as "cashIn",
         coalesce(sum(amount) filter (where direction = 'out'), 0) as "cashOut"
       from cash
       group by contract_id`
        ),
        tx.manyOrNone<SnapshotRow>(
          `select distinct on (s.contract_id, date)
         s.contract_id as "contractId",
         (s.captured_at at time zone 'America/Los_Angeles')::date::text as date,
         s.total_pool as "totalPool",
         s.marked_position_value as "markedPositionValue", s.source
       from contract_perp_hourly_stats s
       join contracts c on c.id = s.contract_id
       where s.hour >= $1 and c.outcome_type = 'PERP'
         and c.visibility = 'public' and c.deleted = false
       order by s.contract_id, date, s.captured_at desc`,
          [startIso]
        ),
        tx.one<{ tracking_start: string | null; last_capture: string | null }>(
          `select min(first_capture) as tracking_start,
          case when count(*) = count(last_capture) then min(last_capture) end as last_capture
        from (
          select c.id, min(s.captured_at) as first_capture,
            max(s.captured_at) filter (where s.source = 'snapshot') as last_capture
          from contracts c left join contract_perp_hourly_stats s on s.contract_id = c.id
          where c.outcome_type = 'PERP' and c.visibility = 'public' and c.deleted = false
          group by c.id
        ) captures`
        ),
      ])
    )

  const positionsByContract = groupBy(
    positionRows.map(rowToPosition),
    'contractId'
  )
  const flowsByContract = new Map(
    flowRows.map((row) => [row.contractId, asFlows(row)])
  )
  const snapshotsByDate = groupBy(dailyRows, 'date')
  const pointsByContract = new Map<string, PerpPoolStatsPoint[]>()
  const sitewidePoints: PerpPoolStatsPoint[] = []

  for (let date = start; !date.isAfter(end, 'day'); date = date.add(1, 'day')) {
    const dateKey = date.format('YYYY-MM-DD')
    const dailyByContract = new Map(
      (snapshotsByDate[dateKey] ?? []).map((snapshot) => [
        snapshot.contractId,
        snapshot,
      ])
    )
    const total: PerpPoolStatsPoint = {
      date: dateKey,
      totalPool: 0,
      houseLiquidity: 0,
      isEstimate: false,
    }
    let complete = true
    let existing = 0
    for (const contract of contractRows) {
      if (dayjs(contract.created_time).isAfter(date.endOf('day'))) continue
      existing++
      const snapshot = dailyByContract.get(contract.id)
      // Resolution returns all residual backing. Zero thereafter is known;
      // an absent observation for a live market is unknown, never carried forward.
      const resolved =
        contract.resolution_time != null &&
        !dayjs(contract.resolution_time).isAfter(date.endOf('day'))
      if (!snapshot && !resolved) {
        complete = false
        continue
      }
      const pool = resolved ? 0 : finite(snapshot!.totalPool)
      const marked = resolved ? 0 : snapshot!.markedPositionValue
      const point: PerpPoolStatsPoint = {
        date: dateKey,
        totalPool: pool,
        houseLiquidity: marked == null ? null : finite(pool - finite(marked)),
        isEstimate: snapshot?.source === 'backfill',
      }
      const points = pointsByContract.get(contract.id) ?? []
      points.push(point)
      pointsByContract.set(contract.id, points)
      total.totalPool = finite(total.totalPool + point.totalPool)
      total.houseLiquidity =
        total.houseLiquidity == null || point.houseLiquidity == null
          ? null
          : finite(total.houseLiquidity + point.houseLiquidity)
      total.isEstimate ||= point.isEstimate
    }
    if (complete && existing > 0) sitewidePoints.push(total)
  }

  const contracts = contractRows
    .map((row) => {
      const positions = positionsByContract[row.id] ?? []
      const openInterest = getPerpOpenInterest(positions)
      const reserveFor = (direction: 'long' | 'short') =>
        sumBy(
          positions.filter((position) => position.direction === direction),
          (position) =>
            Math.min(
              position.costBasis,
              getPositionValue(position, row.data.oraclePrice)
            )
        )
      return {
        id: row.id,
        slug: row.slug,
        question: row.question,
        creatorUsername: row.data.creatorUsername,
        isResolved: row.resolution_time != null,
        solvencyHalted: row.data.solvencyHaltTime != null,
        poolLong: row.data.poolLong,
        poolShort: row.data.poolShort,
        openInterestLong: openInterest.long,
        openInterestShort: openInterest.short,
        reservedMarginLong: reserveFor('long'),
        reservedMarginShort: reserveFor('short'),
        markedPositionValue: sumBy(positions, (position) =>
          getPositionValue(position, row.data.oraclePrice)
        ),
        flows: flowsByContract.get(row.id) ?? emptyFlows(),
        points: pointsByContract.get(row.id) ?? [],
      }
    })
    .sort(
      (a, b) =>
        Number(a.isResolved) - Number(b.isResolved) ||
        b.poolLong + b.poolShort - (a.poolLong + a.poolShort)
    )

  const trackingStartTime =
    trackingRow.tracking_start == null
      ? null
      : new Date(trackingRow.tracking_start).getTime()
  const trackingStartDate =
    trackingStartTime == null
      ? null
      : dayjs(trackingStartTime).tz('America/Los_Angeles').format('YYYY-MM-DD')

  return {
    trackingStartTime,
    lastCaptureTime:
      trackingRow.last_capture == null
        ? null
        : new Date(trackingRow.last_capture).getTime(),
    points:
      trackingStartDate == null
        ? []
        : sitewidePoints.filter((point) => point.date >= trackingStartDate),
    flows: contracts.reduce(
      (total, contract) => addFlows(total, contract.flows),
      emptyFlows()
    ),
    contracts,
  }
}
