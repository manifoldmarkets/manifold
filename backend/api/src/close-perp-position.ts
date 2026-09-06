import { HOUR_MS } from 'common/util/time'
import { closePosition } from 'shared/perps/engine'
import { log } from 'shared/utils'
import { APIHandler } from './helpers/endpoint'
import { advancePerpBettingStreak } from './helpers/perp-streak'
import { assertPerpCloseEnabled } from './helpers/perp-trading-mode'
import { rateLimitByUser } from './helpers/rate-limit'

const closePerpPositionInner: APIHandler<'close-perp-position'> = async (
  body,
  auth
) => {
  assertPerpCloseEnabled()
  const {
    contractId,
    direction,
    idempotencyKey,
    expectedOpenedTime,
    fraction,
    expectedSize,
  } = body
  const isApi = auth.creds.kind === 'key'
  const {
    payout,
    pnl,
    replayed,
    fraction: closedFraction,
    remainingSize,
  } = await closePosition(
    contractId,
    auth.uid,
    direction,
    idempotencyKey,
    expectedOpenedTime,
    isApi,
    fraction ?? 1,
    expectedSize
  )

  return {
    result: { payout, pnl, fraction: closedFraction, remainingSize },
    continue: async () => {
      // Closes count toward the prediction streak, mirroring sells on normal
      // markets (sell-shares routes through onCreateBets). An idempotent
      // replay is not a trade and must not advance the streak.
      if (replayed) return
      try {
        await advancePerpBettingStreak(auth.uid, contractId, isApi)
      } catch (err) {
        log('perp streak update failed (non-fatal):', err)
      }
    },
  }
}

/**
 * Partial closes only.
 *
 * The 1% minimum is a fraction of the CURRENT remainder, so repeated 1% closes
 * decay geometrically rather than terminating in 100 calls: from an M$100 cost
 * basis it takes ~917 to reach the dust floor that promotes the close to a
 * full one, and more on a larger position. Each of those is a serializable
 * transaction under the contract's advisory lock plus an event, a txn, a
 * metrics rebuild and streak processing — the lock the 2s oracle tick also
 * wants.
 *
 * 60/hour is far above any plausible human scaling-out and still caps the
 * sustained rate at one per minute. In-memory per instance, like every other
 * user of this helper.
 */
const rateLimitedPartialClose = rateLimitByUser(closePerpPositionInner, {
  maxCalls: 60,
  windowMs: HOUR_MS,
})

/**
 * A FULL close is never rate-limited. Refusing someone the ability to exit a
 * leveraged position — possibly while it is running toward liquidation — is a
 * far worse failure than tolerating close spam, so the limiter above is
 * reachable only when the caller asked for a fraction of one.
 */
export const closePerpPosition: APIHandler<'close-perp-position'> = async (
  body,
  auth,
  req
) =>
  body.fraction !== undefined && body.fraction < 1
    ? rateLimitedPartialClose(body, auth, req)
    : closePerpPositionInner(body, auth, req)
