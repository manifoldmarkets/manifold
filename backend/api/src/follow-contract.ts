import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { APIHandler } from './helpers/endpoint'
import { broadcast } from 'shared/websockets/server'
import { getContract, getPrivateUser, getUser, log } from 'shared/utils'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { userIsBlocked } from 'common/user-notification-preferences'
import { User } from 'common/user'
import { insertNotificationToSupabase } from 'shared/supabase/notifications'
import { Notification } from 'common/notification'

export const followContract: APIHandler<'follow-contract'> = async (
  { contractId, follow },
  auth
) => {
  const pg = createSupabaseDirectClient()
  await followContractInternal(pg, contractId, follow, auth.uid)
  broadcast(`contract-follow/${contractId}`, {
    follow,
    followerId: auth.uid,
  })

  return {
    result: { success: true },
    continue: async () => {
      if (!follow) return
      try {
        const follower = await getUser(auth.uid)
        if (follower) {
          await createFollowsOnYourMarketNotification(contractId, follower, pg)
        }
      } catch (error) {
        log.error('Failed to create follow notification:', { error })
      }
    },
  }
}
export const followContractInternal = async (
  pg: SupabaseDirectClient,
  contractId: string,
  follow: boolean,
  followerId: string
) => {
  if (follow) {
    await pg.none(
      `insert into contract_follows (contract_id, follow_id)
       values ($1, $2)
       on conflict (contract_id, follow_id) do nothing`,
      [contractId, followerId]
    )
  } else {
    await pg.none(
      `delete from contract_follows
       where contract_id = $1 and follow_id = $2`,
      [contractId, followerId]
    )
  }
}

const createFollowsOnYourMarketNotification = async (
  contractId: string,
  followerUser: User,
  pg: SupabaseDirectClient
) => {
  const contract = await getContract(pg, contractId)
  if (!contract) return

  // Don't notify if follower is the creator
  if (followerUser.id === contract.creatorId) return

  const creatorId = contract.creatorId
  const privateUser = await getPrivateUser(creatorId)
  if (!privateUser) return
  if (userIsBlocked(privateUser, followerUser.id)) return

  const { sendToBrowser } = getNotificationDestinationsForUser(
    privateUser,
    'market_follows'
  )

  if (sendToBrowser) {
    const notification: Notification = {
      id: `${followerUser.id}-follows-${contractId}}`,
      userId: creatorId,
      reason: 'market_follows',
      createdTime: Date.now(),
      isSeen: false,
      sourceId: followerUser.id,
      sourceType: 'follow',
      sourceUpdateType: 'created',
      sourceContractId: contractId,
      sourceUserName: followerUser.name,
      sourceUserUsername: followerUser.username,
      sourceUserAvatarUrl: followerUser.avatarUrl,
      sourceText: '',
      sourceContractCreatorUsername: contract.creatorUsername,
      sourceContractTitle: contract.question,
      sourceContractSlug: contract.slug,
      sourceSlug: contract.slug,
      sourceTitle: contract.question,
    }

    await insertNotificationToSupabase(notification, pg)
  }
}
