import { closePosition } from 'shared/perps/engine'
import { log } from 'shared/utils'
import { APIHandler } from './helpers/endpoint'
import { advancePerpBettingStreak } from './helpers/perp-streak'
import { assertPerpCloseEnabled } from './helpers/perp-trading-mode'

export const closePerpPosition: APIHandler<'close-perp-position'> = async (
  body,
  auth
) => {
  assertPerpCloseEnabled()
  const { contractId, direction, idempotencyKey, expectedOpenedTime } = body
  const { payout, pnl, replayed } = await closePosition(
    contractId,
    auth.uid,
    direction,
    idempotencyKey,
    expectedOpenedTime
  )

  return {
    result: { payout, pnl },
    continue: async () => {
      // Closes count toward the prediction streak, mirroring sells on normal
      // markets (sell-shares routes through onCreateBets). An idempotent
      // replay is not a trade and must not advance the streak.
      if (replayed) return
      try {
        await advancePerpBettingStreak(
          auth.uid,
          contractId,
          auth.creds.kind === 'key'
        )
      } catch (err) {
        log('perp streak update failed (non-fatal):', err)
      }
    },
  }
}
