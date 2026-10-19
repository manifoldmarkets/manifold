import { openOrAddPosition } from 'shared/perps/engine'
import { APIHandler } from './helpers/endpoint'
import { assertPerpExposureIncreaseEnabled } from './helpers/perp-trading-mode'
import { onlyUsersWhoCanPerformAction } from './helpers/rate-limit'

export const placePerpTrade: APIHandler<'place-perp-trade'> =
  onlyUsersWhoCanPerformAction('trade', async (body, auth) => {
    assertPerpExposureIncreaseEnabled()
    const { contractId, direction, mana, leverage, idempotencyKey, maxFee } =
      body
    return {
      order: await openOrAddPosition(
        contractId,
        auth.uid,
        direction,
        mana,
        leverage,
        idempotencyKey,
        auth.creds.kind === 'key',
        maxFee
      ),
    }
  })
