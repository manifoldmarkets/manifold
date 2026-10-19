import { HOUR_MS } from 'common/util/time'
import { closePosition } from 'shared/perps/engine'
import { APIHandler } from './helpers/endpoint'
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
  return {
    order: await closePosition(
      contractId,
      auth.uid,
      direction,
      idempotencyKey,
      expectedOpenedTime,
      auth.creds.kind === 'key',
      fraction ?? 1,
      expectedSize
    ),
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
