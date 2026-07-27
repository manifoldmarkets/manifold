import { MINUTE_MS } from '../util/time'

export type OraclePoint = {
  ts: number
  price: number
}

export const MAX_ORACLE_FUTURE_SKEW_MS = 5 * MINUTE_MS

export type OracleFreshness = {
  status: 'fresh' | 'stale' | 'unknown'
  /** Non-negative age for display and diagnostics; null when inputs are invalid. */
  ageMs: number | null
}

/**
 * Classify the executable price cached on a PERP contract.
 *
 * Missing/invalid timestamps and invalid market tolerances are `unknown`, not
 * fresh: callers must pause execution when status is anything but `fresh`.
 * Future timestamps within the ingestion skew allowance have age zero.
 */
export const getOracleFreshness = (
  oraclePriceTime: number | undefined,
  maxAgeMs: number,
  now = Date.now()
): OracleFreshness => {
  if (
    typeof oraclePriceTime !== 'number' ||
    !Number.isFinite(oraclePriceTime) ||
    oraclePriceTime <= 0 ||
    !Number.isFinite(maxAgeMs) ||
    maxAgeMs <= 0 ||
    !Number.isFinite(now) ||
    now <= 0
  ) {
    return { status: 'unknown', ageMs: null }
  }

  const rawAgeMs = now - oraclePriceTime
  if (!Number.isFinite(rawAgeMs) || rawAgeMs < -MAX_ORACLE_FUTURE_SKEW_MS) {
    return { status: 'unknown', ageMs: null }
  }
  const ageMs = Math.max(rawAgeMs, 0)
  return {
    status: rawAgeMs > maxAgeMs ? 'stale' : 'fresh',
    ageMs,
  }
}

/**
 * Scale-independent endpoint movement for ranking numeric oracle markets.
 * Invalid persisted values contribute no movement instead of surfacing NaN.
 */
export const getOracleLogPriceChange = (
  currentPrice: number,
  previousPrice: number
) => {
  if (
    !Number.isFinite(currentPrice) ||
    !Number.isFinite(previousPrice) ||
    currentPrice <= 0 ||
    previousPrice <= 0
  )
    return 0

  // Subtract logs instead of taking current / previous so two extreme but
  // finite values cannot overflow or underflow the ratio first.
  const change = Math.abs(Math.log(currentPrice) - Math.log(previousPrice))
  return Number.isFinite(change) ? change : 0
}

export const validateBasicOraclePoint = (
  point: OraclePoint,
  now = Date.now()
): string | null => {
  if (!Number.isFinite(point.ts) || point.ts <= 0)
    return `invalid timestamp ${point.ts}`
  if (point.ts > now + MAX_ORACLE_FUTURE_SKEW_MS)
    return `timestamp ${point.ts} is more than ${MAX_ORACLE_FUTURE_SKEW_MS}ms in the future`
  if (!Number.isFinite(point.price) || point.price <= 0)
    return `non-positive price ${point.price}`
  return null
}

export type OracleTransitionDecision =
  | { action: 'apply' }
  | { action: 'ignore'; reason: 'stale' | 'duplicate' }
  | { action: 'reject'; reason: string }

/**
 * Decide whether a feed point may become a contract's executable price.
 *
 * Feed rows can be published and applied concurrently. The contract lock
 * serializes state writes, but it does not guarantee callers reach that lock
 * in timestamp order, so chronology must be checked against the locked
 * contract itself.
 */
export const decideOracleTransition = (
  current: OraclePoint | null,
  incoming: OraclePoint,
  now = Date.now()
): OracleTransitionDecision => {
  const incomingRejection = validateBasicOraclePoint(incoming, now)
  if (incomingRejection) return { action: 'reject', reason: incomingRejection }

  if (!current) return { action: 'apply' }

  const currentRejection = validateBasicOraclePoint(current, now)
  if (currentRejection)
    return {
      action: 'reject',
      reason: `current oracle point is invalid: ${currentRejection}`,
    }

  if (incoming.ts < current.ts) return { action: 'ignore', reason: 'stale' }
  if (incoming.ts > current.ts) return { action: 'apply' }
  if (incoming.price === current.price)
    return { action: 'ignore', reason: 'duplicate' }

  return {
    action: 'reject',
    reason: `timestamp ${incoming.ts} conflicts with current price ${current.price} (incoming ${incoming.price})`,
  }
}
