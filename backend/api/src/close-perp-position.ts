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
  const { order, created } = await closePosition(
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
    result: { order },
    continue: async () => {
      // See place-perp-trade: the submission earns the day's streak.
      if (!created) return
      try {
        await advancePerpBettingStreak(auth.uid, contractId, isApi)
      } catch (err) {
        log('perp streak update failed (non-fatal):', err)
      }
    },
  }
}

// Preserve the existing partial-close spam guard. Full exits remain available.
const rateLimitedPartialClose = rateLimitByUser(closePerpPositionInner, {
  maxCalls: 60,
  windowMs: HOUR_MS,
})

export const closePerpPosition: APIHandler<'close-perp-position'> = async (
  body,
  auth,
  req
) =>
  body.fraction !== undefined && body.fraction < 1
    ? rateLimitedPartialClose(body, auth, req)
    : closePerpPositionInner(body, auth, req)
