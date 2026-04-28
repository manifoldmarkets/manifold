// Perp position & event types (ManiPerp AMM).
// Stored in `contract_perp_positions` (authoritative state) and
// `contract_perp_events` (event log).

export type PerpDirection = 'long' | 'short'

export type PerpPosition = {
  userId: string
  contractId: string
  direction: PerpDirection
  /** q — notional size */
  size: number
  /** c — current cost basis (scaled by funding; eq. 8/9). */
  costBasis: number
  /** original margin the user put in (never scaled). Used for user-facing PnL. */
  originalCostBasis: number
  /** P_e — entry price; size-weighted avg on add. */
  entryPrice: number
  /** ℓ = q/c (recomputed after any mutation). */
  leverage: number
  /** P_liq — cached for fast scans. */
  liquidationPrice: number
  openedTime: number
  updatedTime: number
}

export type PerpEventType =
  | 'open'
  | 'add'
  | 'close'
  | 'liquidation'
  | 'adl'
  | 'funding'

export type PerpEvent = {
  id?: number
  contractId: string
  userId: string | null // null for pool-level events (funding summary)
  eventType: PerpEventType
  ts: number
  oraclePrice: number
  sizeDelta: number
  costBasisDelta: number
  originalCostBasisDelta: number
  direction: PerpDirection | null
  leverage: number | null
  data?: Record<string, unknown>
}

export type PerpFundingEvent = {
  contractId: string
  ts: number
  oraclePrice: number
  poolLongBefore: number
  poolLongAfter: number
  poolShortBefore: number
  poolShortAfter: number
  fundingRate: number
  numLiquidations: number
  adlFactorLong: number
  adlFactorShort: number
}
