import { PerpPool } from './amm'
import { isPerpEscrowBalanced } from './escrow'

export const PERP_POOL_EVENT_TYPES = [
  'baseline',
  'create',
  'open',
  'add',
  'flip',
  'close',
  'subsidy',
  'oracle',
  'funding',
  'resolve',
] as const

export type PerpPoolEventType = (typeof PERP_POOL_EVENT_TYPES)[number]

/**
 * One append-only record for a logical mutation of a perp's backing pools.
 *
 * `cashIn` and `cashOut` are real contract-escrow movements. Internal
 * accounting moves such as funding and cross-side repair change L/S while
 * keeping both at zero. A `baseline` seeds pre-ledger history by recording
 * the same current balance in both `poolBefore` and `poolAfter`.
 */
export type PerpPoolEvent = {
  contractId: string
  eventType: PerpPoolEventType
  appliedTime: number
  oracleTime?: number
  oraclePrice?: number
  poolBefore: PerpPool
  poolAfter: PerpPool
  cashIn: number
  cashOut: number
  data?: Record<string, unknown>
}

export const assertPerpPoolEventBalanced = (event: PerpPoolEvent) => {
  const numbers = [
    event.appliedTime,
    event.oracleTime ?? 0,
    event.oraclePrice ?? 0,
    event.poolBefore.L,
    event.poolBefore.S,
    event.poolAfter.L,
    event.poolAfter.S,
    event.cashIn,
    event.cashOut,
  ]
  if (numbers.some((value) => !Number.isFinite(value)))
    throw new Error('PERP pool event values must be finite')
  if (
    event.appliedTime < 0 ||
    (event.oracleTime != null && event.oracleTime < 0) ||
    (event.oraclePrice != null && event.oraclePrice <= 0) ||
    event.poolBefore.L < 0 ||
    event.poolBefore.S < 0 ||
    event.poolAfter.L < 0 ||
    event.poolAfter.S < 0 ||
    event.cashIn < 0 ||
    event.cashOut < 0
  ) {
    throw new Error('PERP pool event values must be non-negative')
  }

  const expectedPoolAfter =
    event.poolBefore.L + event.poolBefore.S + event.cashIn - event.cashOut
  if (
    !isPerpEscrowBalanced({
      ledgerBalance: expectedPoolAfter,
      poolLong: event.poolAfter.L,
      poolShort: event.poolAfter.S,
    })
  ) {
    throw new Error(
      `PERP pool event is not cash-balanced: expected ${expectedPoolAfter}, got ${
        event.poolAfter.L + event.poolAfter.S
      }`
    )
  }
}

export type PerpPoolStatsPoint = {
  date: string
  poolLong: number
  poolShort: number
}

export type PerpCashFlowTotals = {
  initialSubsidy: number
  addedSubsidy: number
  marginIn: number
  feesIn: number
  traderPayouts: number
  residualReturned: number
  cashIn: number
  cashOut: number
}

export type PerpContractPoolStats = {
  id: string
  slug: string
  question: string
  creatorUsername: string
  isResolved: boolean
  solvencyHalted: boolean
  poolLong: number
  poolShort: number
  openInterestLong: number
  openInterestShort: number
  reservedMarginLong: number
  reservedMarginShort: number
  markedPositionValue: number
  flows: PerpCashFlowTotals
  points: PerpPoolStatsPoint[]
}

export type PerpPoolStats = {
  trackingStartTime: number | null
  points: PerpPoolStatsPoint[]
  flows: PerpCashFlowTotals
  contracts: PerpContractPoolStats[]
}
