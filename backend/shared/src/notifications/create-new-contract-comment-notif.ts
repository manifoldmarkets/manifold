import { getSocialRow, notifySocial } from 'shared/social-posts'
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
import { TopLevelPost as Post } from 'common/top-level-post'
import { PostComment } from 'common/comment'
import { richTextToString } from 'common/util/parse'
import { uniqBy } from 'lodash'
import { SupabaseDirectClient } from 'shared/supabase/init'

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
  // Bots deliver silently. Temporary blanket mute until the per-user bot
  // notification level ships; see PR #4001. isBot is the users.is_bot column
  // (convertUser maps it), so mod changes via set-bot-status apply at once.
  if (sourceUser.isBot) return

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
  // People following the comment's Yap thread. Those who have not muted it
  // get Yap's one grouped in-app alert. Muting the thread turns that alert off
  // and nothing else: the market's alerts are the market's, and a muted
  // follower gets them as any other follower of the market does.
  const threadSubscribers = await pg.manyOrNone<{
    user_id: string
    muted: boolean
    reply_id: string
    parent_id: string
  }>(
    'select sub.user_id,sub.muted,s.id as reply_id,s.parent_id from social_thread_subscriptions sub join social_posts s on s.root_id=sub.root_id where s.market_comment_id=$1 and s.parent_id is not null and s.deleted_time is null and s.hidden_time is null',
    [sourceId]
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

  const needNotFollowContractReasons = ['tagged_user', 'tagged_all_traders']

  // Users reached only through @traders get their own preference, so they can
  // keep these pings without the push alerts they want for direct tags.
  let allTradersTaggedUserIds: string[] = []
  if (
    taggedUserIds?.includes(ALL_TRADERS_ID) &&
    (sourceUser.id === sourceContract.creatorId ||
      isAdminId(sourceUser.id) ||
      isModId(sourceUser.id))
  ) {
    const allBettors = await getUniqueBettorIds(sourceContract.id, pg)
    const allVoters = await getUniqueVoterIds(sourceContract.id, pg)
    allTradersTaggedUserIds = uniq(allBettors.concat(allVoters)).filter(
      (id) => !taggedUserIds.includes(id)
    )
  }
  const bettorIds = await getUniqueBettorIds(sourceContract.id, pg)

  const allRelevantUserIds = uniq([
    ...followerIds,
    sourceContract.creatorId,
    ...(taggedUserIds ?? []),
    ...allTradersTaggedUserIds,
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

  log('notifying tagged users')
  if (taggedUserIds && taggedUserIds.length > 0) {
    await Promise.all(
      uniq(taggedUserIds).map(async (userId) =>
        sendNotificationsIfSettingsPermit(userId, 'tagged_user')
      )
    )
  }
  await Promise.all(
    allTradersTaggedUserIds.map(async (userId) =>
      sendNotificationsIfSettingsPermit(userId, 'tagged_all_traders')
    )
  )
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
  // Someone who gets the grouped Yap alert would be told twice by the market's
  // in-app alert, so that one is dropped, and only once the Yap alert is
  // stored. Creator and explicit tag alerts stay on the market, email and push
  // always follow the market preference, and a muted thread stores no Yap
  // alert, so its followers keep everything the market sends.
  const delivered = new Set<string>()
  const thread = threadSubscribers.find((s) => !s.muted)
  if (thread) {
    const keepMarketAlert = new Set(
      bulkNotifications
        .filter(
          (n) =>
            n.userId === sourceContract.creatorId ||
            needNotFollowContractReasons.includes(n.reason)
        )
        .map((n) => n.userId)
    )
    try {
      await notifySocial(
        pg,
        await getSocialRow(pg, thread.parent_id),
        sourceUser,
        'reply',
        thread.reply_id,
        keepMarketAlert,
        delivered
      )
    } catch (error) {
      log.error('Failed to group market comment notifications on Yap', {
        sourceId,
        error,
      })
    }
  }
  await createPushNotifications(bulkPushNotifications)
  await bulkInsertNotifications(
    bulkNotifications.filter((n) => !delivered.has(n.userId)),
    pg
  )
  await sendBulkEmails(
    `Comment on ${sourceContract.question}`,
    'market-comment-bulk',
    bulkEmails,
    `${sourceUser.name} on Manifold <no-reply@manifold.markets>`
  )
}

// New function for post comment notifications
export const createCommentOnPostNotification = async (
  pg: SupabaseDirectClient,
  comment: PostComment,
  post: Post,
  commentCreator: User,
  repliedUserId: string | undefined,
  mentionedUserIds: string[]
) => {
  // Same blanket mute as the contract-comment path above.
  if (commentCreator.isBot) return

  const usersToNotify: { userId: string; reason: NotificationReason }[] = []

  // Fetch post followers
  const followerIds = await pg.map(
    `select user_id from post_follows where post_id = $1`,
    [post.id],
    (r) => r.user_id
  )

  // 1. Post Creator
  if (post.creatorId !== commentCreator.id) {
    usersToNotify.push({
      userId: post.creatorId,
      reason: 'comment_on_your_contract',
    })
  }

  // 2. Replied User
  if (repliedUserId && repliedUserId !== commentCreator.id) {
    // Ensure replied user is not also the post creator already added
    if (repliedUserId !== post.creatorId) {
      usersToNotify.push({
        userId: repliedUserId,
        reason: 'reply_to_users_comment',
      })
    } else if (
      repliedUserId === post.creatorId &&
      post.creatorId !== commentCreator.id
    ) {
      // If replied user is the post creator, they'd get 'comment_on_your_post'
      // If they also need 'reply_to_users_post_comment' for different email/push, handle here
      // For now, 'comment_on_your_post' takes precedence if they are the creator.
      // If they are the creator AND the commenter, they get nothing from this rule.
      // If they are replied to AND the creator (and not the commenter), they get 'comment_on_your_post'.
      // This specific case for 'reply_to_users_post_comment' might need more nuanced logic
      // if the notification content/preference check differs significantly.
      // Let's keep it simple: if they are the creator, 'comment_on_your_post' covers it.
      // If they are replied to AND NOT the creator, they get 'reply_to_users_post_comment'.
    }
  }
  // Refined logic for Replied User to avoid double notification if also creator,
  // and ensure they get 'reply_to_users_post_comment' if not the creator.
  if (
    repliedUserId &&
    repliedUserId !== commentCreator.id &&
    repliedUserId !== post.creatorId
  ) {
    usersToNotify.push({
      userId: repliedUserId,
      reason: 'reply_to_users_comment',
    })
  }

  // 3. Mentioned Users
  mentionedUserIds.forEach((mentionedUserId) => {
    // Ensure mentioned user is not the commenter, post creator, or replied user (if already processed)
    if (
      mentionedUserId !== commentCreator.id &&
      mentionedUserId !== post.creatorId &&
      mentionedUserId !== repliedUserId
    ) {
      usersToNotify.push({
        userId: mentionedUserId,
        reason: 'tagged_user',
      })
    }
  })

  // 4. Post Followers
  followerIds.forEach((followerId) => {
    // Ensure follower is not the commenter, post creator, replied user, or a mentioned user (already processed)
    if (
      followerId !== commentCreator.id &&
      followerId !== post.creatorId &&
      followerId !== repliedUserId &&
      !mentionedUserIds.includes(followerId)
    ) {
      usersToNotify.push({
        userId: followerId,
        reason: 'all_comments_on_followed_posts',
      })
    }
  })

  const uniqueUsersToNotify = uniqBy(usersToNotify, (u) => u.userId + u.reason) // Unique by user and reason
  if (uniqueUsersToNotify.length === 0) {
    log(
      `No unique users to notify for post comment ${comment.id} on post ${post.id}`
    )
    return
  }

  const postTitle = post.title
  const commentText = richTextToString(comment.content)

  const buildNotification = (
    userId: string,
    reason: NotificationReason
  ): Notification => {
    return removeUndefinedProps({
      id: nanoid(6),
      userId,
      reason,
      createdTime: Date.now(),
      isSeen: false,
      sourceId: comment.id,
      sourceType: 'comment',
      sourceUpdateType: 'created',
      sourceUserName: commentCreator.name,
      sourceUserUsername: commentCreator.username,
      sourceUserAvatarUrl: commentCreator.avatarUrl,
      sourceText: commentText,
      sourceSlug: `post/${post.slug}#${comment.id}`,
      sourceTitle: postTitle,
      data: removeUndefinedProps({
        isReply: !!repliedUserId,
      }),
    }) as Notification
  }

  const allRelevantUserIds = uniq(uniqueUsersToNotify.map((u) => u.userId))
  if (allRelevantUserIds.length === 0) return

  const privateUsers = await pg.map(
    `select pu.*, u.name as user_name, u.username as user_username, u.data->>'avatarUrl' as user_avatar_url
     from private_users pu join users u on pu.id = u.id where pu.id = any($1)`,
    [allRelevantUserIds],
    (r) => ({
      ...convertPrivateUser(r),
      name: r.user_name,
      username: r.user_username,
      avatarUrl: r.user_avatar_url,
    })
  )
  const privateUserMap = new Map(privateUsers.map((user) => [user.id, user]))

  const bulkNotifications: Notification[] = []
  const bulkEmails: EmailAndTemplateEntry[] = []
  const bulkPushNotifications: [PrivateUser, Notification, string, string][] =
    []
  const usersToReceivedNotifications: Record<
    string,
    notification_destination_types[]
  > = {}

  for (const { userId, reason } of uniqueUsersToNotify) {
    const privateUser = privateUserMap.get(userId)
    if (!privateUser || userIsBlocked(privateUser, commentCreator.id)) {
      continue
    }

    const { sendToBrowser, sendToMobile, notificationPreference } =
      getNotificationDestinationsForUser(privateUser, reason)

    const receivedNotifications = usersToReceivedNotifications[userId] ?? []

    if (sendToBrowser && !receivedNotifications.includes('browser')) {
      bulkNotifications.push(buildNotification(userId, reason))
      receivedNotifications.push('browser')
    }

    if (sendToMobile && !receivedNotifications.includes('mobile')) {
      const reasonText =
        (notificationPreference &&
          NOTIFICATION_DESCRIPTIONS[notificationPreference].verb) ||
        'interacted with a post'
      const pushNotification = buildNotification(userId, reason)
      bulkPushNotifications.push([
        privateUser,
        pushNotification,
        `${commentCreator.name} ${reasonText} on ${postTitle}`,
        commentText,
      ])
      receivedNotifications.push('mobile')
    }

    // if (sendToEmail && !receivedNotifications.includes('email')) {
    //   const emailPostObject = {
    //     question: postTitle,
    //     slug: post.slug,
    //     id: post.id,
    //     creatorUsername: post.creatorUsername,
    //   } as any

    //   const email = getNewCommentEmail(
    //     reason,
    //     privateUser,
    //     privateUser.name,
    //     commentCreator,
    //     emailPostObject,
    //     commentText,
    //     comment.id,
    //     undefined
    //   )
    //   if (email) {
    //     bulkEmails.push(email)
    //   }
    //   receivedNotifications.push('email')
    // }
    usersToReceivedNotifications[userId] = receivedNotifications
  }

  if (bulkNotifications.length > 0) {
    await bulkInsertNotifications(bulkNotifications, pg)
  }
  if (bulkPushNotifications.length > 0) {
    await createPushNotifications(bulkPushNotifications)
  }
  if (bulkEmails.length > 0) {
    await sendBulkEmails(
      `Comment on post: ${postTitle}`,
      'market-comment-bulk',
      bulkEmails,
      `${commentCreator.name} on Manifold <no-reply@manifold.markets>`
    )
  }

  log(
    `Created ${bulkNotifications.length} browser notifications for post comment ${comment.id} on post ${post.id}`
  )
}
