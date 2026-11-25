import { UserEntitlement } from 'common/shop/types'
import { log } from './monitoring/log'
import { broadcastUserUpdates, UserUpdate } from './supabase/users'
import { broadcastUpdatedUser } from './websockets/helpers'

export function broadcastShopUserState(
  userId: string,
  {
    balanceUpdates = [],
    entitlements,
  }: { balanceUpdates?: UserUpdate[]; entitlements?: UserEntitlement[] | null }
) {
  const send = (broadcast: () => void) => {
    try {
      broadcast()
    } catch (error) {
      log.error('Failed to broadcast shop user state', { userId, error })
    }
  }
  for (const update of balanceUpdates) {
    send(() => broadcastUserUpdates([update]))
  }
  if (entitlements)
    send(() => broadcastUpdatedUser({ id: userId, entitlements }))
}
