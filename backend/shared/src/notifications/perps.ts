import { PerpContract } from 'common/contract'
import { Notification } from 'common/notification'
import { getPrivateUser } from 'shared/utils'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { MANIFOLD_AVATAR_URL } from 'common/user'
import { nanoid } from 'common/util/random'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { insertNotificationToSupabase } from 'shared/supabase/notifications'

// Notify a user that their perp position was liquidated.
export const createPerpLiquidationNotification = async (
  pg: SupabaseDirectClient,
  contract: PerpContract,
  userId: string,
  data: {
    direction: 'long' | 'short'
    liquidationPrice: number
    oraclePrice: number
    size: number
    originalCostBasis: number
  }
) => {
  const privateUser = await getPrivateUser(userId)
  if (!privateUser) return
  const { sendToBrowser } = getNotificationDestinationsForUser(
    privateUser,
    'perp_liquidation'
  )
  if (!sendToBrowser) return

  const notification: Notification = {
    id: nanoid(6),
    userId,
    reason: 'perp_liquidation',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: contract.id,
    sourceType: 'contract',
    sourceUpdateType: 'updated',
    sourceContractId: contract.id,
    sourceContractTitle: contract.question,
    sourceContractSlug: contract.slug,
    sourceContractCreatorUsername: contract.creatorUsername,
    sourceUserName: contract.creatorName,
    sourceUserUsername: contract.creatorUsername,
    sourceUserAvatarUrl: contract.creatorAvatarUrl ?? MANIFOLD_AVATAR_URL,
    sourceSlug: contract.slug,
    sourceTitle: contract.question,
    sourceText: `Your ${data.direction} position was liquidated at ${data.oraclePrice}`,
    data: data as any,
  }
  await insertNotificationToSupabase(notification, pg)
}

// Notify a user that ADL (auto-deleveraging) reduced their position.
export const createPerpAdlNotification = async (
  pg: SupabaseDirectClient,
  contract: PerpContract,
  userId: string,
  data: {
    direction: 'long' | 'short'
    scaleFactor: number
    oraclePrice: number
  }
) => {
  const privateUser = await getPrivateUser(userId)
  if (!privateUser) return
  const { sendToBrowser } = getNotificationDestinationsForUser(
    privateUser,
    'perp_adl'
  )
  if (!sendToBrowser) return

  const notification: Notification = {
    id: nanoid(6),
    userId,
    reason: 'perp_adl',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: contract.id,
    sourceType: 'contract',
    sourceUpdateType: 'updated',
    sourceContractId: contract.id,
    sourceContractTitle: contract.question,
    sourceContractSlug: contract.slug,
    sourceContractCreatorUsername: contract.creatorUsername,
    sourceUserName: contract.creatorName,
    sourceUserUsername: contract.creatorUsername,
    sourceUserAvatarUrl: contract.creatorAvatarUrl ?? MANIFOLD_AVATAR_URL,
    sourceSlug: contract.slug,
    sourceTitle: contract.question,
    sourceText: `Your ${data.direction} position was auto-deleveraged by ${(
      (1 - data.scaleFactor) *
      100
    ).toFixed(1)}%`,
    data: data as any,
  }
  await insertNotificationToSupabase(notification, pg)
}
