import {
  CommentNotificationData,
  Notification,
  NOTIFICATION_DESCRIPTIONS,
  NotificationReason,
} from 'common/notification'
import { PrivateUser, User } from 'common/user'
import { Contract } from 'common/contract'
import { isProd, log } from 'shared/utils'
import { uniq } from 'lodash'
import { removeUndefinedProps } from 'common/util/object'
import {
  sendBulkEmails,
  getNewCommentEmail,
  EmailAndTemplateEntry,
} from '../emails'
import {
  getNotificationDestinationsForUser,
  notification_destination_types,
  userIsBlocked,
} from 'common/user-notification-preferences'
import { createPushNotifications } from '../create-push-notifications'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  getUniqueBettorIds,
  getUniqueVoterIds,
} from 'shared/supabase/contracts'
import { isAdminId, isModId } from 'common/envs/constants'
import { bulkInsertNotifications } from 'shared/supabase/notifications'
import { convertPrivateUser } from 'common/supabase/users'
import { nanoid } from 'common/util/random'
import { replied_users_info } from 'shared/create-notification'

const ALL_TRADERS_ID = isProd()
  ? 'X3z4hxRXipWvGoFhxlDOVxmP5vL2'
  : 'eMG8r3PEdRgtGArGGx1VUBGDwY53'

export const createCommentOnContractNotification = async (
  sourceId: string,
  sourceUser: User,
  sourceText: string,
  sourceContract: Contract,
  repliedUsersInfo: replied_users_info,
  taggedUserIds: string[],
  requiresResponse: boolean
) => {
  const pg = createSupabaseDirectClient()

  const usersToReceivedNotifications: Record<
    string,
    notification_destination_types[]
  > = {}

  const followerIds = await pg.map(
    `select follow_id from contract_follows where contract_id = $1`,
    [sourceContract.id],
    (r) => r.follow_id
  )
  const isReply = Object.keys(repliedUsersInfo).length > 0
  const buildNotification = (userId: string, reason: NotificationReason) => {
    return removeUndefinedProps({
      id: nanoid(6),
      userId,
      reason,
      createdTime: Date.now(),
      isSeen: false,
      sourceId,
      sourceType: 'comment',
      sourceUpdateType: 'created',
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
      data: {
        isReply,
      } as CommentNotificationData,
      markedAsRead:
        requiresResponse && sourceContract.creatorId === userId
          ? false
          : undefined,
    }) as Notification
  }

  const needNotFollowContractReasons = ['tagged_user']

  if (
    taggedUserIds?.includes(ALL_TRADERS_ID) &&
    (sourceUser.id === sourceContract.creatorId ||
      isAdminId(sourceUser.id) ||
      isModId(sourceUser.id))
  ) {
    const allBettors = await getUniqueBettorIds(sourceContract.id, pg)
    const allVoters = await getUniqueVoterIds(sourceContract.id, pg)
    const allUsers = uniq(allBettors.concat(allVoters))
    taggedUserIds.push(...allUsers)
  }
  const bettorIds = await getUniqueBettorIds(sourceContract.id, pg)

  const allRelevantUserIds = uniq([
    ...followerIds,
    sourceContract.creatorId,
    ...(taggedUserIds ?? []),
    ...(repliedUsersInfo ? Object.keys(repliedUsersInfo) : []),
    ...bettorIds,
  ])
  const bulkNotifications: Notification[] = []
  const bulkEmails: EmailAndTemplateEntry[] = []
  const bulkPushNotifications: [PrivateUser, Notification, string, string][] =
    []
  const privateUsers = await pg.map(
    `select private_users.*, users.name from private_users
           join users on private_users.id = users.id
           where private_users.id = any($1)`,
    [allRelevantUserIds],
    (r) => ({ ...convertPrivateUser(r), name: r.name })
  )
  const privateUserMap = new Map(privateUsers.map((user) => [user.id, user]))

  const sendNotificationsIfSettingsPermit = async (
    userId: string,
    reason: NotificationReason
  ) => {
    const privateUser = privateUserMap.get(userId)
    if (
      !privateUser ||
      sourceUser.id == userId ||
      userIsBlocked(privateUser, sourceUser.id) ||
      (!followerIds.some((id) => id === userId) &&
        !needNotFollowContractReasons.includes(reason))
    )
      return

    const { sendToBrowser, sendToEmail, sendToMobile, notificationPreference } =
      getNotificationDestinationsForUser(privateUser, reason)

    const receivedNotifications = usersToReceivedNotifications[userId] ?? []

    // Browser notifications
    if (sendToBrowser && !receivedNotifications.includes('browser')) {
      bulkNotifications.push(buildNotification(userId, reason))
      receivedNotifications.push('browser')
    }

    // Mobile push notifications
    if (sendToMobile && !receivedNotifications.includes('mobile')) {
      const reasonText =
        (notificationPreference &&
          NOTIFICATION_DESCRIPTIONS[notificationPreference].verb) ??
        'commented'
      const notification = buildNotification(userId, reason)
      bulkPushNotifications.push([
        privateUser,
        notification,
        `${sourceUser.name} ${reasonText} on ${sourceContract.question}`,
        sourceText,
      ])
      receivedNotifications.push('mobile')
    }

    // Email notifications
    if (sendToEmail && !receivedNotifications.includes('email')) {
      const { bet } = repliedUsersInfo?.[userId] ?? {}
      // TODO: change subject of email title to be more specific, i.e.: replied to you on/tagged you on/comment
      const email = getNewCommentEmail(
        reason,
        privateUser,
        privateUser.name,
        sourceUser,
        sourceContract,
        sourceText,
        sourceId,
        bet
      )
      if (email) {
        bulkEmails.push(email)
      }
      receivedNotifications.push('email')
    }
    usersToReceivedNotifications[userId] = receivedNotifications
  }

  log('notifying replies')
  if (repliedUsersInfo) {
    await Promise.all(
      Object.keys(repliedUsersInfo).map(async (userId) =>
        sendNotificationsIfSettingsPermit(
          userId,
          repliedUsersInfo[userId].repliedToType === 'answer'
            ? 'reply_to_users_answer'
            : 'reply_to_users_comment'
        )
      )
    )
  }
  log('notifying tagged users')
  if (taggedUserIds && taggedUserIds.length > 0) {
    await Promise.all(
      uniq(taggedUserIds).map(async (userId) =>
        sendNotificationsIfSettingsPermit(userId, 'tagged_user')
      )
    )
  }
  log('notifying creator')
  await sendNotificationsIfSettingsPermit(
    sourceContract.creatorId,
    'all_comments_on_my_markets'
  )
  log('notifying bettors')
  await Promise.all(
    bettorIds.map(async (userId) =>
      sendNotificationsIfSettingsPermit(
        userId,
        'comment_on_contract_with_users_shares_in'
      )
    )
  )
  log('notifying followers')
  await Promise.all(
    followerIds.map(async (userId) =>
      sendNotificationsIfSettingsPermit(
        userId,
        'comment_on_contract_you_follow'
      )
    )
  )
  await createPushNotifications(bulkPushNotifications)
  await bulkInsertNotifications(bulkNotifications, pg)
  await sendBulkEmails(
    `Comment on ${sourceContract.question}`,
    'market-comment-bulk',
    bulkEmails,
    `${sourceUser.name} on Manifold <no-reply@manifold.markets>`
  )
}
