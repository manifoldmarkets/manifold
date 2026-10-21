import { PerpDirection, PerpPosition } from './position'
import { OraclePoint } from './oracle'

export type PerpOrderRequest =
  | {
      kind: 'trade'
      direction: PerpDirection
      mana: number
      leverage: number
      maxFee: number
    }
  | { kind: 'close'; direction: PerpDirection; fraction: number }

export type PerpOrderResult =
  | {
      kind: 'trade'
      position: PerpPosition
      fee: number
      isNewUniqueBettor?: boolean
      feeBps?: number
      poolShareAfter?: number
    }
  | {
      kind: 'close'
      payout: number
      pnl: number
      fraction: number
      remainingSize: number
    }

export type PerpOrder = {
  id: string
  contractId: string
  status: 'pending' | 'filled' | 'rejected' | 'expired'
  createdTime: number
  expiresTime: number
  reservedMana: number
  request: PerpOrderRequest
  result: PerpOrderResult | null
  error: string | null
}

// MNX stamps marks on its own clock, up to 0.8s ahead of when we receive them
// (prod, October 2026: 81 of 410k observations, none past 1s). A provider
// stamp proves a mark postdates an order only with this much room to spare.
export const MNX_SOURCE_CLOCK_ALLOWANCE_MS = 2_000

// Orders created strictly before the returned time may fill at `point`; null
// when none may. Dataset as-of timestamps (daily feeds) are not production
// timestamps. MNX's mark timestamp is; do not fill from a stale load-balanced
// response.
export const perpEligibilityCutoff = (feedId: string, point: OraclePoint) => {
  if (
    !Number.isFinite(point.ts) ||
    !Number.isFinite(point.price) ||
    point.price <= 0
  )
    return null
  if (!feedId.startsWith('mnx-')) return point.ts
  if (
    point.sourceTs == null ||
    !Number.isFinite(point.sourceTs) ||
    point.sourceTs > point.ts
  )
    return null
  return Math.min(point.ts, point.sourceTs - MNX_SOURCE_CLOCK_ALLOWANCE_MS)
}

export const isEligiblePerpTick = (
  feedId: string,
  createdTime: number,
  point: OraclePoint
) => {
  const cutoff = perpEligibilityCutoff(feedId, point)
  return Number.isFinite(createdTime) && cutoff != null && createdTime < cutoff
}

export const PERP_NEXT_PRICE_NOTICE =
  'Orders fill at the next oracle update, which may differ from the price shown. Orders cannot be cancelled.'
export const PERP_PENDING_CLOSE_NOTICE =
  'Your position remains exposed to price changes, funding and liquidation until the close fills.'
