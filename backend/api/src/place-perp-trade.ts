import { openOrAddPosition } from 'shared/perps/engine'
import { log } from 'shared/utils'
import { APIHandler } from './helpers/endpoint'
import { advancePerpBettingStreak } from './helpers/perp-streak'
import { assertPerpExposureIncreaseEnabled } from './helpers/perp-trading-mode'
import { onlyUsersWhoCanPerformAction } from './helpers/rate-limit'

export const placePerpTrade: APIHandler<'place-perp-trade'> =
  onlyUsersWhoCanPerformAction('trade', async (body, auth) => {
    assertPerpExposureIncreaseEnabled()
    const { contractId, direction, mana, leverage, idempotencyKey, maxFee } =
      body
    const isApi = auth.creds.kind === 'key'
    const { order, created } = await openOrAddPosition(
      contractId,
      auth.uid,
      direction,
      mana,
      leverage,
      idempotencyKey,
      isApi,
      maxFee
    )
    return {
      result: { order },
      continue: async () => {
        // Submitting is the trader's action, so it earns the streak on the day
        // it happens, as immediate trades did; fills can land after the daily
        // reset. A replayed request is not a new action.
        if (!created) return
        try {
          await advancePerpBettingStreak(auth.uid, contractId, isApi)
        } catch (err) {
          log('perp streak update failed (non-fatal):', err)
        }
      },
    }
  })
