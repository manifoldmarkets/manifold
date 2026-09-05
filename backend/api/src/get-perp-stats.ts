import { APIHandler } from 'api/helpers/endpoint'
import type { PerpContract } from 'common/contract'
import { getPerpOpenInterest, getPositionValue } from 'common/perps/amm'
import type {
  PerpCashFlowTotals,
  PerpPoolStatsPoint,
} from 'common/perps/pool-accounting'
import { groupBy, sumBy } from 'lodash'
import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
import {
  createSupabaseDirectClient,
  READ_ONLY_REPEATABLE_MODE,
} from 'shared/supabase/init'
import { rowToPosition } from 'shared/perps/queries'

dayjs.extend(utc)
dayjs.extend(timezone)

type ContractRow = {
  id: string
  slug: string
  question: string
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

type DeltaRow = {
  contractId: string
  date?: string
  poolLongDelta: number | string
  poolShortDelta: number | string
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
    initialSubsidy: Number(row.initialSubsidy),
    addedSubsidy: Number(row.addedSubsidy),
    marginIn: Number(row.marginIn),
    feesIn: Number(row.feesIn),
    traderPayouts: Number(row.traderPayouts),
    residualReturned: Number(row.residualReturned),
    cashIn: Number(row.cashIn),
    cashOut: Number(row.cashOut),
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

export const getPerpStats: APIHandler<'get-perp-stats'> = async (props) => {
  const { limitDays } = props
  const start = dayjs()
    .tz('America/Los_Angeles')
    .subtract(limitDays - 1, 'day')
    .startOf('day')
  const end = dayjs().tz('America/Los_Angeles').startOf('day')
  const startIso = start.toISOString()
  const pg = createSupabaseDirectClient()

  const [
    contractRows,
    positionRows,
    flowRows,
    openingRows,
    dailyRows,
    trackingRow,
  ] = await pg.tx({ mode: READ_ONLY_REPEATABLE_MODE }, (tx) =>
    Promise.all([
      tx.manyOrNone<ContractRow>(
        `select id, slug, question, resolution_time, data
       from contracts
       where outcome_type = 'PERP'
       order by created_time`
      ),
      tx.manyOrNone(
        `select p.*
       from contract_perp_positions p
       join contracts c on c.id = p.contract_id
       where c.outcome_type = 'PERP'`
      ),
      tx.manyOrNone<FlowRow>(
        `with perp_contracts as (
         select id from contracts where outcome_type = 'PERP'
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
      tx.manyOrNone<DeltaRow>(
        `select distinct on (contract_id)
         contract_id as "contractId",
         pool_long_after as "poolLongDelta",
         pool_short_after as "poolShortDelta"
       from contract_perp_pool_events
       where applied_ts < $1
       order by contract_id, applied_ts desc, id desc`,
        [startIso]
      ),
      tx.manyOrNone<DeltaRow>(
        `select
         contract_id as "contractId",
         (applied_ts at time zone 'America/Los_Angeles')::date::text as date,
         sum(case
           when event_type = 'baseline' then pool_long_after
           else pool_long_after - pool_long_before
         end) as "poolLongDelta",
         sum(case
           when event_type = 'baseline' then pool_short_after
           else pool_short_after - pool_short_before
         end) as "poolShortDelta"
       from contract_perp_pool_events
       where applied_ts >= $1
       group by contract_id, date
       order by date, contract_id`,
        [startIso]
      ),
      tx.one<{ tracking_start: string | null }>(
        `select min(applied_ts) as tracking_start
       from contract_perp_pool_events`
      ),
    ])
  )

  const positionsByContract = groupBy(
    positionRows.map((row) => rowToPosition(row as any)),
    'contractId'
  )
  const flowsByContract = new Map(
    flowRows.map((row) => [row.contractId, asFlows(row)])
  )
  const stateByContract = new Map(
    openingRows.map((row) => [
      row.contractId,
      {
        poolLong: Number(row.poolLongDelta),
        poolShort: Number(row.poolShortDelta),
      },
    ])
  )
  const deltasByDate = groupBy(dailyRows, 'date')
  const pointsByContract = new Map<string, PerpPoolStatsPoint[]>()
  const sitewidePoints: PerpPoolStatsPoint[] = []

  for (let date = start; !date.isAfter(end, 'day'); date = date.add(1, 'day')) {
    const dateKey = date.format('YYYY-MM-DD')
    for (const delta of deltasByDate[dateKey] ?? []) {
      const state = stateByContract.get(delta.contractId) ?? {
        poolLong: 0,
        poolShort: 0,
      }
      state.poolLong += Number(delta.poolLongDelta)
      state.poolShort += Number(delta.poolShortDelta)
      stateByContract.set(delta.contractId, state)
    }

    let sitewideLong = 0
    let sitewideShort = 0
    for (const contract of contractRows) {
      const state = stateByContract.get(contract.id)
      if (!state) continue
      const point = { date: dateKey, ...state }
      const points = pointsByContract.get(contract.id) ?? []
      points.push(point)
      pointsByContract.set(contract.id, points)
      sitewideLong += state.poolLong
      sitewideShort += state.poolShort
    }
    sitewidePoints.push({
      date: dateKey,
      poolLong: sitewideLong,
      poolShort: sitewideShort,
    })
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
