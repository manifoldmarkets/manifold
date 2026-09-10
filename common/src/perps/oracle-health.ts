import { z } from 'zod'
import { MINUTE_MS } from '../util/time'

export const ORACLE_HEALTH_MAX_AGE_MS = 5 * MINUTE_MS
export const ORACLE_HEALTH_REFRESH_MS = MINUTE_MS

/** Provider availability lives in existing contract JSON. Successful checks
 * expire at the earlier of the source freshness limit and the check budget.
 * Available health commits atomically with its executable price. */
export const oracleFeedHealthSchema = z
  .object({
    checkedAt: z.number().finite().positive(),
    status: z.enum(['available', 'unavailable']),
    reason: z.string().optional(),
    expiresAt: z.number().finite().positive().optional(),
  })
  .strict()

export type OracleFeedHealth = z.infer<typeof oracleFeedHealthSchema>

/** Polling stays fast; an unchanged contract needs only a minute heartbeat.
 * Transitions are immediate. Near-expiry refreshes must extend the expiry,
 * otherwise a stationary source would cause a write on every final tick. */
export const shouldRefreshOracleHealth = (
  current: OracleFeedHealth | undefined,
  incoming: OracleFeedHealth,
  now = Date.now()
) => {
  if (!current) return true
  if (incoming.checkedAt <= current.checkedAt) return false
  return (
    incoming.status !== current.status ||
    incoming.reason !== current.reason ||
    incoming.checkedAt - current.checkedAt >= ORACLE_HEALTH_REFRESH_MS ||
    (incoming.status === 'available' &&
      (current.expiresAt == null ||
        (current.expiresAt <= now + 5_000 &&
          (incoming.expiresAt ?? 0) > current.expiresAt)))
  )
}
