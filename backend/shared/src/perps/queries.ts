// SQL-building helpers for the perp engine. These all return query strings
// suitable for composition into `pgTrans.multi`.

import { Row, Tables } from 'common/supabase/utils'
import {
  PerpEvent,
  PerpFundingEvent,
  PerpPosition,
} from 'common/perps/position'
import { PerpAccounting } from 'common/perps/accounting-mode'
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

/**
 * Present the contract's accounting epoch to the database guard for the rest
 * of the transaction. Protected contracts refuse every position/event write
 * whose transaction did not run this with the current epoch — including
 * writes from a binary that predates protected accounting, which is the point.
 */
export const presentAccountingEpochQuery = (epoch: number) =>
  pgp.as.format(`select set_config('perp.accounting_epoch', $1, true)`, [
    String(epoch),
  ])

/**
 * Required alongside any change to a contract's perpAccountingMode/Epoch:
 * the contracts trigger refuses the flip without it.
 */
export const presentAccountingTransitionQuery = () =>
  `select set_config('perp.accounting_transition', 'true', true)`

/**
 * Row for persistence. Under protected accounting the reserve basis must be
 * explicit — a row without one cannot be written, by construction, rather
 * than silently mirrored. Under legacy/shadow the mirror b = c is written
 * (and re-enforced by the database guard).
 */
export const positionToRow = (
  p: PerpPosition,
  accounting: PerpAccounting
): PositionRow => {
  if (accounting.mode === 'protected' && p.reserveBasis === undefined)
    throw new Error(
      `protected position ${p.userId}:${p.direction} has no reserve basis`
    )
  return {
    contract_id: p.contractId,
    user_id: p.userId,
    direction: p.direction,
    size: p.size,
    cost_basis: p.costBasis,
    reserve_basis:
      accounting.mode === 'protected'
        ? p.reserveBasis ?? p.costBasis
        : p.costBasis,
    accounting_epoch: accounting.epoch,
    original_cost_basis: p.originalCostBasis,
    taker_fee_cost_basis: p.takerFeeCostBasis ?? 0,
    entry_price: p.entryPrice,
    leverage: p.leverage,
    liquidation_price: p.liquidationPrice,
    opened_time: new Date(p.openedTime).toISOString(),
    updated_time: new Date(p.updatedTime).toISOString(),
  }
}

/**
 * Read a row under the contract's accounting mode. Legacy/shadow rows read
 * b = c whatever the column holds, so one contract never mixes semantics;
 * protected rows must carry an explicit b (fail closed otherwise).
 */
export const rowToPosition = (
  r: PositionRow,
  accounting?: Pick<PerpAccounting, 'mode'>
): PerpPosition => {
  const costBasis = Number(r.cost_basis)
  const mode = accounting?.mode ?? 'legacy'
  let reserveBasis: number
  if (mode === 'protected') {
    if (r.reserve_basis == null)
      throw new Error(
        `protected position ${r.user_id}:${r.direction} on ${r.contract_id} has no reserve basis`
      )
    reserveBasis = Number(r.reserve_basis)
  } else {
    reserveBasis = costBasis
  }
  return {
    contractId: r.contract_id,
    userId: r.user_id,
    direction: r.direction as 'long' | 'short',
    size: Number(r.size),
    costBasis,
    reserveBasis,
    originalCostBasis: Number(r.original_cost_basis),
    takerFeeCostBasis: Number(r.taker_fee_cost_basis),
    entryPrice: Number(r.entry_price),
    leverage: Number(r.leverage),
    liquidationPrice: Number(r.liquidation_price),
    openedTime: new Date(r.opened_time).getTime(),
    updatedTime: new Date(r.updated_time).getTime(),
  }
}

export const upsertPositionsQuery = (
  positions: PerpPosition[],
  accounting: PerpAccounting
) => {
  if (!positions.length) return 'select 1 where false'
  const rows = positions.map((p) => positionToRow(p, accounting))
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

/**
 * Δb on the persisted event. Protected writers must state it (a protected
 * event without one is a bug, not a mirror case); legacy/shadow mirror the
 * cost-basis delta, which the database guard re-applies anyway.
 */
const eventReserveBasisDelta = (e: PerpEvent, accounting: PerpAccounting) => {
  if (accounting.mode === 'protected') {
    if (e.reserveBasisDelta === undefined)
      throw new Error(
        `protected ${e.eventType} event for ${
          e.userId ?? 'pool'
        } has no reserve basis delta`
      )
    if (!Number.isFinite(e.reserveBasisDelta))
      throw new Error(`${e.eventType} event reserve basis delta must be finite`)
    return e.reserveBasisDelta
  }
  return e.costBasisDelta
}

export const insertPerpEventsQuery = (
  events: PerpEvent[],
  accounting: PerpAccounting
) => {
  if (!events.length) return 'select 1 where false'
  const rows = events.map((e) => ({
    contract_id: e.contractId,
    user_id: e.userId,
    event_type: e.eventType,
    ts: new Date(e.ts).toISOString(),
    oracle_price: e.oraclePrice,
    size_delta: e.sizeDelta,
    cost_basis_delta: e.costBasisDelta,
    reserve_basis_delta: eventReserveBasisDelta(e, accounting),
    original_cost_basis_delta: e.originalCostBasisDelta,
    accounting_mode: accounting.mode,
    accounting_epoch: accounting.epoch,
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

export const insertFundingEventQuery = (
  fe: PerpFundingEvent,
  accounting: PerpAccounting
) => {
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
    accounting_epoch: accounting.epoch,
  }
  return bulkInsertQuery('contract_perp_funding_events', [row], false)
}

export type PerpAccountingEpochRecord = {
  contractId: string
  epoch: number
  accountingMode: PerpAccounting['mode']
  previousMode: PerpAccounting['mode']
  oraclePrice: number | null
  oraclePriceTime: number | null
  poolLong: number
  poolShort: number
  topUpLong: number
  topUpShort: number
  reducedAnyBasis: boolean
  positionSnapshot: {
    userId: string
    direction: 'long' | 'short'
    size: number
    costBasis: number
    reserveBasisBefore: number
    reserveBasisAfter: number
  }[]
  data?: Record<string, unknown>
}

/** The immutable activation record. Written once per accounting transition. */
export const insertAccountingEpochQuery = (
  record: PerpAccountingEpochRecord
) => {
  const row: Tables['contract_perp_accounting_epochs']['Insert'] = {
    contract_id: record.contractId,
    epoch: record.epoch,
    accounting_mode: record.accountingMode,
    previous_mode: record.previousMode,
    oracle_price: record.oraclePrice,
    oracle_price_time:
      record.oraclePriceTime == null
        ? null
        : new Date(record.oraclePriceTime).toISOString(),
    pool_long: record.poolLong,
    pool_short: record.poolShort,
    top_up_long: record.topUpLong,
    top_up_short: record.topUpShort,
    reduced_any_basis: record.reducedAnyBasis,
    position_snapshot: record.positionSnapshot as any,
    data: (record.data ?? null) as any,
  }
  return bulkInsertQuery('contract_perp_accounting_epochs', [row], false)
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
