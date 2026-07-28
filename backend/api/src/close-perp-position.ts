import { closePosition } from 'shared/perps/engine'
import { APIHandler } from './helpers/endpoint'
import { assertPerpCloseEnabled } from './helpers/perp-trading-mode'

export const closePerpPosition: APIHandler<'close-perp-position'> = async (
  body,
  auth
) => {
  assertPerpCloseEnabled()
  const { contractId, direction, idempotencyKey, expectedOpenedTime } = body
  return await closePosition(
    contractId,
    auth.uid,
    direction,
    idempotencyKey,
    expectedOpenedTime
  )
}
