import { Notification, NotificationReason } from 'common/notification'
import { PrivateUser, User } from 'common/user'
import { Contract } from 'common/contract'
import {
  getNotificationDestinationsForUser,
  userIsBlocked,
} from 'common/user-notification-preferences'
import { createPushNotifications } from '../create-push-notifications' // Adjusted path
import { removeUndefinedProps } from 'common/util/object'
import { mapAsync } from 'common/util/promise'
import { sendNewAnswerEmail } from '../emails' // Adjusted path
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { bulkInsertNotifications } from 'shared/supabase/notifications'
import { convertPrivateUser } from 'common/supabase/users'

export const createNewAnswerOnContractNotification = async (
  sourceId: string,
  sourceUser: User,
  sourceText: string,
  sourceContract: Contract
) => {
  const pg = createSupabaseDirectClient()

  const constructNotification = (
    userId: string,
    reason: NotificationReason
  ) => {
    const sourceType = 'answer'
    const sourceUpdateType = 'created'
    const notification: Notification = {
      id: sourceId,
      userId,
      reason,
      createdTime: Date.now(),
      isSeen: false,
      sourceId,
      sourceType,
      sourceUpdateType,
      sourceContractId: sourceContract.id,
      sourceUserName: sourceUser.name,
      sourceUserUsername: sourceUser.username,
      sourceUserAvatarUrl: sourceUser.avatarUrl,
      sourceText,
      sourceContractCreatorUsername: sourceContract.creatorUsername,
      sourceContractTitle: sourceContract.question,
      sourceContractSlug: sourceContract.slug,
      sourceSlug: sourceContract.slug,
      sourceTitle: sourceContract.question,
    }
    return removeUndefinedProps(notification)
  }
  const bulkNotifications: Notification[] = []
  const bulkPushNotifications: [PrivateUser, Notification, string, string][] =
    []
  const privateUsers = await pg.map(
    `select * from private_users where id in
           (select follow_id from contract_follows where contract_id = $1)
           and id != $2`,
    [sourceContract.id, sourceUser.id],
    convertPrivateUser
  )
  const followerIds = privateUsers.map((user) => user.id)
  const privateUserMap = new Map(privateUsers.map((user) => [user.id, user]))

  const sendNotificationsIfSettingsPermit = async (userId: string) => {
    if (sourceUser.id == userId) return
    const reason =
      sourceContract.creatorId === userId
        ? 'all_answers_on_my_markets'
        : 'all_answers_on_watched_markets'
    const privateUser = privateUserMap.get(userId)
    if (!privateUser || userIsBlocked(privateUser, sourceUser.id)) return

    const { sendToBrowser, sendToEmail, sendToMobile } =
      getNotificationDestinationsForUser(privateUser, reason)

    if (sendToBrowser) {
      const notification = constructNotification(userId, reason)
      bulkNotifications.push(notification)
    }

    if (sendToMobile) {
      const notification = constructNotification(userId, reason)
      bulkPushNotifications.push([
        privateUser,
        notification,
        `${sourceUser.name} answered ${sourceContract.question}`,
        sourceText,
      ])
    }

    if (sendToEmail) {
      await sendNewAnswerEmail(
        reason,
        privateUser,
        sourceUser.name,
        sourceText,
        sourceContract,
        sourceUser.avatarUrl
      )
    }
  }
  await createPushNotifications(bulkPushNotifications)
  await mapAsync(
    followerIds,
    async (userId) => sendNotificationsIfSettingsPermit(userId),
    20
  )
  await bulkInsertNotifications(bulkNotifications, pg)
}
