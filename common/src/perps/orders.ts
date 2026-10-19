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

// Dataset as-of timestamps (daily feeds) are not production timestamps.
// MNX's mark timestamp is; do not fill from a stale load-balanced response.
export const isEligiblePerpTick = (
  feedId: string,
  createdTime: number,
  point: OraclePoint
) =>
  Number.isFinite(createdTime) &&
  Number.isFinite(point.ts) &&
  Number.isFinite(point.price) &&
  point.price > 0 &&
  point.ts > createdTime &&
  (!feedId.startsWith('mnx-') ||
    (point.sourceTs != null &&
      Number.isFinite(point.sourceTs) &&
      point.sourceTs > createdTime &&
      point.sourceTs <= point.ts))

export const PERP_NEXT_PRICE_NOTICE =
  'Orders fill at the next oracle update, which may differ from the price shown. Orders cannot be cancelled.'
export const PERP_PENDING_CLOSE_NOTICE =
  'Your position remains exposed to price changes, funding and liquidation until the close fills.'
