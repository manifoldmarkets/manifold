import { Notification } from 'common/notification'
import { User } from 'common/user'
import { Contract } from 'common/contract'
import { forEach } from 'lodash'
import {
  sendBulkEmails,
  getNewFollowedMarketEmail,
  EmailAndTemplateEntry,
} from '../emails'
import {
  getNotificationDestinationsForUser,
  notification_preference,
  userIsBlocked,
} from 'common/user-notification-preferences'
import { createSupabaseDirectClient } from 'shared/supabase/init'

import { bulkInsertNotifications } from 'shared/supabase/notifications'
import { convertPrivateUser } from 'common/supabase/users'

export const createNewContractNotification = async (
  contractCreator: User,
  contract: Contract,
  idempotencyKey: string,
  text: string,
  mentionedUserIds: string[]
) => {
  const pg = createSupabaseDirectClient()
  const bulkNotifications: Notification[] = []
  const bulkEmails: EmailAndTemplateEntry[] = []

  const privateUsers = await pg.map(
    `select private_users.*, users.name from private_users
           join users on private_users.id = users.id
           where private_users.id in
           (select user_id from user_follows where follow_id = $1)`,
    [contractCreator.id],
    (r) => ({ ...convertPrivateUser(r), name: r.name })
  )
  const followerUserIds = privateUsers.map((user) => user.id)
  const privateUserMap = new Map(privateUsers.map((user) => [user.id, user]))
  const sendNotificationsIfSettingsAllow = (
    userId: string,
    reason: notification_preference
  ) => {
    const privateUser = privateUserMap.get(userId)
    if (!privateUser) return
    if (userIsBlocked(privateUser, contractCreator.id)) return
    const { sendToBrowser, sendToEmail } = getNotificationDestinationsForUser(
      privateUser,
      reason
    )
    // Users only get new contracts in their feed unless they're mentioned
    if (sendToBrowser) {
      const notification: Notification = {
        id: idempotencyKey,
        userId: userId,
        reason,
        createdTime: Date.now(),
        isSeen: false,
        sourceId: contract.id,
        sourceType: 'contract',
        sourceUpdateType: 'created',
        sourceUserName: contractCreator.name,
        sourceUserUsername: contractCreator.username,
        sourceUserAvatarUrl: contractCreator.avatarUrl,
        sourceText: text,
        sourceSlug: contract.slug,
        sourceTitle: contract.question,
        sourceContractSlug: contract.slug,
        sourceContractId: contract.id,
        sourceContractTitle: contract.question,
        sourceContractCreatorUsername: contract.creatorUsername,
      }
      bulkNotifications.push(notification)
    }
    if (sendToEmail && reason === 'contract_from_followed_user') {
      const entry = getNewFollowedMarketEmail(
        reason,
        privateUser.name,
        privateUser,
        contract
      )
      if (entry) bulkEmails.push(entry)
    }
  }

  // As it is coded now, the tag notification usurps the new contract notification
  if (contract.visibility == 'public') {
    forEach(
      followerUserIds.filter((userId) => !mentionedUserIds.includes(userId)),
      (userId) =>
        sendNotificationsIfSettingsAllow(userId, 'contract_from_followed_user')
    )
  }
  forEach(mentionedUserIds, (userId) =>
    sendNotificationsIfSettingsAllow(userId, 'tagged_user')
  )
  await bulkInsertNotifications(bulkNotifications, pg)

  await sendBulkEmails(
    `${contractCreator.name} asked ${contract.question}`,
    'new-market-followed-user-bulk',
    bulkEmails,
    `${contractCreator.name} on Manifold <no-reply@manifold.markets>`
  )
}
