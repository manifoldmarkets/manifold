import { getContractBetMetrics } from 'common/calculate'
import {
  BetFillData,
  BetReplyNotificationData,
  BettingStreakData,
  CommentNotificationData,
  ContractResolutionData,
  LeagueChangeData,
  Notification,
  NOTIFICATION_DESCRIPTIONS,
  notification_reason_types,
  NotificationReason,
  ReviewNotificationData,
  UniqueBettorData,
} from 'common/notification'
import {
  MANIFOLD_AVATAR_URL,
  MANIFOLD_USER_NAME,
  MANIFOLD_USER_USERNAME,
  PrivateUser,
  User,
} from 'common/user'
import { Contract, renderResolution } from 'common/contract'
import { getContract, getPrivateUser, getUser, isProd, log } from 'shared/utils'
import { ContractComment } from 'common/comment'
import {
  groupBy,
  keyBy,
  last,
  mapValues,
  minBy,
  orderBy,
  sum,
  sumBy,
  uniq,
} from 'lodash'
import { Bet, LimitBet } from 'common/bet'
import { Answer } from 'common/answer'
import { removeUndefinedProps } from 'common/util/object'
import { mapAsync } from 'common/util/promise'
import {
  sendMarketCloseEmail,
  sendMarketResolutionEmail,
  sendNewAnswerEmail,
  sendNewCommentEmail,
  sendNewFollowedMarketEmail,
  sendNewUniqueBettorsEmail,
} from './emails'
import {
  getNotificationDestinationsForUser,
  notification_destination_types,
  notification_preference,
  userIsBlocked,
  userOptedOutOfBrowserNotifications,
} from 'common/user-notification-preferences'
import { createPushNotification } from './create-push-notification'
import { Reaction } from 'common/reaction'
import { QuestType } from 'common/quest'
import { QuestRewardTxn } from 'common/txn'
import { formatMoney } from 'common/util/format'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import * as crypto from 'crypto'
import {
  getUniqueBettorIds,
  getUniqueVoterIds,
} from 'shared/supabase/contracts'
import { richTextToString } from 'common/util/parse'
import { league_user_info } from 'common/leagues'
import { hasUserSeenMarket } from 'shared/helpers/seen-markets'
import { getUserFollowerIds } from 'shared/supabase/users'
import { buildArray, filterDefined } from 'common/util/array'
import { isAdminId, isModId } from 'common/envs/constants'
import {
  bulkInsertNotifications,
  insertNotificationToSupabase,
} from 'shared/supabase/notifications'
import { getCommentSafe } from './supabase/contract-comments'
import { convertPrivateUser, convertUser } from 'common/supabase/users'
import { convertBet } from 'common/supabase/bets'
import {
  getRangeContainingValues,
  answerToMidpoint,
} from 'common/multi-numeric'

type recipients_to_reason_texts = {
  [userId: string]: { reason: notification_reason_types }
}

export const createFollowOrMarketSubsidizedNotification = async (
  sourceId: string,
  sourceType: 'liquidity' | 'follow',
  sourceUpdateType: 'created',
  sourceUser: Pick<User, 'name' | 'username' | 'avatarUrl'>,
  idempotencyKey: string,
  sourceText: string,
  miscData?: {
    contract?: Contract
    recipients?: string[]
  }
) => {
  const { contract: sourceContract, recipients } = miscData ?? {}

  const shouldReceiveNotification = (
    userId: string,
    userToReasonTexts: recipients_to_reason_texts
  ) => {
    return (
      sourceId != userId && !Object.keys(userToReasonTexts).includes(userId)
    )
  }

  const sendNotificationsIfSettingsPermit = async (
    userToReasonTexts: recipients_to_reason_texts
  ) => {
    for (const userId in userToReasonTexts) {
      const { reason } = userToReasonTexts[userId]
      const privateUser = await getPrivateUser(userId)
      if (!privateUser) continue
      const { sendToBrowser, sendToEmail } = getNotificationDestinationsForUser(
        privateUser,
        reason
      )
      if (sendToBrowser) {
        const notification: Notification = {
          id: idempotencyKey,
          userId,
          reason,
          createdTime: Date.now(),
          isSeen: false,
          sourceId,
          sourceType,
          sourceUpdateType,
          sourceContractId: sourceContract?.id,
          sourceUserName: sourceUser.name,
          sourceUserUsername: sourceUser.username,
          sourceUserAvatarUrl: sourceUser.avatarUrl,
          sourceText,
          sourceContractCreatorUsername: sourceContract?.creatorUsername,
          sourceContractTitle: sourceContract?.question,
          sourceContractSlug: sourceContract?.slug,
          sourceSlug: sourceContract?.slug,
          sourceTitle: sourceContract?.question,
        }
        const pg = createSupabaseDirectClient()
        await insertNotificationToSupabase(notification, pg)
      }

      if (!sendToEmail) continue

      if (reason === 'subsidized_your_market') {
        // TODO: send email to creator of market that was subsidized
      } else if (reason === 'on_new_follow') {
        // TODO: send email to user who was followed
      }
    }
  }

  // The following functions modify the userToReasonTexts object in place.
  const userToReasonTexts: recipients_to_reason_texts = {}

  if (sourceType === 'follow' && recipients?.[0]) {
    if (shouldReceiveNotification(recipients[0], userToReasonTexts))
      userToReasonTexts[recipients[0]] = {
        reason: 'on_new_follow',
      }
    return await sendNotificationsIfSettingsPermit(userToReasonTexts)
  } else if (sourceType === 'liquidity' && sourceContract) {
    if (shouldReceiveNotification(sourceContract.creatorId, userToReasonTexts))
      userToReasonTexts[sourceContract.creatorId] = {
        reason: 'subsidized_your_market',
      }
    return await sendNotificationsIfSettingsPermit(userToReasonTexts)
  }
}

export type replied_users_info = {
  [key: string]: {
    repliedToType: 'comment' | 'answer'
    repliedToAnswerText: string | undefined
    repliedToAnswerId: string | undefined
    bet: Bet | undefined
  }
}

const ALL_TRADERS_ID = isProd()
  ? 'X3z4hxRXipWvGoFhxlDOVxmP5vL2'
  : 'eMG8r3PEdRgtGArGGx1VUBGDwY53'

export const createCommentOnContractNotification = async (
  sourceId: string,
  sourceUser: User,
  sourceText: string,
  sourceContract: Contract,
  miscData?: {
    repliedUsersInfo: replied_users_info
    taggedUserIds: string[]
  }
) => {
  const { repliedUsersInfo, taggedUserIds } = miscData ?? {}
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
  if (sourceContract.loverUserId1 || sourceContract.loverUserId2) {
    const { loverUserId1, loverUserId2 } = sourceContract
    followerIds.push(...filterDefined([loverUserId1, loverUserId2]))
  }
  const buildNotification = (userId: string, reason: NotificationReason) => {
    const notification: Notification = {
      id: crypto.randomUUID(),
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
        isReply: !!repliedUsersInfo,
      } as CommentNotificationData,
    }
    return removeUndefinedProps(notification)
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
  const notifications: Notification[] = []
  const privateUsers = await pg.map(
    'select * from private_users where id = any($1)',
    [allRelevantUserIds],
    convertPrivateUser
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
      notifications.push(buildNotification(userId, reason))
      receivedNotifications.push('browser')
    }

    // Mobile push notifications
    if (sendToMobile && !receivedNotifications.includes('mobile')) {
      const reasonText =
        (notificationPreference &&
          NOTIFICATION_DESCRIPTIONS[notificationPreference].verb) ??
        'commented'
      const notification = buildNotification(userId, reason)
      await createPushNotification(
        notification,
        privateUser,
        `${sourceUser.name} ${reasonText} on ${sourceContract.question}`,
        sourceText
      )
      receivedNotifications.push('mobile')
    }

    // Email notifications
    if (sendToEmail && !receivedNotifications.includes('email')) {
      const { bet } = repliedUsersInfo?.[userId] ?? {}
      // TODO: change subject of email title to be more specific, i.e.: replied to you on/tagged you on/comment
      await sendNewCommentEmail(
        reason,
        privateUser,
        sourceUser,
        sourceContract,
        sourceText,
        sourceId,
        bet
      )
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
  await bulkInsertNotifications(notifications, pg)
}

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
  const followerIds = await pg.map(
    `select follow_id from contract_follows where contract_id = $1`,
    [sourceContract.id],
    (r) => r.follow_id as string
  )
  const privateUsers = await pg.map(
    'select * from private_users where id = any($1)',
    [followerIds],
    convertPrivateUser
  )
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
      await createPushNotification(
        notification,
        privateUser,
        `${sourceUser.name} answered your question on ${sourceContract.question}`,
        sourceText
      )
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

  await mapAsync(
    followerIds,
    async (userId) => sendNotificationsIfSettingsPermit(userId),
    20
  )
  await bulkInsertNotifications(bulkNotifications, pg)
}

export const createBetFillNotification = async (
  toUser: User,
  bet: Bet,
  limitBet: LimitBet,
  contract: Contract,
  idempotencyKey: string
) => {
  const privateUser = await getPrivateUser(toUser.id)
  if (!privateUser) return
  const { sendToBrowser } = getNotificationDestinationsForUser(
    privateUser,
    'bet_fill'
  )
  if (!sendToBrowser) return

  const fromUser = await getUser(bet.userId)
  if (!fromUser) return

  // The limit order fills array has a matchedBetId that does not match this bet id
  // (even though this bet has a fills array that is matched to the limit order)
  // This is likely bc this bet is an arbitrage bet. This should be fixed.
  // This matches based on timestamp because of the above bug.
  const fill =
    limitBet.fills.find((fill) => fill.timestamp === bet.createdTime) ??
    last(orderBy(limitBet.fills, 'timestamp', 'asc'))
  // const fill = limitBet.fills.find((f) => f.matchedBetId === bet.id)

  const fillAmount = fill?.amount ?? 0
  const remainingAmount =
    limitBet.orderAmount - sum(limitBet.fills.map((f) => f.amount))
  const limitAt =
    contract.outcomeType === 'PSEUDO_NUMERIC'
      ? limitBet.limitProb * (contract.max - contract.min) + contract.min
      : Math.round(limitBet.limitProb * 100) + '%'
  const betAnswer =
    'answers' in contract
      ? (contract.answers as Answer[]).find((a) => a.id === bet.answerId)?.text
      : undefined

  if (fillAmount < 1) {
    return
  }

  const notification: Notification = {
    id: idempotencyKey,
    userId: toUser.id,
    reason: 'bet_fill',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: limitBet.id,
    sourceType: 'bet',
    sourceUpdateType: 'updated',
    sourceUserName: fromUser.name,
    sourceUserUsername: fromUser.username,
    sourceUserAvatarUrl: fromUser.avatarUrl,
    sourceText: fillAmount.toString(),
    sourceContractCreatorUsername: contract.creatorUsername,
    sourceContractTitle: contract.question,
    sourceContractSlug: contract.slug,
    sourceContractId: contract.id,
    data: {
      betOutcome: bet.outcome,
      betAnswer,
      creatorOutcome: limitBet.outcome,
      fillAmount,
      probability: limitBet.limitProb,
      limitOrderTotal: limitBet.orderAmount,
      limitOrderRemaining: remainingAmount,
      limitAt: limitAt.toString(),
      outcomeType: contract.outcomeType,
    } as BetFillData,
  }
  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
}

export const createLimitBetCanceledNotification = async (
  fromUser: User,
  toUserId: string,
  limitBet: LimitBet,
  fillAmount: number,
  contract: Contract
) => {
  const privateUser = await getPrivateUser(toUserId)
  if (!privateUser) return
  const { sendToBrowser } = getNotificationDestinationsForUser(
    privateUser,
    'bet_fill'
  )
  if (!sendToBrowser) return

  const remainingAmount =
    limitBet.orderAmount -
    (sum(limitBet.fills.map((f) => f.amount)) + fillAmount)
  const limitAt =
    contract.outcomeType === 'PSEUDO_NUMERIC'
      ? limitBet.limitProb * (contract.max - contract.min) + contract.min
      : Math.round(limitBet.limitProb * 100) + '%'

  const notification: Notification = {
    id: crypto.randomUUID(),
    userId: toUserId,
    reason: 'limit_order_cancelled',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: limitBet.id,
    sourceType: 'bet',
    sourceUpdateType: 'updated',
    sourceUserName: fromUser.name,
    sourceUserUsername: fromUser.username,
    sourceUserAvatarUrl: fromUser.avatarUrl,
    sourceText: remainingAmount.toString(),
    sourceContractCreatorUsername: contract.creatorUsername,
    sourceContractTitle: contract.question,
    sourceContractSlug: contract.slug,
    sourceContractId: contract.id,
    data: {
      creatorOutcome: limitBet.outcome,
      probability: limitBet.limitProb,
      limitOrderTotal: limitBet.orderAmount,
      limitOrderRemaining: remainingAmount,
      limitAt: limitAt.toString(),
      outcomeType: contract.outcomeType,
    } as BetFillData,
  }
  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
}

export const createLimitBetExpiredNotification = async (
  limitBet: LimitBet,
  contract: Contract
) => {
  const toUserId = limitBet.userId
  const privateUser = await getPrivateUser(toUserId)
  if (!privateUser) return
  const { sendToBrowser } = getNotificationDestinationsForUser(
    privateUser,
    'bet_fill'
  )
  if (!sendToBrowser) return

  const remainingAmount =
    limitBet.orderAmount - sum(limitBet.fills.map((f) => f.amount))
  const limitAt =
    contract.outcomeType === 'PSEUDO_NUMERIC'
      ? limitBet.limitProb * (contract.max - contract.min) + contract.min
      : Math.round(limitBet.limitProb * 100) + '%'

  const notification: Notification = {
    id: crypto.randomUUID(),
    userId: toUserId,
    reason: 'limit_order_cancelled',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: limitBet.id,
    sourceType: 'bet',
    sourceUpdateType: 'expired',
    sourceUserName: '',
    sourceUserUsername: '',
    sourceUserAvatarUrl: '',
    sourceText: remainingAmount.toString(),
    sourceContractCreatorUsername: contract.creatorUsername,
    sourceContractTitle: contract.question,
    sourceContractSlug: contract.slug,
    sourceContractId: contract.id,
    data: {
      creatorOutcome: limitBet.outcome,
      probability: limitBet.limitProb,
      limitOrderTotal: limitBet.orderAmount,
      limitOrderRemaining: remainingAmount,
      limitAt: limitAt.toString(),
      outcomeType: contract.outcomeType,
    } as BetFillData,
  }
  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
}

export const createReferralNotification = async (
  toUserId: string,
  referredUser: User,
  bonusAmount: string,
  referredByContract?: Contract
) => {
  const privateUser = await getPrivateUser(toUserId)
  if (!privateUser) return
  const { sendToBrowser } = getNotificationDestinationsForUser(
    privateUser,
    'you_referred_user'
  )
  if (!sendToBrowser) return

  const notification: Notification = {
    id: referredUser.id + '-signup-referral-bonus',
    userId: toUserId,
    reason:
      referredByContract?.creatorId === toUserId
        ? 'user_joined_to_bet_on_your_market'
        : 'you_referred_user',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: referredUser.id,
    sourceType: 'user',
    sourceUpdateType: 'updated',
    sourceContractId: referredByContract?.id,
    sourceUserName: referredUser.name,
    sourceUserUsername: referredUser.username,
    sourceUserAvatarUrl: referredUser.avatarUrl,
    sourceText: bonusAmount,
    // Only pass the contract referral details if they weren't referred to a group
    sourceContractCreatorUsername: referredByContract?.creatorUsername,
    sourceContractTitle: referredByContract?.question,
    sourceContractSlug: referredByContract?.slug,
    sourceSlug: referredByContract?.slug,
    sourceTitle: referredByContract?.question,
  }
  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
  // TODO send email notification
}

export const createLoanIncomeNotification = async (
  toUser: User,
  income: number
) => {
  const privateUser = await getPrivateUser(toUser.id)
  if (!privateUser) return
  const { sendToBrowser } = getNotificationDestinationsForUser(
    privateUser,
    'loan_income'
  )
  if (!sendToBrowser) return
  const idempotencyKey = new Date().toDateString().replace(' ', '-')

  const notification: Notification = {
    id: idempotencyKey + '-loan-income-' + income,
    userId: toUser.id,
    reason: 'loan_income',
    createdTime: Date.now(),
    isSeen: true,
    sourceId: idempotencyKey,
    sourceType: 'loan',
    sourceUpdateType: 'updated',
    sourceUserName: toUser.name,
    sourceUserUsername: toUser.username,
    sourceUserAvatarUrl: toUser.avatarUrl,
    sourceText: income.toString(),
    sourceTitle: 'Loan',
  }
  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
}

export const createManaPaymentNotification = async (
  fromUser: User,
  toUserId: string,
  amount: number,
  message: string | undefined
) => {
  const privateUser = await getPrivateUser(toUserId)
  if (!privateUser) return
  const optedOut = userOptedOutOfBrowserNotifications(privateUser)
  if (optedOut) return

  const notification: Notification = {
    id: crypto.randomUUID(),
    userId: toUserId,
    reason: 'mana_payment_received',
    createdTime: Date.now(),
    isSeen: true,
    sourceId: fromUser.id,
    sourceType: 'mana_payment',
    sourceUpdateType: 'created',
    sourceUserName: fromUser.name,
    sourceUserUsername: fromUser.username,
    sourceUserAvatarUrl: fromUser.avatarUrl,
    sourceText: amount.toString(),
    data: {
      message: message ?? '',
    },
    sourceTitle: 'User payments',
  }
  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
}

export const createBettingStreakBonusNotification = async (
  user: User,
  txnId: string,
  bet: Bet,
  contract: Contract,
  amount: number,
  streak: number,
  idempotencyKey: string
) => {
  const privateUser = await getPrivateUser(user.id)
  if (!privateUser) return
  const { sendToBrowser } = getNotificationDestinationsForUser(
    privateUser,
    'betting_streaks'
  )
  if (!sendToBrowser) return

  const notification: Notification = {
    id: idempotencyKey,
    userId: user.id,
    reason: 'betting_streaks',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: txnId,
    sourceType: 'betting_streak_bonus',
    sourceUpdateType: 'created',
    sourceUserName: user.name,
    sourceUserUsername: user.username,
    sourceUserAvatarUrl: user.avatarUrl,
    sourceText: amount.toString(),
    sourceSlug: `/${contract.creatorUsername}/${contract.slug}/bets/${bet.id}`,
    sourceTitle: 'Betting Streak Bonus',
    // Perhaps not necessary, but just in case
    sourceContractSlug: contract.slug,
    sourceContractId: contract.id,
    sourceContractTitle: contract.question,
    sourceContractCreatorUsername: contract.creatorUsername,
    data: {
      streak: streak,
      bonusAmount: amount,
    } as BettingStreakData,
  }
  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
}

export const createBettingStreakExpiringNotification = async (
  userId: string,
  streak: number,
  pg: SupabaseDirectClient
) => {
  const privateUser = await getPrivateUser(userId)
  if (!privateUser) return
  const { sendToBrowser, sendToMobile } = getNotificationDestinationsForUser(
    privateUser,
    'betting_streaks'
  )
  if (!sendToBrowser) return
  const id = crypto.randomUUID()
  const notification: Notification = {
    id,
    userId,
    reason: 'betting_streaks',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: id,
    sourceText: streak.toString(),
    sourceType: 'betting_streak_expiring',
    sourceUpdateType: 'created',
    sourceUserName: '',
    sourceUserUsername: '',
    sourceUserAvatarUrl: '',
    sourceTitle: 'Betting Streak Expiring',
    data: {
      streak: streak,
    } as BettingStreakData,
  }
  await insertNotificationToSupabase(notification, pg)
  if (sendToMobile) {
    return await createPushNotification(
      notification,
      privateUser,
      `${streak} day streak expiring!`,
      'Place a prediction in the next 3 hours to keep it.'
    )
  }
}
export const createLeagueChangedNotification = async (
  userId: string,
  previousLeague: league_user_info | undefined,
  newLeague: { season: number; division: number; cohort: string },
  bonusAmount: number,
  pg: SupabaseDirectClient
) => {
  const privateUser = await getPrivateUser(userId)
  if (!privateUser) return
  const { sendToBrowser } = getNotificationDestinationsForUser(
    privateUser,
    'league_changed'
  )
  if (!sendToBrowser) return

  const id = crypto.randomUUID()
  const data: LeagueChangeData = {
    previousLeague,
    newLeague,
    bonusAmount,
  }
  const notification: Notification = {
    id,
    userId,
    reason: 'league_changed',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: id,
    sourceText: bonusAmount.toString(),
    sourceType: 'league_change',
    sourceUpdateType: 'created',
    sourceUserName: '',
    sourceUserUsername: '',
    sourceUserAvatarUrl: '',
    data,
  }
  await insertNotificationToSupabase(notification, pg)
}

export const createLikeNotification = async (reaction: Reaction) => {
  const { reaction_id, content_owner_id, user_id, content_id, content_type } =
    reaction

  const creatorPrivateUser = await getPrivateUser(content_owner_id)
  const user = await getUser(user_id)

  const db = createSupabaseClient()
  const pg = createSupabaseDirectClient()

  let contractId
  if (content_type === 'contract') {
    contractId = content_id
  } else {
    const { data, error } = await db
      .from('contract_comments')
      .select('contract_id')
      .eq('comment_id', content_id)
    if (error) {
      log('Failed to get contract id: ' + error.message)
      return
    }
    if (!data.length) {
      log('Contract that comment belongs to not found')
      return
    }
    contractId = data[0].contract_id
  }

  const contract = await getContract(pg, contractId)

  if (!creatorPrivateUser || !user || !contract) return

  const { sendToBrowser } = getNotificationDestinationsForUser(
    creatorPrivateUser,
    'user_liked_your_content'
  )
  if (!sendToBrowser) return

  const slug =
    `/${contract.creatorUsername}/${contract.slug}` +
    (content_type === 'comment' ? `#${content_id}` : '')

  let text = ''
  if (content_type === 'contract') {
    text = contract.question
  } else {
    const comment = await getCommentSafe(db, content_id)
    if (comment == null) return

    text = richTextToString(comment?.content)
  }

  const id = `${reaction.user_id}-${reaction_id}`
  const notification: Notification = {
    id,
    userId: content_owner_id,
    reason: 'user_liked_your_content',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: reaction_id,
    sourceType: content_type === 'contract' ? 'contract_like' : 'comment_like',
    sourceUpdateType: 'created',
    sourceUserName: user.name,
    sourceUserUsername: user.username,
    sourceUserAvatarUrl: user.avatarUrl,
    sourceContractId: contractId,
    sourceText: text,
    sourceSlug: slug,
    sourceTitle: contract.question,
  }
  return await insertNotificationToSupabase(notification, pg)
}

export const createNewBettorNotification = async (
  // Creator of contract or answer that was bet on.
  creatorId: string,
  bettor: User,
  contract: Contract,
  uniqueBettorIds: string[],
  bet: Bet,
  bets: Bet[] | undefined
) => {
  const privateUser = await getPrivateUser(creatorId)
  if (!privateUser) return
  const { sendToBrowser, sendToEmail } = getNotificationDestinationsForUser(
    privateUser,
    'unique_bettors_on_your_contract'
  )
  const pg = createSupabaseDirectClient()

  if (sendToBrowser) {
    const { outcomeType } = contract
    const pseudoNumericData =
      outcomeType === 'PSEUDO_NUMERIC'
        ? {
            min: contract.min,
            max: contract.max,
            isLogScale: contract.isLogScale,
          }
        : {}
    const allBetOnAnswerIds = (bets ?? []).map((b) => b.answerId)
    const range =
      outcomeType === 'NUMBER'
        ? getRangeContainingValues(
            contract.answers
              .filter((a) => allBetOnAnswerIds.includes(a.id))
              .map(answerToMidpoint),
            contract
          )
        : undefined

    const notification: Notification = {
      id: crypto.randomUUID(),
      userId: creatorId,
      reason: 'unique_bettors_on_your_contract',
      createdTime: Date.now(),
      isSeen: false,
      sourceId: bet.id,
      sourceType: 'bet',
      sourceUpdateType: 'created',
      sourceUserName: bettor.name,
      sourceUserUsername: bettor.username,
      sourceUserAvatarUrl: bettor.avatarUrl,
      sourceText: '',
      sourceSlug: contract.slug,
      sourceTitle: contract.question,
      // Perhaps not necessary, but just in case
      sourceContractSlug: contract.slug,
      sourceContractId: contract.id,
      sourceContractTitle: contract.question,
      sourceContractCreatorUsername: contract.creatorUsername,
      data: removeUndefinedProps({
        bet,
        answerText:
          outcomeType === 'MULTIPLE_CHOICE'
            ? contract.answers.find(
                (a) => a.id === bet.outcome || a.id === bet.answerId
              )?.text
            : outcomeType === 'NUMBER' && range
            ? `${range[0]}-${range[1]}`
            : undefined,
        outcomeType,
        ...pseudoNumericData,
        totalAmountBet: sumBy(bets, 'amount'),
      } as UniqueBettorData),
    }
    await insertNotificationToSupabase(notification, pg)
  }

  if (!sendToEmail) return
  const uniqueBettorsExcludingCreator = uniqueBettorIds.filter(
    (id) => id !== contract.creatorId
  )
  const TOTAL_NEW_BETTORS_TO_REPORT = 5
  // Only send on 5th bettor
  if (uniqueBettorsExcludingCreator.length !== TOTAL_NEW_BETTORS_TO_REPORT)
    return

  const lastBettorIds = uniqueBettorsExcludingCreator.slice(
    uniqueBettorsExcludingCreator.length - TOTAL_NEW_BETTORS_TO_REPORT,
    uniqueBettorsExcludingCreator.length
  )

  const mostRecentUniqueBettors = await pg.map(
    `select * from users where id in ($1:list)`,
    [lastBettorIds],
    convertUser
  )

  const unseenBets = await pg.map<Bet>(
    `select * from contract_bets where contract_id = $1
            and user_id in ($2:list)`,
    [contract.id, lastBettorIds],
    convertBet
  )

  const bettorsToTheirBets = groupBy(unseenBets, (bet) => bet.userId)

  // Don't send if creator has seen their market since the 1st bet was placed
  const creatorHasSeenMarketSinceBet = await hasUserSeenMarket(
    contract.id,
    privateUser.id,
    minBy(unseenBets, 'createdTime')?.createdTime ?? contract.createdTime,
    pg
  )
  if (creatorHasSeenMarketSinceBet) return

  await sendNewUniqueBettorsEmail(
    'unique_bettors_on_your_contract',
    privateUser,
    contract,
    uniqueBettorsExcludingCreator.length,
    mostRecentUniqueBettors,
    bettorsToTheirBets
  )
}

export const createNewContractNotification = async (
  contractCreator: User,
  contract: Contract,
  idempotencyKey: string,
  text: string,
  mentionedUserIds: string[]
) => {
  const pg = createSupabaseDirectClient()
  const bulkNotifications: Notification[] = []
  const followerUserIds = await getUserFollowerIds(contractCreator.id, pg)

  const privateUsers = await pg.map(
    'select * from private_users where id = any($1)',
    [followerUserIds],
    convertPrivateUser
  )
  const privateUserMap = new Map(privateUsers.map((user) => [user.id, user]))
  const sendNotificationsIfSettingsAllow = async (
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
    if (sendToEmail && reason === 'contract_from_followed_user')
      await sendNewFollowedMarketEmail(reason, userId, privateUser, contract)
  }

  // As it is coded now, the tag notification usurps the new contract notification
  // It'd be easy to append the reason to the eventId if desired
  if (contract.visibility == 'public') {
    await mapAsync(
      followerUserIds,
      (userId) =>
        sendNotificationsIfSettingsAllow(userId, 'contract_from_followed_user'),
      20
    )
  }
  await mapAsync(
    mentionedUserIds,
    (userId) => sendNotificationsIfSettingsAllow(userId, 'tagged_user'),
    20
  )
  await bulkInsertNotifications(bulkNotifications, pg)
}

export const createContractResolvedNotifications = async (
  contract: Contract,
  resolver: User,
  creator: User,
  outcome: string,
  probabilityInt: number | undefined,
  resolutionValue: number | undefined,
  answerId: string | undefined,
  resolutionData: {
    userIdToContractMetrics: {
      [userId: string]: ReturnType<typeof getContractBetMetrics>
    }
    userPayouts: { [userId: string]: number }
    creatorPayout: number
    resolutionProbability?: number
    resolutions?: { [outcome: string]: number }
  }
) => {
  let resolutionText = outcome ?? contract.question

  const isIndependentMulti =
    contract.outcomeType === 'MULTIPLE_CHOICE' &&
    contract.mechanism === 'cpmm-multi-1' &&
    !contract.shouldAnswersSumToOne

  if (isIndependentMulti) {
    const answer = contract.answers.find((answer) => answer.id === answerId)
    resolutionText = `${answer?.text ?? ''}: ${renderResolution(
      outcome,
      probabilityInt !== undefined ? probabilityInt / 100 : answer?.prob
    )}`
  } else if (contract.outcomeType === 'MULTIPLE_CHOICE') {
    const answerText = contract.answers.find(
      (answer) => answer.id === outcome
    )?.text
    if (answerText) resolutionText = answerText
    else if (outcome === 'CHOOSE_MULTIPLE') resolutionText = 'multiple answers'
  } else if (contract.outcomeType === 'BINARY') {
    if (resolutionText === 'MKT' && probabilityInt)
      resolutionText = `${probabilityInt}%`
    else if (resolutionText === 'MKT') resolutionText = 'PROB'
  } else if (contract.outcomeType === 'PSEUDO_NUMERIC') {
    if (resolutionText === 'MKT' && resolutionValue)
      resolutionText = `${resolutionValue}`
  } else if (contract.outcomeType === 'NUMBER') {
    const resolvedAnswers = contract.answers.filter((a) =>
      Object.keys(resolutionData.resolutions ?? {}).includes(a.id)
    )
    resolutionText = resolvedAnswers.map((a) => a.text).join(', ')
  }
  const bulkNotifications: Notification[] = []

  const {
    userIdToContractMetrics,
    userPayouts,
    creatorPayout,
    resolutionProbability,
    resolutions,
  } = resolutionData

  const sortedProfits = Object.entries(userIdToContractMetrics)
    .map(([userId, metrics]) => {
      const profit = metrics.profit ?? 0
      return { userId, profit }
    })
    .sort((a, b) => b.profit - a.profit)
  const pg = createSupabaseDirectClient()
  const constructNotification = (
    userId: string,
    reason: NotificationReason
  ): Notification => {
    return {
      id: crypto.randomUUID(),
      userId,
      reason,
      createdTime: Date.now(),
      isSeen: false,
      sourceId: contract.id,
      sourceType: 'contract',
      sourceUpdateType: 'resolved',
      sourceContractId: contract.id,
      sourceUserName: resolver.name,
      sourceUserUsername: resolver.username,
      sourceUserAvatarUrl: resolver.avatarUrl,
      sourceText: resolutionText,
      sourceContractCreatorUsername: contract.creatorUsername,
      sourceContractTitle: contract.question,
      sourceContractSlug: contract.slug,
      sourceSlug: contract.slug,
      sourceTitle: contract.question,
      data: removeUndefinedProps({
        outcome,
        answerId,
        userInvestment: userIdToContractMetrics?.[userId]?.invested ?? 0,
        userPayout: userPayouts[userId] ?? 0,
        profitRank: sortedProfits.findIndex((p) => p.userId === userId) + 1,
        totalShareholders: sortedProfits.length,
        profit: userIdToContractMetrics?.[userId]?.profit ?? 0,
      }) as ContractResolutionData,
    }
  }

  const sendNotificationsIfSettingsPermit = async (
    userId: string,
    reason: NotificationReason
  ) => {
    const privateUser = await getPrivateUser(userId)
    if (!privateUser) return
    const { sendToBrowser, sendToEmail, sendToMobile } =
      getNotificationDestinationsForUser(privateUser, reason)

    // Browser notifications
    if (sendToBrowser) {
      bulkNotifications.push(constructNotification(userId, reason))
    }

    // Emails notifications
    if (sendToEmail && !contract.isTwitchContract)
      await sendMarketResolutionEmail(
        reason,
        privateUser,
        userIdToContractMetrics?.[userId]?.invested ?? 0,
        userPayouts[userId] ?? 0,
        creator,
        creatorPayout,
        contract,
        outcome,
        resolutionProbability,
        resolutions,
        answerId
      )

    if (sendToMobile) {
      const notification = constructNotification(userId, reason)
      const { userPayout, profitRank, userInvestment, totalShareholders } =
        notification.data as ContractResolutionData
      const betterThan = (totalShareholders ?? 0) - (profitRank ?? 0)
      const comparison =
        profitRank && totalShareholders && betterThan > 0
          ? `, outperforming ${betterThan} other${betterThan > 1 ? 's' : ''}!`
          : '.'
      const profit = userPayout - userInvestment
      const profitPercent = Math.round((profit / userInvestment) * 100)
      const profitString = ` You made M${Math.round(
        profit
      )} (+${profitPercent}%)`
      const lossString = ` You lost M${Math.round(-profit)}`
      await createPushNotification(
        notification,
        privateUser,
        contract.question.length > 50
          ? contract.question.slice(0, 50) + '...'
          : contract.question,
        `Resolved: ${resolutionText}.` +
          (userInvestment === 0 || outcome === 'CANCEL'
            ? ''
            : (profit > 0 ? profitString : lossString) + comparison)
      )
    }
  }

  const followerIds = await pg.manyOrNone<{ follow_id: string }>(
    `select follow_id from contract_follows where contract_id = $1`,
    [contract.id]
  )
  const contractFollowersIds = followerIds.map((f) => f.follow_id)
  // We ignore whether users are still watching a market if they have a payout, mainly
  // bc market resolutions changes their profits, and they'll likely want to know, esp. if NA resolution
  const usersToNotify = uniq(
    buildArray(
      !isIndependentMulti && contractFollowersIds,
      Object.keys(userPayouts)
    ).filter((id) => id !== resolver.id)
  )

  await mapAsync(
    usersToNotify,
    (id) =>
      sendNotificationsIfSettingsPermit(
        id,
        userIdToContractMetrics?.[id]?.invested
          ? 'resolutions_on_watched_markets_with_shares_in'
          : 'resolutions_on_watched_markets'
      ),
    20
  )
  await bulkInsertNotifications(bulkNotifications, pg)
}

export const createMarketClosedNotification = async (
  contract: Contract,
  creator: User,
  privateUser: PrivateUser,
  idempotencyKey: string
) => {
  const notification: Notification = {
    id: idempotencyKey,
    userId: creator.id,
    reason: 'your_contract_closed',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: contract.id,
    sourceType: 'contract',
    sourceUpdateType: 'closed',
    sourceContractId: contract?.id,
    sourceUserName: creator.name,
    sourceUserUsername: creator.username,
    sourceUserAvatarUrl: creator.avatarUrl,
    sourceText: contract.closeTime?.toString() ?? new Date().toString(),
    sourceContractCreatorUsername: creator.username,
    sourceContractTitle: contract.question,
    sourceContractSlug: contract.slug,
    sourceSlug: contract.slug,
    sourceTitle: contract.question,
  }
  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
  await sendMarketCloseEmail(
    'your_contract_closed',
    creator,
    privateUser,
    contract
  )
}
export const createWeeklyPortfolioUpdateNotification = async (
  privateUser: PrivateUser,
  userUsername: string,
  weeklyProfit: number,
  rangeEndDateSlug: string
) => {
  const { sendToBrowser } = getNotificationDestinationsForUser(
    privateUser,
    'profit_loss_updates'
  )
  if (!sendToBrowser) return

  const id = rangeEndDateSlug + 'weekly_portfolio_update'

  const notification: Notification = {
    id,
    userId: privateUser.id,
    reason: 'profit_loss_updates',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: id,
    sourceType: 'weekly_portfolio_update',
    sourceUpdateType: 'created',
    sourceUserName: '',
    sourceUserUsername: userUsername,
    sourceUserAvatarUrl: '',
    sourceText: '',
    sourceSlug: rangeEndDateSlug,
    sourceTitle: `Weekly Portfolio Update for ${rangeEndDateSlug}`,
    data: {
      weeklyProfit,
      rangeEndDateSlug,
    },
  }
  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
}

export const createQuestPayoutNotification = async (
  user: User,
  txnId: string,
  payoutAmount: number,
  questCount: number,
  questType: QuestType
) => {
  const privateUser = await getPrivateUser(user.id)
  if (!privateUser) return
  const { sendToBrowser } = getNotificationDestinationsForUser(
    privateUser,
    'quest_payout'
  )
  if (!sendToBrowser) return

  const notification: Notification = {
    id: txnId,
    userId: user.id,
    reason: 'quest_payout',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: txnId,
    sourceType: 'quest_reward',
    sourceUpdateType: 'created',
    sourceUserName: user.name,
    sourceUserUsername: user.username,
    sourceUserAvatarUrl: user.avatarUrl,
    sourceText: payoutAmount.toString(),
    sourceTitle: 'Quests',
    data: {
      questType,
      questCount,
    } as QuestRewardTxn['data'],
  }
  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
}

export const createBountyAwardedNotification = async (
  userId: string,
  bountyContract: Contract,
  txnId: string,
  bountyAmount: number
) => {
  const privateUser = await getPrivateUser(userId)
  if (!privateUser) return
  if (userOptedOutOfBrowserNotifications(privateUser)) return
  const notification: Notification = {
    id: crypto.randomUUID(),
    userId: userId,
    reason: 'bounty_awarded',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: txnId,
    sourceType: 'contract',
    sourceUserName: bountyContract.creatorName,
    sourceUserUsername: bountyContract.creatorUsername,
    sourceUserAvatarUrl: bountyContract.creatorAvatarUrl ?? '',
    sourceContractCreatorUsername: bountyContract.creatorUsername,
    sourceText: bountyAmount.toString(),
    sourceContractTitle: bountyContract.question,
    sourceContractSlug: bountyContract.slug,
    sourceContractId: txnId,
  }
  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
}

export const createBountyAddedNotification = async (
  userId: string,
  bountyContract: Contract,
  txnId: string,
  bountyAmount: number
) => {
  const privateUser = await getPrivateUser(userId)
  const sender = await getUser(txnId)
  if (!privateUser || !sender) return
  if (userOptedOutOfBrowserNotifications(privateUser)) return
  const notification: Notification = {
    id: crypto.randomUUID(),
    userId: userId,
    reason: 'bounty_added',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: txnId,
    sourceType: 'user',
    sourceUserName: sender.name,
    sourceUserUsername: sender.username,
    sourceUserAvatarUrl: sender.avatarUrl ?? '',
    sourceContractCreatorUsername: bountyContract.creatorUsername,
    sourceText: bountyAmount.toString(),
    sourceContractTitle: bountyContract.question,
    sourceContractSlug: bountyContract.slug,
    sourceContractId: bountyContract.id,
  }
  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
}

export const createBountyCanceledNotification = async (
  contract: Contract,
  amountLeft: number
) => {
  const pg = createSupabaseDirectClient()

  const followerIds = await pg.manyOrNone<{ follow_id: string }>(
    `select follow_id from contract_follows where contract_id = $1`,
    [contract.id]
  )
  const contractFollowersIds = mapValues(
    keyBy(followerIds, 'follow_id'),
    () => true
  )
  const constructNotification = (
    userId: string,
    reason: notification_preference
  ): Notification => {
    return {
      id: crypto.randomUUID(),
      userId,
      reason,
      createdTime: Date.now(),
      isSeen: false,
      sourceId: contract.id,
      sourceType: 'contract',
      sourceContractId: contract.id,
      sourceUserName: contract.creatorName,
      sourceUserUsername: contract.creatorUsername,
      sourceUserAvatarUrl: contract.creatorAvatarUrl ?? '',
      sourceText: formatMoney(amountLeft),
      sourceContractCreatorUsername: contract.creatorUsername,
      sourceContractTitle: contract.question,
      sourceContractSlug: contract.slug,
      sourceSlug: contract.slug,
      sourceTitle: contract.question,
    }
  }

  const sendNotificationsIfSettingsPermit = async (
    userId: string,
    reason: notification_reason_types
  ) => {
    const privateUser = await getPrivateUser(userId)
    if (!privateUser) return
    const { sendToBrowser } = getNotificationDestinationsForUser(
      privateUser,
      reason
    )

    // Browser notifications
    if (sendToBrowser) {
      await insertNotificationToSupabase(
        constructNotification(userId, 'bounty_canceled'),
        pg
      )
    }
  }

  const notifyContractFollowers = async () => {
    await mapAsync(
      Object.keys(contractFollowersIds),
      async (userId) => {
        if (userId !== contract.creatorId) {
          return sendNotificationsIfSettingsPermit(userId, 'bounty_canceled')
        }
      },
      20
    )
  }

  log('notifying followers')
  await notifyContractFollowers()
}

export const createVotedOnPollNotification = async (
  voterId: string,
  sourceText: string,
  sourceContract: Contract
) => {
  const pg = createSupabaseDirectClient()
  const voter = await getUser(voterId)
  if (!voter) return

  const usersToReceivedNotifications: Record<
    string,
    notification_destination_types[]
  > = {}

  const followerIds = await pg.manyOrNone<{ follow_id: string }>(
    `select follow_id from contract_follows where contract_id = $1`,
    [sourceContract.id]
  )
  const contractFollowersIds = mapValues(
    keyBy(followerIds, 'follow_id'),
    () => true
  )

  const constructNotification = (
    userId: string,
    reason: notification_preference
  ) => {
    const notification: Notification = {
      id: crypto.randomUUID(),
      userId,
      reason,
      createdTime: Date.now(),
      isSeen: false,
      sourceId: sourceContract.id,
      sourceType: 'contract',
      sourceContractId: sourceContract.id,
      sourceUserName: voter.name,
      sourceUserUsername: voter.username,
      sourceUserAvatarUrl: voter.avatarUrl,
      sourceText,
      sourceContractCreatorUsername: sourceContract.creatorUsername,
      sourceContractTitle: sourceContract.question,
      sourceContractSlug: sourceContract.slug,
      sourceSlug: sourceContract.slug,
      sourceTitle: sourceContract.question,
    }
    return removeUndefinedProps(notification)
  }

  const stillFollowingContract = (userId: string) => {
    // Should be better performance than includes
    return contractFollowersIds[userId] !== undefined
  }

  const sendNotificationsIfSettingsPermit = async (
    userId: string,
    reason: notification_preference
  ) => {
    // A user doesn't have to follow a market to receive a notification with their tag
    if (!stillFollowingContract(userId) || voter.id == userId) return
    const privateUser = await getPrivateUser(userId)
    if (!privateUser) return
    if (userIsBlocked(privateUser, voter.id)) return

    const { sendToBrowser } = getNotificationDestinationsForUser(
      privateUser,
      reason
    )

    const receivedNotifications = usersToReceivedNotifications[userId] ?? []

    // Browser notifications
    if (sendToBrowser && !receivedNotifications.includes('browser')) {
      const notification = constructNotification(userId, reason)
      await insertNotificationToSupabase(notification, pg)
      receivedNotifications.push('browser')
    }
  }

  const notifyContractFollowers = async () => {
    await mapAsync(
      Object.keys(contractFollowersIds),
      async (userId) => {
        if (userId !== sourceContract.creatorId) {
          return sendNotificationsIfSettingsPermit(
            userId,
            'all_votes_on_watched_markets'
          )
        }
      },
      20
    )
  }

  const notifyContractCreator = async () => {
    await sendNotificationsIfSettingsPermit(
      sourceContract.creatorId,
      'vote_on_your_contract'
    )
  }
  log('notifying creator')
  await notifyContractCreator()
  log('notifying followers')
  await notifyContractFollowers()
}

export const createPollClosedNotification = async (
  sourceText: string,
  sourceContract: Contract
) => {
  const pg = createSupabaseDirectClient()
  const usersToReceivedNotifications: Record<
    string,
    notification_destination_types[]
  > = {}

  const followerIds = await pg.manyOrNone<{ follow_id: string }>(
    `select follow_id from contract_follows where contract_id = $1`,
    [sourceContract.id]
  )
  const contractFollowersIds = mapValues(
    keyBy(followerIds, 'follow_id'),
    () => true
  )

  const constructNotification = (
    userId: string,
    reason: NotificationReason
  ) => {
    const notification: Notification = {
      id: crypto.randomUUID(),
      userId,
      reason,
      createdTime: Date.now(),
      isSeen: false,
      sourceId: sourceContract.id,
      sourceType: 'contract',
      sourceContractId: sourceContract.id,
      sourceUserName: sourceContract.creatorName,
      sourceUserUsername: sourceContract.creatorUsername,
      sourceUserAvatarUrl: sourceContract.creatorAvatarUrl ?? '',
      sourceText,
      sourceContractCreatorUsername: sourceContract.creatorUsername,
      sourceContractTitle: sourceContract.question,
      sourceContractSlug: sourceContract.slug,
      sourceSlug: sourceContract.slug,
      sourceTitle: sourceContract.question,
    }
    return removeUndefinedProps(notification)
  }

  const stillFollowingContract = (userId: string) => {
    // Should be better performance than includes
    return contractFollowersIds[userId] !== undefined
  }

  const sendNotificationsIfSettingsPermit = async (
    userId: string,
    reason: NotificationReason
  ) => {
    // A user doesn't have to follow a market to receive a notification with their tag
    if (!stillFollowingContract(userId)) return
    const privateUser = await getPrivateUser(userId)
    if (!privateUser) return
    if (userIsBlocked(privateUser, sourceContract.creatorId)) return

    const { sendToBrowser } = getNotificationDestinationsForUser(
      privateUser,
      reason
    )

    const receivedNotifications = usersToReceivedNotifications[userId] ?? []

    // Browser notifications
    if (sendToBrowser && !receivedNotifications.includes('browser')) {
      const notification = constructNotification(userId, reason)
      await insertNotificationToSupabase(notification, pg)
      receivedNotifications.push('browser')
    }
  }

  const notifyContractFollowers = async () => {
    await mapAsync(
      Object.keys(contractFollowersIds),
      async (userId) => {
        if (userId !== sourceContract.creatorId) {
          return sendNotificationsIfSettingsPermit(
            userId,
            'poll_close_on_watched_markets'
          )
        }
      },
      20
    )
  }

  const notifyContractCreator = async () => {
    await sendNotificationsIfSettingsPermit(
      sourceContract.creatorId,
      'your_poll_closed'
    )
  }
  log('notifying creator')
  await notifyContractCreator()
  log('notifying followers')
  await notifyContractFollowers()
}

export const createReferralsProgramNotification = async (
  userId: string,
  pg: SupabaseDirectClient
) => {
  const privateUser = await getPrivateUser(userId)
  if (!privateUser) return

  if (!userOptedOutOfBrowserNotifications(privateUser)) {
    const notification: Notification = {
      id: userId + 'referrals-program',
      userId: privateUser.id,
      reason: 'onboarding_flow',
      createdTime: Date.now(),
      isSeen: false,
      sourceId: crypto.randomUUID(),
      sourceType: 'referral_program',
      sourceUpdateType: 'created',
      sourceUserName: '',
      sourceUserUsername: '',
      sourceUserAvatarUrl: '',
      sourceText: '',
    }
    await insertNotificationToSupabase(notification, pg)
  }
}
export const createFollowAfterReferralNotification = async (
  userId: string,
  referredByUser: User,
  pg: SupabaseDirectClient
) => {
  const privateUser = await getPrivateUser(userId)
  if (!privateUser) return

  if (!userOptedOutOfBrowserNotifications(privateUser)) {
    const notification: Notification = {
      id: referredByUser.id + 'follow-after-referral',
      userId: privateUser.id,
      reason: 'onboarding_flow',
      createdTime: Date.now(),
      isSeen: false,
      sourceId: referredByUser.id,
      sourceType: 'follow',
      sourceUpdateType: 'created',
      sourceUserName: referredByUser.name,
      sourceUserUsername: referredByUser.username,
      sourceUserAvatarUrl: referredByUser.avatarUrl,
      sourceText: '',
    }
    await insertNotificationToSupabase(notification, pg)
  }
}

export const createFollowSuggestionNotification = async (
  userId: string,
  contract: Contract,
  pg: SupabaseDirectClient
) => {
  const privateUser = await getPrivateUser(userId)
  if (!privateUser) return
  const id = crypto.randomUUID()
  const contractCreator = await getUser(contract.creatorId)
  if (!contractCreator) return

  if (!userOptedOutOfBrowserNotifications(privateUser)) {
    const notification: Notification = {
      id,
      userId: privateUser.id,
      reason: 'onboarding_flow',
      createdTime: Date.now(),
      isSeen: false,
      sourceId: id,
      sourceType: 'follow_suggestion',
      sourceUpdateType: 'created',
      sourceUserName: contractCreator.name,
      sourceUserUsername: contractCreator.username,
      sourceUserAvatarUrl: contractCreator.avatarUrl,
      sourceText: '',
    }
    await insertNotificationToSupabase(notification, pg)
  }
}
export const createMarketReviewedNotification = async (
  userId: string,
  reviewer: User,
  contract: Contract,
  rating: number,
  review: string,
  pg: SupabaseDirectClient
) => {
  const privateUser = await getPrivateUser(userId)
  if (!privateUser) return
  const id = crypto.randomUUID()
  const reason = 'review_on_your_market'
  const { sendToBrowser } = getNotificationDestinationsForUser(
    privateUser,
    reason
  )
  if (sendToBrowser) {
    const notification: Notification = {
      id,
      userId: privateUser.id,
      reason,
      createdTime: Date.now(),
      isSeen: false,
      sourceId: id,
      sourceType: 'market_review',
      sourceUpdateType: 'created',
      sourceUserName: reviewer.name,
      sourceUserUsername: reviewer.username,
      sourceUserAvatarUrl: reviewer.avatarUrl,
      sourceContractId: contract.id,
      sourceContractSlug: contract.slug,
      sourceContractTitle: contract.question,
      sourceContractCreatorUsername: contract.creatorUsername,
      sourceTitle: contract.question,
      sourceSlug: contract.slug,
      sourceText: '',
      data: {
        rating,
        review,
      } as ReviewNotificationData,
    }
    await insertNotificationToSupabase(notification, pg)
  }
}
export const createBetReplyToCommentNotification = async (
  userId: string,
  contract: Contract,
  bet: Bet,
  fromUser: User,
  comment: ContractComment,
  pg: SupabaseDirectClient
) => {
  const privateUser = await getPrivateUser(userId)
  if (!privateUser) return
  const reason = 'reply_to_users_comment'
  const { sendToBrowser } = getNotificationDestinationsForUser(
    privateUser,
    reason
  )
  if (sendToBrowser) {
    const notification: Notification = {
      id: bet.id + 'reply-to' + comment.id,
      userId: privateUser.id,
      reason,
      createdTime: Date.now(),
      isSeen: false,
      sourceId: bet.id,
      sourceType: 'bet_reply',
      sourceUpdateType: 'created',
      sourceUserName: fromUser.name,
      sourceUserUsername: fromUser.username,
      sourceUserAvatarUrl: fromUser.avatarUrl,
      sourceContractId: contract.id,
      sourceContractSlug: contract.slug,
      sourceContractTitle: contract.question,
      sourceContractCreatorUsername: contract.creatorUsername,
      sourceTitle: contract.question,
      sourceSlug: contract.slug,
      sourceText: '',
      data: {
        betAmount: bet.amount,
        betOutcome: bet.outcome,
        commentText: richTextToString(comment.content).slice(0, 250),
      } as BetReplyNotificationData,
    }
    await insertNotificationToSupabase(notification, pg)
  }
}

export const createPushNotificationBonusNotification = async (
  privateUser: PrivateUser,
  txnId: string,
  amount: number,
  idempotencyKey: string
) => {
  if (userOptedOutOfBrowserNotifications(privateUser)) return

  const notification: Notification = {
    id: idempotencyKey,
    userId: privateUser.id,
    reason: 'onboarding_flow',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: txnId,
    sourceType: 'push_notification_bonus',
    sourceUpdateType: 'created',
    sourceUserName: MANIFOLD_USER_NAME,
    sourceUserUsername: MANIFOLD_USER_USERNAME,
    sourceUserAvatarUrl: MANIFOLD_AVATAR_URL,
    sourceText: amount.toString(),
    sourceTitle: 'Push Notification Bonus',
  }
  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
}

export const createAirdropNotification = async (
  user: User,
  idempotencyKey: string,
  amount: number
) => {
  const notification: Notification = {
    id: idempotencyKey,
    userId: user.id,
    reason: 'airdrop',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: 'airdrop',
    sourceType: 'airdrop',
    sourceUpdateType: 'created',
    sourceUserName: user.name,
    sourceUserUsername: user.username,
    sourceUserAvatarUrl: user.avatarUrl,
    sourceText: '',
    data: {
      amount,
    },
  }

  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
}

export const createManifestAirdropNotification = async (
  user: User,
  idempotencyKey: string,
  amount: number
) => {
  const notification: Notification = {
    id: idempotencyKey,
    userId: user.id,
    reason: 'manifest_airdrop',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: 'manifest_airdrop',
    sourceType: 'manifest_airdrop',
    sourceUpdateType: 'created',
    sourceUserName: user.name,
    sourceUserUsername: user.username,
    sourceUserAvatarUrl: user.avatarUrl,
    sourceText: '',
    data: {
      amount,
    },
  }

  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
}

export const createExtraPurchasedManaNotification = async (
  user: User,
  idempotencyKey: string,
  amount: number
) => {
  const notification: Notification = {
    id: idempotencyKey,
    userId: user.id,
    reason: 'extra_purchased_mana',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: 'extra_purchased_mana',
    sourceType: 'extra_purchased_mana',
    sourceUpdateType: 'created',
    sourceUserName: user.name,
    sourceUserUsername: user.username,
    sourceUserAvatarUrl: user.avatarUrl,
    sourceText: '',
    data: {
      amount,
    },
  }

  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
}
