import { getContractBetMetrics } from 'common/calculate'
import * as admin from 'firebase-admin'
import {
  BetFillData,
  BettingStreakData,
  ContractResolutionData,
  LeagueChangeData,
  Notification,
  NOTIFICATION_DESCRIPTIONS,
  notification_reason_types,
  UniqueBettorData,
} from 'common/notification'
import {
  MANIFOLD_AVATAR_URL,
  MANIFOLD_USER_NAME,
  MANIFOLD_USER_USERNAME,
  PrivateUser,
  User,
} from 'common/user'
import { Contract, MultiContract } from 'common/contract'
import { getPrivateUser, getUser, getValues, log } from 'shared/utils'
import { Comment } from 'common/comment'
import { groupBy, keyBy, mapValues, sum, uniq } from 'lodash'
import { Bet, LimitBet } from 'common/bet'
import { Answer, DpmAnswer } from 'common/answer'
import { removeUndefinedProps } from 'common/util/object'
import { Group } from 'common/group'
import {
  sendMarketCloseEmail,
  sendMarketResolutionEmail,
  sendNewAnswerEmail,
  sendNewCommentEmail,
  sendNewFollowedMarketEmail,
  sendNewPrivateMarketEmail,
  sendNewUniqueBettorsEmail,
} from './emails'
import { filterDefined } from 'common/util/array'
import {
  getNotificationDestinationsForUser,
  notification_destination_types,
  userIsBlocked,
  userOptedOutOfBrowserNotifications,
} from 'common/user-notification-preferences'
import { createPushNotification } from './create-push-notification'
import { Reaction } from 'common/reaction'
import { GroupMember } from 'common/group-member'
import { QuestType } from 'common/quest'
import { QuestRewardTxn } from 'common/txn'
import { getMoneyNumber } from 'common/util/format'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import * as crypto from 'crypto'
import { getUniqueBettorIds } from 'shared/supabase/contracts'
import { getGroupMemberIds } from 'common/supabase/groups'
import { richTextToString } from 'common/util/parse'
import { JSONContent } from '@tiptap/core'
import { league_user_info } from 'common/leagues'

const firestore = admin.firestore()

type recipients_to_reason_texts = {
  [userId: string]: { reason: notification_reason_types }
}

const insertNotificationToSupabase = async (
  notification: Notification,
  pg: SupabaseDirectClient
) => {
  return await pg.none(
    `insert into postgres.public.user_notifications (user_id, notification_id, data, fs_updated_time) values ($1, $2, $3, $4) on conflict do nothing`,
    [
      notification.userId,
      notification.id,
      notification,
      new Date().toISOString(),
    ]
  )
}
export const createFollowOrMarketSubsidizedNotification = async (
  sourceId: string,
  sourceType: 'liquidity' | 'follow',
  sourceUpdateType: 'created',
  sourceUser: User,
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
      sourceUser.id != userId &&
      !Object.keys(userToReasonTexts).includes(userId)
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
    reason: notification_reason_types
  ) => {
    const notification: Notification = {
      id: idempotencyKey,
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

  const needNotFollowContractReasons = ['tagged_user']
  const stillFollowingContract = (userId: string) => {
    // Should be better performance than includes
    return contractFollowersIds[userId] !== undefined
  }

  const sendNotificationsIfSettingsPermit = async (
    userId: string,
    reason: notification_reason_types
  ) => {
    // A user doesn't have to follow a market to receive a notification with their tag
    if (
      (!stillFollowingContract(userId) &&
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
      Object.keys(contractFollowersIds).map((userId) =>
        sendNotificationsIfSettingsPermit(
          userId,
          sourceType === 'answer'
            ? 'answer_on_contract_you_follow'
            : sourceType === 'comment'
            ? 'comment_on_contract_you_follow'
            : sourceUpdateType === 'updated'
            ? 'update_on_contract_you_follow'
            : 'resolution_on_contract_you_follow'
        )
      )
    )
  }

  const notifyContractCreator = async () => {
    await sendNotificationsIfSettingsPermit(
      sourceContract.creatorId,
      sourceType === 'comment'
        ? 'comment_on_your_contract'
        : 'answer_on_your_contract'
    )
  }

  const notifyOtherAnswerersOnContract = async () => {
    const answers = await getValues<DpmAnswer>(
      firestore
        .collection('contracts')
        .doc(sourceContract.id)
        .collection('answers')
    )
    const recipientUserIds = uniq(answers.map((answer) => answer.userId))
    await Promise.all(
      recipientUserIds.map((userId) =>
        sendNotificationsIfSettingsPermit(
          userId,
          sourceType === 'answer'
            ? 'answer_on_contract_with_users_answer'
            : sourceType === 'comment'
            ? 'comment_on_contract_with_users_answer'
            : sourceUpdateType === 'updated'
            ? 'update_on_contract_with_users_answer'
            : 'resolution_on_contract_with_users_answer'
        )
      )
    )
  }

  const notifyOtherCommentersOnContract = async () => {
    const comments = await getValues<Comment>(
      firestore
        .collection('contracts')
        .doc(sourceContract.id)
        .collection('comments')
    )
    const recipientUserIds = uniq(comments.map((comment) => comment.userId))
    await Promise.all(
      recipientUserIds.map((userId) =>
        sendNotificationsIfSettingsPermit(
          userId,
          sourceType === 'answer'
            ? 'answer_on_contract_with_users_comment'
            : sourceType === 'comment'
            ? 'comment_on_contract_with_users_comment'
            : sourceUpdateType === 'updated'
            ? 'update_on_contract_with_users_comment'
            : 'resolution_on_contract_with_users_comment'
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
            : sourceUpdateType === 'updated'
            ? 'update_on_contract_with_users_shares_in'
            : 'resolution_on_contract_with_users_shares_in'
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
    if (sourceType === 'comment' && taggedUserIds && taggedUserIds.length > 0)
      await Promise.all(
        taggedUserIds.map((userId) =>
          sendNotificationsIfSettingsPermit(userId, 'tagged_user')
        )
      )
  }

  const notifyLiquidityProviders = async () => {
    const liquidityProviders = await firestore
      .collection(`contracts/${sourceContract.id}/liquidity`)
      .get()
    const liquidityProvidersIds = uniq(
      liquidityProviders.docs.map((doc) => doc.data().userId)
    )
    await Promise.all(
      liquidityProvidersIds.map((userId) =>
        sendNotificationsIfSettingsPermit(
          userId,
          sourceType === 'answer'
            ? 'answer_on_contract_with_users_shares_in'
            : sourceType === 'comment'
            ? 'comment_on_contract_with_users_shares_in'
            : sourceUpdateType === 'updated'
            ? 'update_on_contract_with_users_shares_in'
            : 'resolution_on_contract_with_users_shares_in'
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
  toUser: User,
  referredUser: User,
  idempotencyKey: string,
  bonusAmount: string,
  referredByContract?: Contract,
  referredByGroup?: { slug: string; name: string }
) => {
  const privateUser = await getPrivateUser(toUser.id)
  if (!privateUser) return
  const { sendToBrowser } = getNotificationDestinationsForUser(
    privateUser,
    'you_referred_user'
  )
  if (!sendToBrowser) return

  const notification: Notification = {
    id: idempotencyKey,
    userId: toUser.id,
    reason: referredByGroup
      ? 'user_joined_from_your_group_invite'
      : referredByContract?.creatorId === toUser.id
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
    sourceContractCreatorUsername: !referredByGroup
      ? referredByContract?.creatorUsername
      : undefined,
    sourceContractTitle: !referredByGroup
      ? referredByContract?.question
      : undefined,
    sourceContractSlug: !referredByGroup ? referredByContract?.slug : undefined,
    sourceSlug: referredByGroup
      ? groupPath(referredByGroup.slug)
      : referredByContract?.slug,
    sourceTitle: referredByGroup
      ? referredByGroup.name
      : referredByContract?.question,
  }
  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
  // TODO send email notification
}

export const createLoanIncomeNotification = async (
  toUser: User,
  idempotencyKey: string,
  income: number
) => {
  const privateUser = await getPrivateUser(toUser.id)
  if (!privateUser) return
  const { sendToBrowser } = getNotificationDestinationsForUser(
    privateUser,
    'loan_income'
  )
  if (!sendToBrowser) return

  const notification: Notification = {
    id: idempotencyKey,
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

const groupPath = (groupSlug: string) => `/group/${groupSlug}`

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
  const privateUser = await getPrivateUser(reaction.contentOwnerId)
  if (!privateUser) return
  const { sendToBrowser } = getNotificationDestinationsForUser(
    privateUser,
    'user_liked_your_content'
  )
  if (!sendToBrowser) return

  // Reaction ids are constructed via contentId-reactionType to ensure idempotency
  const id = `${reaction.userId}-${reaction.id}`
  const notification: Notification = {
    id,
    userId: reaction.contentOwnerId,
    reason: 'user_liked_your_content',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: reaction.id,
    sourceType:
      reaction.contentType === 'contract' ? 'contract_like' : 'comment_like',
    sourceUpdateType: 'created',
    sourceUserName: reaction.userDisplayName,
    sourceUserUsername: reaction.userUsername,
    sourceUserAvatarUrl: reaction.userAvatarUrl,
    sourceContractId:
      reaction.contentType === 'contract'
        ? reaction.contentId
        : reaction.contentParentId,
    sourceText: reaction.text,
    sourceSlug: reaction.slug,
    sourceTitle: reaction.title,
  }
  const pg = createSupabaseDirectClient()
  return await insertNotificationToSupabase(notification, pg)
}

export const createUniqueBettorBonusNotification = async (
  contractCreatorId: string,
  bettor: User,
  txnId: string,
  contract: Contract,
  amount: number,
  uniqueBettorIds: string[],
  idempotencyKey: string,
  bet: Bet
) => {
  const privateUser = await getPrivateUser(contractCreatorId)
  if (!privateUser) return
  const { sendToBrowser, sendToEmail } = getNotificationDestinationsForUser(
    privateUser,
    'unique_bettors_on_your_contract'
  )
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
      userId: contractCreatorId,
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
      } as UniqueBettorData),
    }
    const pg = createSupabaseDirectClient()
    await insertNotificationToSupabase(notification, pg)
  }

  if (!sendToEmail) return
  const uniqueBettorsExcludingCreator = uniqueBettorIds.filter(
    (id) => id !== contractCreatorId
  )
  // only send on 1st and 6th bettor
  if (
    uniqueBettorsExcludingCreator.length !== 1 &&
    uniqueBettorsExcludingCreator.length !== 6
  )
    return
  const totalNewBettorsToReport =
    uniqueBettorsExcludingCreator.length === 1 ? 1 : 5

  const mostRecentUniqueBettors = await getValues<User>(
    firestore
      .collection('users')
      .where(
        'id',
        'in',
        uniqueBettorsExcludingCreator.slice(
          uniqueBettorsExcludingCreator.length - totalNewBettorsToReport,
          uniqueBettorsExcludingCreator.length
        )
      )
  )

  const bets = await getValues<Bet>(
    firestore.collection('contracts').doc(contract.id).collection('bets')
  )
  // group bets by bettors
  const bettorsToTheirBets = groupBy(bets, (bet) => bet.userId)
  await sendNewUniqueBettorsEmail(
    'unique_bettors_on_your_contract',
    contractCreatorId,
    privateUser,
    contract,
    uniqueBettorsExcludingCreator.length,
    mostRecentUniqueBettors,
    bettorsToTheirBets,
    amount * totalNewBettorsToReport
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
    reason: notification_reason_types
  ) => {
    const privateUser = await getPrivateUser(userId)
    if (!privateUser) return
    if (userIsBlocked(privateUser, contractCreator.id)) return
    const { sendToBrowser, sendToEmail } = getNotificationDestinationsForUser(
      privateUser,
      reason
    )
    // Users only get new contracts in their feed unless they're mentioned
    if (sendToBrowser && reason !== 'contract_from_followed_user') {
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
    if (!sendToEmail) return
    if (reason === 'contract_from_followed_user')
      await sendNewFollowedMarketEmail(reason, userId, privateUser, contract)
  }
  const followersSnapshot = await firestore
    .collectionGroup('follows')
    .where('userId', '==', contractCreator.id)
    .get()

  const followerUserIds = filterDefined(
    followersSnapshot.docs.map((doc) => {
      const followerUserId = doc.ref.parent.parent?.id
      return followerUserId && followerUserId != contractCreator.id
        ? followerUserId
        : undefined
    })
  )

  // As it is coded now, the tag notification usurps the new contract notification
  // It'd be easy to append the reason to the eventId if desired
  if (contract.visibility == 'public') {
    for (const followerUserId of followerUserIds) {
      await sendNotificationsIfSettingsAllow(
        followerUserId,
        'contract_from_followed_user'
      )
    }
  }
  for (const mentionedUserId of mentionedUserIds) {
    await sendNotificationsIfSettingsAllow(mentionedUserId, 'tagged_user')
  }
}

export const createNewContractFromPrivateGroupNotification = async (
  contractCreator: User,
  contract: Contract,
  group: { id: string; name: string }
) => {
  const pg = createSupabaseDirectClient()
  const db = createSupabaseClient()
  const reason = 'contract_from_private_group'
  const sendNewContractInFromPrivateGroupNotificationsIfSettingsAllow = async (
    userId: string
  ) => {
    const privateUser = await getPrivateUser(userId)
    if (!privateUser) return
    if (userIsBlocked(privateUser, contractCreator.id)) return
    const { sendToBrowser, sendToEmail } = getNotificationDestinationsForUser(
      privateUser,
      reason
    )
    if (sendToBrowser) {
      const notification: Notification = {
        id: crypto.randomUUID(),
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
        sourceText: richTextToString(contract.description as JSONContent),
        sourceSlug: contract.slug,
        sourceTitle: contract.question,
        sourceContractSlug: contract.slug,
        sourceContractId: contract.id,
        sourceContractTitle: contract.question,
        sourceContractCreatorUsername: contract.creatorUsername,
      }
      await insertNotificationToSupabase(notification, pg)
    }
    if (!sendToEmail) return
    await sendNewPrivateMarketEmail(reason, privateUser, contract, group.name)
  }

  const privateMemberIds = await getGroupMemberIds(db, group.id)
  for (const privateMemberId of privateMemberIds) {
    if (privateMemberId != contract.creatorId) {
      await sendNewContractInFromPrivateGroupNotificationsIfSettingsAllow(
        privateMemberId
      )
    }
  }
}

export const createContractResolvedNotifications = async (
  contract: Contract,
  resolver: User,
  creator: User,
  outcome: string,
  probabilityInt: number | undefined,
  resolutionValue: number | undefined,
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
  if (
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
    reason: notification_reason_types
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
      data: {
        outcome,
        userInvestment: userIdToContractMetrics?.[userId]?.invested ?? 0,
        userPayout: userPayouts[userId] ?? 0,
        profitRank: sortedProfits.findIndex((p) => p.userId === userId) + 1,
        totalShareholders: sortedProfits.length,
        profit: userIdToContractMetrics?.[userId]?.profit ?? 0,
      } as ContractResolutionData,
    }
  }

  const sendNotificationsIfSettingsPermit = async (
    userId: string,
    reason: notification_reason_types
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
        resolutions
      )

    if (sendToMobile) {
      const notification = constructNotification(userId, reason)
      const {
        userPayout,
        profitRank,

        userInvestment,
        totalShareholders,
      } = notification.data as ContractResolutionData
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
    [...contractFollowersIds, ...Object.keys(userPayouts)].filter(
      (id) => id !== resolver.id
    )
  )

  await Promise.all(
    usersToNotify.map((id) =>
      sendNotificationsIfSettingsPermit(
        id,
        userIdToContractMetrics?.[id]?.invested
          ? 'resolution_on_contract_with_users_shares_in'
          : 'resolution_on_contract_you_follow'
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
export const createGroupStatusChangeNotification = async (
  initiator: User,
  affectedMember: GroupMember,
  group: Group,
  newStatus: string
) => {
  const privateUser = await getPrivateUser(affectedMember.member_id)
  if (!privateUser) return
  let sourceText = `changed your role to ${newStatus}`
  if (
    ((!affectedMember.role || affectedMember.role == 'member') &&
      (newStatus == 'admin' || newStatus == 'moderator')) ||
    (affectedMember.role == 'moderator' && newStatus == 'admin')
  ) {
    sourceText = `promoted you from ${
      affectedMember.role ?? 'member'
    } to ${newStatus}`
  } else if (
    ((affectedMember.role == 'admin' || affectedMember.role == 'moderator') &&
      newStatus == 'member') ||
    (affectedMember.role == 'admin' && newStatus == 'moderator')
  ) {
    sourceText = `demoted you from ${
      affectedMember.role ?? 'member'
    } to ${newStatus}`
  }

  const notification: Notification = {
    id: crypto.randomUUID(),
    userId: affectedMember.member_id,
    reason: 'group_role_changed',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: group.id,
    sourceType: 'group',
    sourceUpdateType: 'updated',
    sourceUserName: initiator.name,
    sourceUserUsername: initiator.username,
    sourceUserAvatarUrl: initiator.avatarUrl,
    sourceText: sourceText,
    sourceSlug: group.slug,
    sourceTitle: group.name,
    sourceContractId: 'group' + group.id,
  }
  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
}

export const createAddedToGroupNotification = async (
  initiator: User,
  userId: string,
  group: Group
) => {
  const privateUser = await getPrivateUser(userId)
  if (!privateUser) return

  const notification: Notification = {
    id: crypto.randomUUID(),
    userId: userId,
    reason: 'added_to_group',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: group.id,
    sourceType: 'group',
    sourceUpdateType: 'updated',
    sourceUserName: initiator.name,
    sourceUserUsername: initiator.username,
    sourceUserAvatarUrl: initiator.avatarUrl,
    sourceText: group.name,
    sourceSlug: group.slug,
    sourceTitle: group.name,
    sourceContractId: 'group' + group.id,
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

export const createSignupBonusNotification = async (
  user: User,
  txnId: string,
  bonusAmount: number
) => {
  const privateUser = await getPrivateUser(user.id)
  if (!privateUser) return
  if (userOptedOutOfBrowserNotifications(privateUser)) return
  const notification: Notification = {
    id: crypto.randomUUID(),
    userId: user.id,
    reason: 'onboarding_flow',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: txnId,
    sourceType: 'signup_bonus',
    sourceUpdateType: 'created',
    sourceUserName: MANIFOLD_USER_NAME,
    sourceUserUsername: MANIFOLD_USER_USERNAME,
    sourceUserAvatarUrl: MANIFOLD_AVATAR_URL,
    sourceText: bonusAmount.toString(),
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

export const createCustomNotification = async (
  recipientId: string,
  title: string,
  sender: User,
  url?: string
) => {
  const notification: Notification = {
    id: crypto.randomUUID(),
    userId: recipientId,
    reason: 'announcement_created',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: '',
    sourceType: 'announcement',
    sourceUserName: sender.name,
    sourceUserUsername: sender.username,
    sourceUserAvatarUrl: sender.avatarUrl,
    sourceText: title,
    data: { url },
  }
  const pg = createSupabaseDirectClient()
  await insertNotificationToSupabase(notification, pg)
}
