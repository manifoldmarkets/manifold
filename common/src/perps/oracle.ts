import { MINUTE_MS } from '../util/time'

export type OraclePoint = {
  ts: number
  price: number
}

export const MAX_ORACLE_FUTURE_SKEW_MS = 5 * MINUTE_MS

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
