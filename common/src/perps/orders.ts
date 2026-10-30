import { PerpDirection, PerpPosition } from './position'
import { OraclePoint } from './oracle'
import { ADJACENT_MSRY_FEED_ID } from './adjacent-msry'

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

// The same room for every provider-stamped feed. Adjacent's MSRY stamp is the
// start of the minute its value was recorded in, at or before the
// computation, so MNX's measured allowance is ample there too.
export const PROVIDER_SOURCE_CLOCK_ALLOWANCE_MS = MNX_SOURCE_CLOCK_ALLOWANCE_MS

// Feeds whose provider stamp records when the provider PRODUCED the value
// (MNX's mark time, the start of Adjacent's one-minute MSRY bucket) rather
// than the period it describes. Next-price eligibility keys on that stamp, so
// an order fills only at a value produced after it was placed. A poll that
// lands on a cached or load-balanced copy of a value the trader could already
// see then cannot fill it. Mirrored in SQL by shared/perps/orders.ts and the
// backlog query in shared/perps/engine.ts, which take this predicate's
// answer (or this list) as a parameter.
export const PROVIDER_STAMPED_FEED_IDS: readonly string[] = [
  ADJACENT_MSRY_FEED_ID,
]
export const isProviderStampedFeed = (feedId: string) =>
  feedId.startsWith('mnx-') || PROVIDER_STAMPED_FEED_IDS.includes(feedId)

// Orders created strictly before the returned time may fill at `point`; null
// when none may. Dataset as-of timestamps (daily feeds) are not production
// timestamps. A provider-stamped feed's are; do not fill from a stale
// load-balanced or cached response.
export const perpEligibilityCutoff = (feedId: string, point: OraclePoint) => {
  if (
    !Number.isFinite(point.ts) ||
    !Number.isFinite(point.price) ||
    point.price <= 0
  )
    return null
  if (!isProviderStampedFeed(feedId)) return point.ts
  if (
    point.sourceTs == null ||
    !Number.isFinite(point.sourceTs) ||
    point.sourceTs > point.ts
  )
    return null
  return Math.min(point.ts, point.sourceTs - PROVIDER_SOURCE_CLOCK_ALLOWANCE_MS)
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
