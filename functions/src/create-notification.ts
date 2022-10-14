import * as admin from 'firebase-admin'
import {
  BetFillData,
  BettingStreakData,
  ContractResolutionData,
  Notification,
  notification_reason_types,
} from '../../common/notification'
import {
  MANIFOLD_AVATAR_URL,
  MANIFOLD_USER_NAME,
  MANIFOLD_USER_USERNAME,
  PrivateUser,
  User,
} from '../../common/user'
import { Contract } from '../../common/contract'
import { getPrivateUser, getValues } from './utils'
import { Comment } from '../../common/comment'
import { groupBy, sum, uniq } from 'lodash'
import { Bet, LimitBet } from '../../common/bet'
import { Answer } from '../../common/answer'
import { getContractBetMetrics } from '../../common/calculate'
import { removeUndefinedProps } from '../../common/util/object'
import { TipTxn } from '../../common/txn'
import { Group } from '../../common/group'
import { Challenge } from '../../common/challenge'
import { Like } from '../../common/like'
import {
  sendMarketCloseEmail,
  sendMarketResolutionEmail,
  sendNewAnswerEmail,
  sendNewCommentEmail,
  sendNewFollowedMarketEmail,
  sendNewUniqueBettorsEmail,
} from './emails'
import { filterDefined } from '../../common/util/array'
import { getNotificationDestinationsForUser } from '../../common/user-notification-preferences'
import { ContractFollow } from '../../common/follow'
import { Badge } from 'common/badge'
const firestore = admin.firestore()

type recipients_to_reason_texts = {
  [userId: string]: { reason: notification_reason_types }
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
        const notificationRef = firestore
          .collection(`/users/${userId}/notifications`)
          .doc(idempotencyKey)
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
        await notificationRef.set(removeUndefinedProps(notification))
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

  const browserRecipientIdsList: string[] = []
  const emailRecipientIdsList: string[] = []

  const contractFollowersSnap = await firestore
    .collection(`contracts/${sourceContract.id}/follows`)
    .get()
  const contractFollowersIds = contractFollowersSnap.docs.map(
    (doc) => doc.data().id
  )

  const createBrowserNotification = async (
    userId: string,
    reason: notification_reason_types
  ) => {
    const notificationRef = firestore
      .collection(`/users/${userId}/notifications`)
      .doc(idempotencyKey)
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
    return await notificationRef.set(removeUndefinedProps(notification))
  }

  const needNotFollowContractReasons = ['tagged_user']
  const stillFollowingContract = (userId: string) => {
    return contractFollowersIds.includes(userId)
  }

  const sendNotificationsIfSettingsPermit = async (
    userId: string,
    reason: notification_reason_types
  ) => {
    if (
      (!stillFollowingContract(userId) &&
        !needNotFollowContractReasons.includes(reason)) ||
      sourceUser.id == userId
    )
      return
    const privateUser = await getPrivateUser(userId)
    if (!privateUser) return
    const { sendToBrowser, sendToEmail } = getNotificationDestinationsForUser(
      privateUser,
      reason
    )

    // Browser notifications
    if (sendToBrowser && !browserRecipientIdsList.includes(userId)) {
      await createBrowserNotification(userId, reason)
      browserRecipientIdsList.push(userId)
    }

    // Emails notifications
    if (!sendToEmail || emailRecipientIdsList.includes(userId)) return
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
      emailRecipientIdsList.push(userId)
    } else if (sourceType === 'answer') {
      await sendNewAnswerEmail(
        reason,
        privateUser,
        sourceUser.name,
        sourceText,
        sourceContract,
        sourceUser.avatarUrl
      )
      emailRecipientIdsList.push(userId)
    }
  }

  const notifyContractFollowers = async () => {
    for (const userId of contractFollowersIds) {
      await sendNotificationsIfSettingsPermit(
        userId,
        sourceType === 'answer'
          ? 'answer_on_contract_you_follow'
          : sourceType === 'comment'
          ? 'comment_on_contract_you_follow'
          : sourceUpdateType === 'updated'
          ? 'update_on_contract_you_follow'
          : 'resolution_on_contract_you_follow'
      )
    }
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
    const answers = await getValues<Answer>(
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
    const betsSnap = await firestore
      .collection(`contracts/${sourceContract.id}/bets`)
      .get()
    const bets = betsSnap.docs.map((doc) => doc.data() as Bet)
    // filter bets for only users that have an amount invested still
    const recipientUserIds = uniq(bets.map((bet) => bet.userId)).filter(
      (userId) => {
        return (
          getContractBetMetrics(
            sourceContract,
            bets.filter((bet) => bet.userId === userId)
          ).invested > 0
        )
      }
    )
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
  await notifyRepliedUser()
  await notifyTaggedUsers()
  await notifyContractCreator()
  await notifyOtherAnswerersOnContract()
  await notifyLiquidityProviders()
  await notifyBettorsOnContract()
  await notifyOtherCommentersOnContract()
  // if they weren't notified previously, notify them now
  await notifyContractFollowers()
}

export const createTipNotification = async (
  fromUser: User,
  toUser: User,
  tip: TipTxn,
  idempotencyKey: string,
  commentId: string,
  contract?: Contract,
  group?: Group
) => {
  const privateUser = await getPrivateUser(toUser.id)
  if (!privateUser) return
  const { sendToBrowser } = getNotificationDestinationsForUser(
    privateUser,
    'tip_received'
  )
  if (!sendToBrowser) return

  const slug = group ? group.slug + `#${commentId}` : commentId
  const notificationRef = firestore
    .collection(`/users/${toUser.id}/notifications`)
    .doc(idempotencyKey)
  const notification: Notification = {
    id: idempotencyKey,
    userId: toUser.id,
    reason: 'tip_received',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: tip.id,
    sourceType: 'tip',
    sourceUpdateType: 'created',
    sourceUserName: fromUser.name,
    sourceUserUsername: fromUser.username,
    sourceUserAvatarUrl: fromUser.avatarUrl,
    sourceText: tip.amount.toString(),
    sourceContractCreatorUsername: contract?.creatorUsername,
    sourceContractTitle: contract?.question,
    sourceContractSlug: contract?.slug,
    sourceSlug: slug,
    sourceTitle: group?.name,
  }
  return await notificationRef.set(removeUndefinedProps(notification))

  // TODO: send notification to users that are watching the contract and want highly tipped comments only
  // maybe TODO: send email notification to bet creator
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

  const notificationRef = firestore
    .collection(`/users/${toUser.id}/notifications`)
    .doc(idempotencyKey)
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
      creatorOutcome: limitBet.outcome,
      fillAmount,
      probability: limitBet.limitProb,
      limitOrderTotal: limitBet.orderAmount,
      limitOrderRemaining: remainingAmount,
    } as BetFillData,
  }
  return await notificationRef.set(removeUndefinedProps(notification))

  // maybe TODO: send email notification to bet creator
}

export const createReferralNotification = async (
  toUser: User,
  referredUser: User,
  idempotencyKey: string,
  bonusAmount: string,
  referredByContract?: Contract,
  referredByGroup?: Group
) => {
  const privateUser = await getPrivateUser(toUser.id)
  if (!privateUser) return
  const { sendToBrowser } = getNotificationDestinationsForUser(
    privateUser,
    'you_referred_user'
  )
  if (!sendToBrowser) return

  const notificationRef = firestore
    .collection(`/users/${toUser.id}/notifications`)
    .doc(idempotencyKey)
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
  await notificationRef.set(removeUndefinedProps(notification))

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

  const notificationRef = firestore
    .collection(`/users/${toUser.id}/notifications`)
    .doc(idempotencyKey)
  const notification: Notification = {
    id: idempotencyKey,
    userId: toUser.id,
    reason: 'loan_income',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: idempotencyKey,
    sourceType: 'loan',
    sourceUpdateType: 'updated',
    sourceUserName: toUser.name,
    sourceUserUsername: toUser.username,
    sourceUserAvatarUrl: toUser.avatarUrl,
    sourceText: income.toString(),
    sourceTitle: 'Loan',
  }
  await notificationRef.set(removeUndefinedProps(notification))
}

const groupPath = (groupSlug: string) => `/group/${groupSlug}`

export const createChallengeAcceptedNotification = async (
  challenger: User,
  challengeCreator: User,
  challenge: Challenge,
  acceptedAmount: number,
  contract: Contract
) => {
  const privateUser = await getPrivateUser(challengeCreator.id)
  if (!privateUser) return
  const { sendToBrowser } = getNotificationDestinationsForUser(
    privateUser,
    'challenge_accepted'
  )
  if (!sendToBrowser) return

  const notificationRef = firestore
    .collection(`/users/${challengeCreator.id}/notifications`)
    .doc()
  const notification: Notification = {
    id: notificationRef.id,
    userId: challengeCreator.id,
    reason: 'challenge_accepted',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: challenge.slug,
    sourceType: 'challenge',
    sourceUpdateType: 'updated',
    sourceUserName: challenger.name,
    sourceUserUsername: challenger.username,
    sourceUserAvatarUrl: challenger.avatarUrl,
    sourceText: acceptedAmount.toString(),
    sourceContractCreatorUsername: contract.creatorUsername,
    sourceContractTitle: contract.question,
    sourceContractSlug: contract.slug,
    sourceContractId: contract.id,
    sourceSlug: `/challenges/${challengeCreator.username}/${challenge.contractSlug}/${challenge.slug}`,
  }
  return await notificationRef.set(removeUndefinedProps(notification))
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
    'betting_streak_incremented'
  )
  if (!sendToBrowser) return

  const notificationRef = firestore
    .collection(`/users/${user.id}/notifications`)
    .doc(idempotencyKey)
  const notification: Notification = {
    id: idempotencyKey,
    userId: user.id,
    reason: 'betting_streak_incremented',
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
  return await notificationRef.set(removeUndefinedProps(notification))
}

export const createLikeNotification = async (
  fromUser: User,
  toUser: User,
  like: Like,
  idempotencyKey: string,
  contract: Contract,
  tip?: TipTxn
) => {
  const privateUser = await getPrivateUser(toUser.id)
  if (!privateUser) return
  const { sendToBrowser } = getNotificationDestinationsForUser(
    privateUser,
    'liked_and_tipped_your_contract'
  )
  if (!sendToBrowser) return

  // not handling just likes, must include tip
  if (!tip) return

  const notificationRef = firestore
    .collection(`/users/${toUser.id}/notifications`)
    .doc(idempotencyKey)
  const notification: Notification = {
    id: idempotencyKey,
    userId: toUser.id,
    reason: 'liked_and_tipped_your_contract',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: like.id,
    sourceType: tip ? 'tip_and_like' : 'like',
    sourceUpdateType: 'created',
    sourceUserName: fromUser.name,
    sourceUserUsername: fromUser.username,
    sourceUserAvatarUrl: fromUser.avatarUrl,
    sourceText: tip?.amount.toString(),
    sourceContractCreatorUsername: contract.creatorUsername,
    sourceContractTitle: contract.question,
    sourceContractSlug: contract.slug,
    sourceSlug: contract.slug,
    sourceTitle: contract.question,
  }
  return await notificationRef.set(removeUndefinedProps(notification))

  // TODO send email notification
}

export const createUniqueBettorBonusNotification = async (
  contractCreatorId: string,
  bettor: User,
  txnId: string,
  contract: Contract,
  amount: number,
  uniqueBettorIds: string[],
  idempotencyKey: string
) => {
  const privateUser = await getPrivateUser(contractCreatorId)
  if (!privateUser) return
  const { sendToBrowser, sendToEmail } = getNotificationDestinationsForUser(
    privateUser,
    'unique_bettors_on_your_contract'
  )
  if (sendToBrowser) {
    const notificationRef = firestore
      .collection(`/users/${contractCreatorId}/notifications`)
      .doc(idempotencyKey)
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
    }
    await notificationRef.set(removeUndefinedProps(notification))
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
    Math.round(amount * totalNewBettorsToReport)
  )
}

export const createNewContractNotification = async (
  contractCreator: User,
  contract: Contract,
  idempotencyKey: string,
  text: string,
  mentionedUserIds: string[]
) => {
  if (contract.visibility !== 'public') return

  const sendNotificationsIfSettingsAllow = async (
    userId: string,
    reason: notification_reason_types
  ) => {
    const privateUser = await getPrivateUser(userId)
    if (!privateUser) return
    const { sendToBrowser, sendToEmail } = getNotificationDestinationsForUser(
      privateUser,
      reason
    )
    if (sendToBrowser) {
      const notificationRef = firestore
        .collection(`/users/${userId}/notifications`)
        .doc(idempotencyKey)
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
      await notificationRef.set(removeUndefinedProps(notification))
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
  for (const followerUserId of followerUserIds) {
    await sendNotificationsIfSettingsAllow(
      followerUserId,
      'contract_from_followed_user'
    )
  }
  for (const mentionedUserId of mentionedUserIds) {
    await sendNotificationsIfSettingsAllow(mentionedUserId, 'tagged_user')
  }
}

export const createContractResolvedNotifications = async (
  contract: Contract,
  creator: User,
  outcome: string,
  probabilityInt: number | undefined,
  resolutionValue: number | undefined,
  resolutionData: {
    bets: Bet[]
    userInvestments: { [userId: string]: number }
    userPayouts: { [userId: string]: number }
    creator: User
    creatorPayout: number
    contract: Contract
    outcome: string
    resolutionProbability?: number
    resolutions?: { [outcome: string]: number }
  }
) => {
  let resolutionText = outcome ?? contract.question
  if (
    contract.outcomeType === 'FREE_RESPONSE' ||
    contract.outcomeType === 'MULTIPLE_CHOICE'
  ) {
    const answerText = contract.answers.find(
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

  const idempotencyKey = contract.id + '-resolved'
  const createBrowserNotification = async (
    userId: string,
    reason: notification_reason_types
  ) => {
    const notificationRef = firestore
      .collection(`/users/${userId}/notifications`)
      .doc(idempotencyKey)
    const notification: Notification = {
      id: idempotencyKey,
      userId,
      reason,
      createdTime: Date.now(),
      isSeen: false,
      sourceId: contract.id,
      sourceType: 'contract',
      sourceUpdateType: 'resolved',
      sourceContractId: contract.id,
      sourceUserName: creator.name,
      sourceUserUsername: creator.username,
      sourceUserAvatarUrl: creator.avatarUrl,
      sourceText: resolutionText,
      sourceContractCreatorUsername: contract.creatorUsername,
      sourceContractTitle: contract.question,
      sourceContractSlug: contract.slug,
      sourceSlug: contract.slug,
      sourceTitle: contract.question,
      data: {
        outcome,
        userInvestment: resolutionData.userInvestments[userId] ?? 0,
        userPayout: resolutionData.userPayouts[userId] ?? 0,
      } as ContractResolutionData,
    }
    return await notificationRef.set(removeUndefinedProps(notification))
  }

  const sendNotificationsIfSettingsPermit = async (
    userId: string,
    reason: notification_reason_types
  ) => {
    if (!stillFollowingContract(userId) || creator.id == userId) return
    const privateUser = await getPrivateUser(userId)
    if (!privateUser) return
    const { sendToBrowser, sendToEmail } = getNotificationDestinationsForUser(
      privateUser,
      reason
    )

    // Browser notifications
    if (sendToBrowser) {
      await createBrowserNotification(userId, reason)
    }

    // Emails notifications
    if (sendToEmail)
      await sendMarketResolutionEmail(
        reason,
        privateUser,
        resolutionData.userInvestments[userId] ?? 0,
        resolutionData.userPayouts[userId] ?? 0,
        creator,
        resolutionData.creatorPayout,
        contract,
        resolutionData.outcome,
        resolutionData.resolutionProbability,
        resolutionData.resolutions
      )
  }

  const contractFollowersIds = (
    await getValues<ContractFollow>(
      firestore.collection(`contracts/${contract.id}/follows`)
    )
  ).map((follow) => follow.id)

  const stillFollowingContract = (userId: string) => {
    return contractFollowersIds.includes(userId)
  }

  await Promise.all(
    contractFollowersIds.map((id) =>
      sendNotificationsIfSettingsPermit(
        id,
        resolutionData.userInvestments[id]
          ? 'resolution_on_contract_with_users_shares_in'
          : 'resolution_on_contract_you_follow'
      )
    )
  )
}

export const createBountyNotification = async (
  fromUser: User,
  toUserId: string,
  amount: number,
  idempotencyKey: string,
  contract: Contract,
  commentId?: string
) => {
  const privateUser = await getPrivateUser(toUserId)
  if (!privateUser) return
  const { sendToBrowser } = getNotificationDestinationsForUser(
    privateUser,
    'tip_received'
  )
  if (!sendToBrowser) return

  const slug = commentId
  const notificationRef = firestore
    .collection(`/users/${toUserId}/notifications`)
    .doc(idempotencyKey)
  const notification: Notification = {
    id: idempotencyKey,
    userId: toUserId,
    reason: 'tip_received',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: commentId ? commentId : contract.id,
    sourceType: 'tip',
    sourceUpdateType: 'created',
    sourceUserName: fromUser.name,
    sourceUserUsername: fromUser.username,
    sourceUserAvatarUrl: fromUser.avatarUrl,
    sourceText: amount.toString(),
    sourceContractCreatorUsername: contract.creatorUsername,
    sourceContractTitle: contract.question,
    sourceContractSlug: contract.slug,
    sourceSlug: slug,
    sourceTitle: contract.question,
  }
  return await notificationRef.set(removeUndefinedProps(notification))
}

export const createBadgeAwardedNotification = async (
  user: User,
  badge: Badge
) => {
  const privateUser = await getPrivateUser(user.id)
  if (!privateUser) return
  const { sendToBrowser } = getNotificationDestinationsForUser(
    privateUser,
    'badges_awarded'
  )
  if (!sendToBrowser) return

  const notificationRef = firestore
    .collection(`/users/${user.id}/notifications`)
    .doc()
  const notification: Notification = {
    id: notificationRef.id,
    userId: user.id,
    reason: 'badges_awarded',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: badge.type,
    sourceType: 'badge',
    sourceUpdateType: 'created',
    sourceUserName: MANIFOLD_USER_NAME,
    sourceUserUsername: MANIFOLD_USER_USERNAME,
    sourceUserAvatarUrl: MANIFOLD_AVATAR_URL,
    sourceText: `You earned a new ${badge.name} badge!`,
    sourceSlug: `/${user.username}?show=badges&badge=${badge.type}`,
    sourceTitle: badge.name,
    data: {
      badge,
    },
  }
  return await notificationRef.set(removeUndefinedProps(notification))

  // TODO send email notification
}

export const createMarketClosedNotification = async (
  contract: Contract,
  creator: User,
  privateUser: PrivateUser,
  idempotencyKey: string
) => {
  const notificationRef = firestore
    .collection(`/users/${creator.id}/notifications`)
    .doc(idempotencyKey)
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
  await notificationRef.set(removeUndefinedProps(notification))
  await sendMarketCloseEmail(
    'your_contract_closed',
    creator,
    privateUser,
    contract
  )
}
