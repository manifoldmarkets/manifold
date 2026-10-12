// SQL-building helpers for the perp engine. These all return query strings
// suitable for composition into `pgTrans.multi`.

import { Row, Tables } from 'common/supabase/utils'
import {
  PerpEvent,
  PerpFundingEvent,
  PerpPosition,
} from 'common/perps/position'
import {
  bulkInsertQuery,
  bulkUpsertQuery,
  updateDataQuery,
} from 'shared/supabase/utils'
import { pgp } from 'shared/supabase/init'

export const advisoryLockQuery = (contractId: string) =>
  pgp.as.format(`select pg_advisory_xact_lock(hashtext($1))`, [contractId])

export const selectLatestOraclePriceQuery = (feedId: string) =>
  pgp.as.format(
    `select ts, price, source_ts from oracle_prices where feed_id = $1
     order by ts desc limit 1`,
    [feedId]
  )

export const selectContractForUpdateQuery = (contractId: string) =>
  pgp.as.format(`select data, token from contracts where id = $1 for update`, [
    contractId,
  ])

export const selectPositionsForUpdateQuery = (contractId: string) =>
  pgp.as.format(
    `select * from contract_perp_positions where contract_id = $1 for update`,
    [contractId]
  )

export const selectUserPositionForUpdateQuery = (
  contractId: string,
  userId: string
) =>
  pgp.as.format(
    `select * from contract_perp_positions
     where contract_id = $1 and user_id = $2 for update`,
    [contractId, userId]
  )

type PositionRow = Row<'contract_perp_positions'>

export const positionToRow = (p: PerpPosition): PositionRow => ({
  contract_id: p.contractId,
  user_id: p.userId,
  direction: p.direction,
  size: p.size,
  cost_basis: p.costBasis,
  original_cost_basis: p.originalCostBasis,
  taker_fee_cost_basis: p.takerFeeCostBasis ?? 0,
  entry_price: p.entryPrice,
  leverage: p.leverage,
  liquidation_price: p.liquidationPrice,
  opened_time: new Date(p.openedTime).toISOString(),
  updated_time: new Date(p.updatedTime).toISOString(),
})

export const rowToPosition = (r: PositionRow): PerpPosition => ({
  contractId: r.contract_id,
  userId: r.user_id,
  direction: r.direction as 'long' | 'short',
  size: Number(r.size),
  costBasis: Number(r.cost_basis),
  originalCostBasis: Number(r.original_cost_basis),
  takerFeeCostBasis: Number(r.taker_fee_cost_basis),
  entryPrice: Number(r.entry_price),
  leverage: Number(r.leverage),
  liquidationPrice: Number(r.liquidation_price),
  openedTime: new Date(r.opened_time).getTime(),
  updatedTime: new Date(r.updated_time).getTime(),
})

/** The `contract_perp_events` columns the accounting replays read. */
export type PerpEventRow = {
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

export const rowToPerpEvent = (row: PerpEventRow): PerpEvent => ({
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

export const upsertPositionsQuery = (positions: PerpPosition[]) => {
  if (!positions.length) return 'select 1 where false'
  const rows = positions.map(positionToRow)
  return bulkUpsertQuery(
    'contract_perp_positions',
    ['contract_id', 'user_id', 'direction'],
    rows as Tables['contract_perp_positions']['Insert'][]
  )
}

export const deletePositionsQuery = (
  contractId: string,
  userDirections: { userId: string; direction: 'long' | 'short' }[]
) => {
  if (!userDirections.length) return 'select 1 where false'
  const values = userDirections
    .map((ud) =>
      pgp.as.format('($1, $2, $3)', [contractId, ud.userId, ud.direction])
    )
    .join(',')
  return `delete from contract_perp_positions
    where (contract_id, user_id, direction) in (${values})`
}

export const deleteContractPositionsQuery = (contractId: string) =>
  pgp.as.format(`delete from contract_perp_positions where contract_id = $1`, [
    contractId,
  ])

export const insertPerpEventsQuery = (events: PerpEvent[]) => {
  if (!events.length) return 'select 1 where false'
  const rows = events.map((e) => ({
    contract_id: e.contractId,
    user_id: e.userId,
    event_type: e.eventType,
    ts: new Date(e.ts).toISOString(),
    oracle_price: e.oraclePrice,
    size_delta: e.sizeDelta,
    cost_basis_delta: e.costBasisDelta,
    original_cost_basis_delta: e.originalCostBasisDelta,
    direction: e.direction,
    leverage: e.leverage,
    data: (e.data ?? null) as any,
  }))
  return bulkInsertQuery(
    'contract_perp_events',
    rows as Tables['contract_perp_events']['Insert'][],
    false
  )
}

export const insertFundingEventQuery = (fe: PerpFundingEvent) => {
  const row: Tables['contract_perp_funding_events']['Insert'] = {
    contract_id: fe.contractId,
    ts: new Date(fe.ts).toISOString(),
    oracle_price: fe.oraclePrice,
    pool_long_before: fe.poolLongBefore,
    pool_long_after: fe.poolLongAfter,
    pool_short_before: fe.poolShortBefore,
    pool_short_after: fe.poolShortAfter,
    funding_rate: fe.fundingRate,
    num_liquidations: fe.numLiquidations,
    adl_factor_long: fe.adlFactorLong,
    adl_factor_short: fe.adlFactorShort,
  }
  return bulkInsertQuery('contract_perp_funding_events', [row], false)
}

// Merges fields into `contracts.data` jsonb. Works for any keys and is
// idempotent against concurrent perp writers because we hold the advisory
// lock + select for update.
export const mergeContractDataQuery = (
  contractId: string,
  patch: Record<string, unknown>
) =>
  updateDataQuery('contracts', 'id', {
    id: contractId,
    ...patch,
  } as any)
