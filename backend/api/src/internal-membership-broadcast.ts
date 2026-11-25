import { timingSafeEqual } from 'node:crypto'
import { APIError } from 'common/api/utils'
import { betsQueue } from 'shared/helpers/fn-queue'
import { broadcastUpdatedUser } from 'shared/websockets/helpers'
import { getUser } from './get-user'
import { APIHandler } from './helpers/endpoint'

export const internalMembershipBroadcast: APIHandler<
  'internal-membership-broadcast'
> = async ({ apiSecret, userId }) => {
  const expected = process.env.API_SECRET
  if (!expected) throw new APIError(500, 'API_SECRET is not configured.')
  const providedBytes = Buffer.from(apiSecret)
  const expectedBytes = Buffer.from(expected)
  if (
    providedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(providedBytes, expectedBytes)
  ) {
    throw new APIError(403, 'Invalid API secret.')
  }

  // A checkout may have committed since the scheduler sent this request.
  await betsQueue.enqueueFn(async () => {
    const user = await getUser({ id: userId })
    broadcastUpdatedUser({
      id: userId,
      balance: user.balance,
      cashBalance: user.cashBalance,
      spiceBalance: user.spiceBalance,
      totalDeposits: user.totalDeposits,
      totalCashDeposits: user.totalCashDeposits,
      entitlements: user.entitlements,
    })
  }, [userId])
  return { success: true }
}
