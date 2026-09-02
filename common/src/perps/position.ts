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
  /**
   * b — protected (reserve) basis: the part of the position's value still
   * backed by its own side pool. Always `0 <= b <= c`. Realized opposing
   * payouts that consumed this position's paper loss reduce it (see
   * `common/perps/protected-basis.ts`); it never changes the position's
   * value, notional, entry price, leverage or liquidation price. `undefined`
   * reads as `costBasis` — the legacy mirror — so rows written before the
   * column existed, and every legacy/shadow contract, keep #4030 semantics.
   */
  reserveBasis?: number
  /** original margin the user put in (never scaled). Used for user-facing PnL. */
  originalCostBasis: number
  /** Cumulative taker fees paid while opening/adding to this live position.
   * Kept separate from margin so leverage and liquidation math stay unchanged. */
  takerFeeCostBasis?: number
  /** P_e — entry price; units-weighted (harmonic) mean on add, so that
   * merging tranches conserves equity. See `mergedEntryPrice`. */
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
  /**
   * Protected accounting only: a realized opposing payout consumed part of
   * this position's paper loss, reducing its protected basis. Not a cash
   * flow — size, cost basis and value are unchanged; only `reserveBasisDelta`
   * is nonzero. Never counted as realized PnL.
   */
  | 'basis-settlement'
  /**
   * Pool-level (null user) immutable record of an accounting-mode transition
   * (legacy -> shadow -> protected). Written once per epoch alongside the
   * `contract_perp_accounting_epochs` row.
   */
  | 'accounting-activation'

export type PerpEvent = {
  id?: number
  contractId: string
  userId: string | null // null for pool-level events (funding summary)
  eventType: PerpEventType
  /** Accounting application time. Persisted events source this from the
   * database's `applied_ts`; new in-memory events use the transaction wall
   * clock until insertion. `ts` may be an older oracle observation time. */
  appliedTime: number
  /** Effective/oracle observation time shown in market history. */
  ts: number
  oraclePrice: number
  sizeDelta: number
  costBasisDelta: number
  originalCostBasisDelta: number
  /**
   * Change in protected basis `b`. Protected-mode writers state it on every
   * event; in legacy/shadow it is mirrored from `costBasisDelta` at the write
   * boundary (undefined here means "mirror"). Events persisted before the
   * column existed read back as 0 and carry no protected-basis history.
   */
  reserveBasisDelta?: number
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
