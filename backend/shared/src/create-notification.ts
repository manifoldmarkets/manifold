import { getContractBetMetrics } from 'common/calculate'
import * as admin from 'firebase-admin'
import {
  BetFillData,
  BetReplyNotificationData,
  BettingStreakData,
  CommentNotificationData,
  ContractResolutionData,
  LeagueChangeData,
  love_notification_source_types,
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
import { Contract, MultiContract, renderResolution } from 'common/contract'
import {
  getContract,
  getPrivateUser,
  getUser,
  getValues,
  log,
} from 'shared/utils'
import { ContractComment } from 'common/comment'
import { groupBy, keyBy, mapValues, minBy, sum, uniq } from 'lodash'
import { Bet, LimitBet } from 'common/bet'
import { Answer } from 'common/answer'
import { removeUndefinedProps } from 'common/util/object'
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
import { formatMoney, getMoneyNumber } from 'common/util/format'
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
import { isManifoldLoveContract } from 'common/love/constants'
import { buildArray, filterDefined } from 'common/util/array'
import { isAdminId, isModId } from 'common/envs/constants'
import { insertNotificationToSupabase } from 'shared/supabase/notifications'
import { getCommentSafe } from './supabase/contract_comments'
import { convertUser } from 'common/supabase/users'

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
    repliedToId: string | undefined
    bet: Bet | undefined
  }
}
const ALL_TRADERS_ID = 'X3z4hxRXipWvGoFhxlDOVxmP5vL2'
// TODO: remove contract updated from this, seems out of place
export const createCommentOrAnswerOrUpdatedContractNotification = async (
  sourceId: string,
  sourceType: 'comment' | 'answer' | 'contract',
  sourceUpdateType: 'created' | 'updated',
  sourceUser: User,
  idempotencyKey: string,
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
  const constructNotification = (
    userId: string,
    reason: NotificationReason
  ) => {
    const notification: Notification = {
      id: idempotencyKey,
      userId,
      reason,
      createdTime: Date.now(),
      isSeen: false,
      sourceId,
      sourceType: isManifoldLoveContract(sourceContract)
        ? (`love_${sourceType}` as love_notification_source_types)
        : sourceType,
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
      data: {
        isReply: sourceType === 'comment' && !!repliedUsersInfo,
      } as CommentNotificationData,
    }
    return removeUndefinedProps(notification)
  }

  const needNotFollowContractReasons = ['tagged_user']

  const sendNotificationsIfSettingsPermit = async (
    userId: string,
    reason: NotificationReason
  ) => {
    // A user doesn't have to follow a market to receive a notification with their tag
    if (
      (!followerIds.some((id) => id === userId) &&
        !needNotFollowContractReasons.includes(reason)) ||
      sourceUser.id == userId
    )
      return
    const privateUser = await getPrivateUser(userId)
    if (!privateUser) return
    if (userIsBlocked(privateUser, sourceUser.id)) return

    const { sendToBrowser, sendToEmail, sendToMobile, notificationPreference } =
      getNotificationDestinationsForUser(privateUser, reason)

    const receivedNotifications = usersToReceivedNotifications[userId] ?? []

    // Browser notifications
    if (sendToBrowser && !receivedNotifications.includes('browser')) {
      const notification = constructNotification(userId, reason)
      await insertNotificationToSupabase(notification, pg)
      receivedNotifications.push('browser')
    }

    // Mobile push notifications
    if (sendToMobile && !receivedNotifications.includes('mobile')) {
      const reasonText =
        (notificationPreference &&
          NOTIFICATION_DESCRIPTIONS[notificationPreference].verb) ??
        'commented'
      const notification = constructNotification(userId, reason)
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
      if (sourceType === 'comment') {
        const { repliedToType, repliedToAnswerText, repliedToId, bet } =
          repliedUsersInfo?.[userId] ?? {}
        // TODO: change subject of email title to be more specific, i.e.: replied to you on/tagged you on/comment
        await sendNewCommentEmail(
          reason,
          privateUser,
          sourceUser,
          sourceContract,
          sourceText,
          sourceId,
          bet,
          repliedToAnswerText,
          repliedToType === 'answer' ? repliedToId : undefined
        )
        receivedNotifications.push('email')
      } else if (sourceType === 'answer') {
        await sendNewAnswerEmail(
          reason,
          privateUser,
          sourceUser.name,
          sourceText,
          sourceContract,
          sourceUser.avatarUrl
        )
        receivedNotifications.push('email')
      }
    }
    usersToReceivedNotifications[userId] = receivedNotifications
  }

  const notifyContractFollowers = async () => {
    await Promise.all(
      followerIds.map((userId) =>
        sendNotificationsIfSettingsPermit(
          userId,
          sourceType === 'answer'
            ? 'answer_on_contract_you_follow'
            : sourceType === 'comment'
            ? 'comment_on_contract_you_follow'
            : 'update_on_contract_you_follow'
        )
      )
    )
  }

  const notifyContractCreator = async () => {
    await sendNotificationsIfSettingsPermit(
      sourceContract.creatorId,
      sourceType === 'comment'
        ? 'all_comments_on_my_markets'
        : 'all_answers_on_my_markets'
    )
  }

  const notifyOtherAnswerersOnContract = async () => {
    const dpmAnswererIds = await pg.map(
      `select distinct data->>'userId' as user_id from contract_answers where contract_id = $1`,
      [sourceContract.id],
      (r) => r.user_id as string
    )
    const cpmmAnswererIds = await pg.map(
      `select distinct user_id from answers where contract_id = $1`,
      [sourceContract.id],
      (r) => r.user_id as string
    )
    const recipientUserIds = uniq(dpmAnswererIds.concat(cpmmAnswererIds))

    await Promise.all(
      recipientUserIds.map((userId) =>
        sendNotificationsIfSettingsPermit(
          userId,
          sourceType === 'answer'
            ? 'answer_on_contract_with_users_answer'
            : sourceType === 'comment'
            ? 'comment_on_contract_with_users_answer'
            : 'update_on_contract_with_users_answer'
        )
      )
    )
  }

  const notifyOtherCommentersOnContract = async () => {
    const commenterIds = await pg.map(
      `select distinct user_id from contract_comments where contract_id = $1`,
      [sourceContract.id],
      (r) => r.user_id as string
    )
    await Promise.all(
      commenterIds.map((userId) =>
        sendNotificationsIfSettingsPermit(
          userId,
          sourceType === 'answer'
            ? 'answer_on_contract_with_users_comment'
            : sourceType === 'comment'
            ? 'comment_on_contract_with_users_comment'
            : 'update_on_contract_with_users_comment'
        )
      )
    )
  }

  const notifyBettorsOnContract = async () => {
    // We don't need to filter by shares in bc they auto unfollow a market upon selling out of it
    // Unhandled case sacrificed for performance: they bet in a market, sold out,
    // then re-followed it - their notification reason should not include 'with_shares_in'
    const recipientUserIds = await getUniqueBettorIds(sourceContract.id, pg)

    await Promise.all(
      recipientUserIds.map((userId) =>
        sendNotificationsIfSettingsPermit(
          userId,
          sourceType === 'answer'
            ? 'answer_on_contract_with_users_shares_in'
            : sourceType === 'comment'
            ? 'comment_on_contract_with_users_shares_in'
            : 'update_on_contract_with_users_shares_in'
        )
      )
    )
  }

  const notifyRepliedUser = async () => {
    if (sourceType === 'comment' && repliedUsersInfo)
      await Promise.all(
        Object.keys(repliedUsersInfo).map((userId) =>
          sendNotificationsIfSettingsPermit(
            userId,
            repliedUsersInfo[userId].repliedToType === 'answer'
              ? 'reply_to_users_answer'
              : 'reply_to_users_comment'
          )
        )
      )
  }

  const notifyTaggedUsers = async () => {
    if (sourceType === 'comment' && taggedUserIds && taggedUserIds.length > 0) {
      if (
        taggedUserIds.includes(ALL_TRADERS_ID) &&
        (sourceUser.id === sourceContract.creatorId ||
          isAdminId(sourceUser.id) ||
          isModId(sourceUser.id))
      ) {
        const allBettors = await getUniqueBettorIds(sourceContract.id, pg)
        const allVoters = await getUniqueVoterIds(sourceContract.id, pg)
        const allUsers = uniq(allBettors.concat(allVoters))
        taggedUserIds.push(...allUsers)
      }
      await Promise.all(
        uniq(taggedUserIds).map((userId) =>
          sendNotificationsIfSettingsPermit(userId, 'tagged_user')
        )
      )
    }
  }

  const notifyLiquidityProviders = async () => {
    const liquidityProviderIds = await pg.map(
      `select distinct data->>'userId' as user_id from contract_liquidity where contract_id = $1`,
      [sourceContract.id],
      (r) => r.user_id as string
    )
    await Promise.all(
      liquidityProviderIds.map((userId) =>
        sendNotificationsIfSettingsPermit(
          userId,
          sourceType === 'answer'
            ? 'answer_on_contract_with_users_shares_in'
            : sourceType === 'comment'
            ? 'comment_on_contract_with_users_shares_in'
            : 'update_on_contract_with_users_shares_in'
        )
      )
    )
  }

  //TODO: store all possible reasons why the user might be getting the notification
  // and choose the most lenient that they have enabled so they will unsubscribe
  // from the least important notifications
  log('notifying replies')
  await notifyRepliedUser()
  log('notifying tagged users')
  await notifyTaggedUsers()
  log('notifying creator')
  await notifyContractCreator()
  log('notifying answerers')
  await notifyOtherAnswerersOnContract()
  log('notifying lps')
  await notifyLiquidityProviders()
  log('notifying bettors')
  await notifyBettorsOnContract()
  log('notifying commenters')
  await notifyOtherCommentersOnContract()
  // if they weren't notified previously, notify them now
  log('notifying followers')
  await notifyContractFollowers()
}

export const createBetFillNotification = async (
  fromUser: User,
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

  const fill = limitBet.fills.find((fill) => fill.matchedBetId === bet.id)
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

  const contract = await getContract(contractId)

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
  const pg = createSupabaseDirectClient()
  return await insertNotificationToSupabase(notification, pg)
}

export const createUniqueBettorBonusNotification = async (
  // Creator of contract or answer that was bet on.
  creatorId: string,
  bettor: User,
  txnId: string,
  contract: Contract,
  amount: number,
  uniqueBettorIds: string[],
  idempotencyKey: string,
  bet: Bet,
  partnerDollarBonus: number | undefined
) => {
  const firestore = admin.firestore()
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

    const notification: Notification = {
      id: idempotencyKey,
      userId: creatorId,
      reason: 'unique_bettors_on_your_contract',
      createdTime: Date.now(),
      isSeen: false,
      sourceId: txnId,
      sourceType: 'bonus',
      sourceUpdateType: 'created',
      sourceUserName: bettor.name,
      sourceUserUsername: bettor.username,
      sourceUserAvatarUrl: bettor.avatarUrl,
      sourceText: amount.toString(),
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
          outcomeType === 'FREE_RESPONSE' || outcomeType === 'MULTIPLE_CHOICE'
            ? (contract.answers as Answer[]).find(
                (a) => a.id === bet.outcome || a.id === bet.answerId
              )?.text
            : undefined,
        outcomeType,
        ...pseudoNumericData,
        partnerDollarBonus,
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

  const bets = await getValues<Bet>(
    firestore.collection('contracts').doc(contract.id).collection('bets')
  )
  const bettorsToTheirBets = groupBy(bets, (bet) => bet.userId)

  // Don't send if creator has seen their market since the 1st bet was placed
  const creatorHasSeenMarketSinceBet = await hasUserSeenMarket(
    contract.id,
    privateUser.id,
    minBy(Object.values(bettorsToTheirBets).flat(), 'createdTime')
      ?.createdTime ?? contract.createdTime,
    pg
  )
  if (creatorHasSeenMarketSinceBet || amount === 0) return

  await sendNewUniqueBettorsEmail(
    'unique_bettors_on_your_contract',
    privateUser,
    contract,
    uniqueBettorsExcludingCreator.length,
    mostRecentUniqueBettors,
    bettorsToTheirBets,
    amount * TOTAL_NEW_BETTORS_TO_REPORT
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
  const sendNotificationsIfSettingsAllow = async (
    userId: string,
    reason: notification_preference
  ) => {
    const privateUser = await getPrivateUser(userId)
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
      await insertNotificationToSupabase(notification, pg)
    }
    if (sendToEmail && reason === 'contract_from_followed_user')
      await sendNewFollowedMarketEmail(reason, userId, privateUser, contract)
  }
  const followerUserIds = await getUserFollowerIds(contractCreator.id, pg)

  // As it is coded now, the tag notification usurps the new contract notification
  // It'd be easy to append the reason to the eventId if desired
  if (contract.visibility == 'public') {
    await Promise.all(
      followerUserIds.map(async (userId) =>
        sendNotificationsIfSettingsAllow(userId, 'contract_from_followed_user')
      )
    )
  }
  await Promise.all(
    mentionedUserIds.map(async (userId) =>
      sendNotificationsIfSettingsAllow(userId, 'tagged_user')
    )
  )
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
  } else if (
    contract.outcomeType === 'FREE_RESPONSE' ||
    contract.outcomeType === 'MULTIPLE_CHOICE'
  ) {
    const answerText = (contract as MultiContract).answers.find(
      (answer) => answer.id === outcome
    )?.text
    if (answerText) resolutionText = answerText
  } else if (contract.outcomeType === 'BINARY') {
    if (resolutionText === 'MKT' && probabilityInt)
      resolutionText = `${probabilityInt}%`
    else if (resolutionText === 'MKT') resolutionText = 'PROB'
  } else if (contract.outcomeType === 'PSEUDO_NUMERIC') {
    if (resolutionText === 'MKT' && resolutionValue)
      resolutionText = `${resolutionValue}`
  }

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
      sourceType: isManifoldLoveContract(contract)
        ? 'love_contract'
        : 'contract',
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
      await insertNotificationToSupabase(
        constructNotification(userId, reason),
        pg
      )
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
      const profit = Math.round(userPayout - userInvestment)
      const profitPercent = Math.round((profit / userInvestment) * 100)
      const profitString = ` You made M${getMoneyNumber(
        profit
      )} (+${profitPercent}%)`
      const lossString = ` You lost M${getMoneyNumber(-profit)}`
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
    buildArray([
      !isIndependentMulti && contractFollowersIds,
      Object.keys(userPayouts),
    ]).filter((id) => id !== resolver.id)
  )

  await Promise.all(
    usersToNotify.map((id) =>
      sendNotificationsIfSettingsPermit(
        id,
        userIdToContractMetrics?.[id]?.invested
          ? 'resolutions_on_watched_markets_with_shares_in'
          : 'resolutions_on_watched_markets'
      )
    )
  )
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
    await Promise.all(
      Object.keys(contractFollowersIds).map((userId) => {
        if (userId !== contract.creatorId) {
          sendNotificationsIfSettingsPermit(userId, 'bounty_canceled')
        }
      })
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
    await Promise.all(
      Object.keys(contractFollowersIds).map((userId) => {
        if (userId !== sourceContract.creatorId) {
          sendNotificationsIfSettingsPermit(
            userId,
            'all_votes_on_watched_markets'
          )
        }
      })
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
    await Promise.all(
      Object.keys(contractFollowersIds).map((userId) => {
        if (userId !== sourceContract.creatorId) {
          sendNotificationsIfSettingsPermit(
            userId,
            'poll_close_on_watched_markets'
          )
        }
      })
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
