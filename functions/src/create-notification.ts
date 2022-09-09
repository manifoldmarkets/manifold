import * as admin from 'firebase-admin'
import {
  Notification,
  notification_reason_types,
  notificationReasonToSubscriptionType,
} from '../../common/notification'
import { notification_subscription_types, User } from '../../common/user'
import { Contract } from '../../common/contract'
import { getPrivateUser, getValues } from './utils'
import { Comment } from '../../common/comment'
import { uniq } from 'lodash'
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
} from './emails'
const firestore = admin.firestore()

type recipients_to_reason_texts = {
  [userId: string]: { reason: notification_reason_types }
}

export const createNotification = async (
  sourceId: string,
  sourceType: 'contract' | 'liquidity' | 'follow',
  sourceUpdateType: 'closed' | 'created',
  sourceUser: User,
  idempotencyKey: string,
  sourceText: string,
  miscData?: {
    contract?: Contract
    recipients?: string[]
    slug?: string
    title?: string
  }
) => {
  const { contract: sourceContract, recipients, slug, title } = miscData ?? {}

  const shouldGetNotification = (
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
      const { sendToBrowser, sendToEmail, privateUser } =
        await getDestinationsForUser(userId, reason)
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
          sourceSlug: slug ? slug : sourceContract?.slug,
          sourceTitle: title ? title : sourceContract?.question,
        }
        await notificationRef.set(removeUndefinedProps(notification))
      }

      if (!sendToEmail) continue

      if (reason === 'your_contract_closed' && privateUser && sourceContract) {
        await sendMarketCloseEmail(sourceUser, privateUser, sourceContract)
      } else if (reason === 'tagged_user') {
        // TODO: send email to tagged user in new contract
      } else if (reason === 'subsidized_your_market') {
        // TODO: send email to creator of market that was subsidized
      } else if (reason === 'contract_from_followed_user') {
        // TODO: send email to follower of user who created market
      } else if (reason === 'on_new_follow') {
        // TODO: send email to user who was followed
      }
    }
  }

  const notifyUsersFollowers = async (
    userToReasonTexts: recipients_to_reason_texts
  ) => {
    const followers = await firestore
      .collectionGroup('follows')
      .where('userId', '==', sourceUser.id)
      .get()

    followers.docs.forEach((doc) => {
      const followerUserId = doc.ref.parent.parent?.id
      if (
        followerUserId &&
        shouldGetNotification(followerUserId, userToReasonTexts)
      ) {
        userToReasonTexts[followerUserId] = {
          reason: 'contract_from_followed_user',
        }
      }
    })
  }

  const notifyFollowedUser = (
    userToReasonTexts: recipients_to_reason_texts,
    followedUserId: string
  ) => {
    if (shouldGetNotification(followedUserId, userToReasonTexts))
      userToReasonTexts[followedUserId] = {
        reason: 'on_new_follow',
      }
  }

  const notifyTaggedUsers = (
    userToReasonTexts: recipients_to_reason_texts,
    userIds: (string | undefined)[]
  ) => {
    userIds.forEach((id) => {
      if (id && shouldGetNotification(id, userToReasonTexts))
        userToReasonTexts[id] = {
          reason: 'tagged_user',
        }
    })
  }

  const notifyContractCreator = async (
    userToReasonTexts: recipients_to_reason_texts,
    sourceContract: Contract,
    options?: { force: boolean }
  ) => {
    if (
      options?.force ||
      shouldGetNotification(sourceContract.creatorId, userToReasonTexts)
    )
      userToReasonTexts[sourceContract.creatorId] = {
        reason:
          sourceType === 'liquidity'
            ? 'subsidized_your_market'
            : 'your_contract_closed',
      }
  }

  // The following functions modify the userToReasonTexts object in place.
  const userToReasonTexts: recipients_to_reason_texts = {}

  if (sourceType === 'follow' && recipients?.[0]) {
    notifyFollowedUser(userToReasonTexts, recipients[0])
  } else if (
    sourceType === 'contract' &&
    sourceUpdateType === 'created' &&
    sourceContract
  ) {
    await notifyUsersFollowers(userToReasonTexts)
    notifyTaggedUsers(userToReasonTexts, recipients ?? [])
  } else if (
    sourceType === 'contract' &&
    sourceUpdateType === 'closed' &&
    sourceContract
  ) {
    await notifyContractCreator(userToReasonTexts, sourceContract, {
      force: true,
    })
  } else if (
    sourceType === 'liquidity' &&
    sourceUpdateType === 'created' &&
    sourceContract
  ) {
    await notifyContractCreator(userToReasonTexts, sourceContract)
  }

  await sendNotificationsIfSettingsPermit(userToReasonTexts)
}

const getDestinationsForUser = async (
  userId: string,
  reason: notification_reason_types | keyof notification_subscription_types
) => {
  const privateUser = await getPrivateUser(userId)
  if (!privateUser)
    return { sendToEmail: false, sendToBrowser: false, privateUser: null }

  const notificationSettings = privateUser.notificationSubscriptionTypes
  let destinations
  if (Object.keys(notificationSettings).includes(reason)) {
    const key = reason as keyof notification_subscription_types
    destinations = notificationSettings[key]
  } else {
    const key = reason as notification_reason_types
    const subscriptionType = notificationReasonToSubscriptionType[key]
    destinations = subscriptionType
      ? notificationSettings[subscriptionType]
      : []
  }
  return {
    sendToEmail: destinations.includes('email'),
    sendToBrowser: destinations.includes('browser'),
    privateUser,
  }
}

export const createCommentOrAnswerOrUpdatedContractNotification = async (
  sourceId: string,
  sourceType: 'comment' | 'answer' | 'contract',
  sourceUpdateType: 'created' | 'updated' | 'resolved',
  sourceUser: User,
  idempotencyKey: string,
  sourceText: string,
  sourceContract: Contract,
  miscData?: {
    repliedToType?: 'comment' | 'answer'
    repliedToId?: string
    repliedToContent?: string
    repliedUserId?: string
    taggedUserIds?: string[]
  },
  resolutionData?: {
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
  const {
    repliedToType,
    repliedToContent,
    repliedUserId,
    taggedUserIds,
    repliedToId,
  } = miscData ?? {}

  const recipientIdsList: string[] = []

  // get contract follower documents and check here if they're a follower
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

  const stillFollowingContract = (userId: string) => {
    return contractFollowersIds.includes(userId)
  }

  const sendNotificationsIfSettingsPermit = async (
    userId: string,
    reason: notification_reason_types
  ) => {
    if (
      !stillFollowingContract(sourceContract.creatorId) ||
      sourceUser.id == userId ||
      recipientIdsList.includes(userId)
    )
      return

    const { sendToBrowser, sendToEmail } = await getDestinationsForUser(
      userId,
      reason
    )

    if (sendToBrowser) {
      await createBrowserNotification(userId, reason)
      recipientIdsList.push(userId)
    }
    if (sendToEmail) {
      if (sourceType === 'comment') {
        // if the source contract is a free response contract, send the email
        await sendNewCommentEmail(
          userId,
          sourceUser,
          sourceContract,
          sourceText,
          sourceId,
          // TODO: Add any paired bets to the comment
          undefined,
          repliedToType === 'answer' ? repliedToContent : undefined,
          repliedToType === 'answer' ? repliedToId : undefined
        )
      } else if (sourceType === 'answer')
        await sendNewAnswerEmail(
          userId,
          sourceUser.name,
          sourceText,
          sourceContract,
          sourceUser.avatarUrl
        )
      else if (
        sourceType === 'contract' &&
        sourceUpdateType === 'resolved' &&
        resolutionData
      )
        await sendMarketResolutionEmail(
          userId,
          resolutionData.userInvestments[userId],
          resolutionData.userPayouts[userId],
          sourceUser,
          resolutionData.creatorPayout,
          sourceContract,
          resolutionData.outcome,
          resolutionData.resolutionProbability,
          resolutionData.resolutions
        )
      recipientIdsList.push(userId)
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
    if (sourceType === 'comment' && repliedUserId && repliedToType)
      await sendNotificationsIfSettingsPermit(
        repliedUserId,
        repliedToType === 'answer'
          ? 'reply_to_users_answer'
          : 'reply_to_users_comment'
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
  const { sendToBrowser } = await getDestinationsForUser(
    toUser.id,
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

  // maybe TODO: send email notification to bet creator
}

export const createBetFillNotification = async (
  fromUser: User,
  toUser: User,
  bet: Bet,
  userBet: LimitBet,
  contract: Contract,
  idempotencyKey: string
) => {
  const { sendToBrowser } = await getDestinationsForUser(toUser.id, 'bet_fill')
  if (!sendToBrowser) return

  const fill = userBet.fills.find((fill) => fill.matchedBetId === bet.id)
  const fillAmount = fill?.amount ?? 0

  const notificationRef = firestore
    .collection(`/users/${toUser.id}/notifications`)
    .doc(idempotencyKey)
  const notification: Notification = {
    id: idempotencyKey,
    userId: toUser.id,
    reason: 'bet_fill',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: userBet.id,
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
  const { sendToBrowser } = await getDestinationsForUser(
    toUser.id,
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
  const { sendToBrowser } = await getDestinationsForUser(
    toUser.id,
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
  const { sendToBrowser } = await getDestinationsForUser(
    challengeCreator.id,
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
  idempotencyKey: string
) => {
  const { sendToBrowser } = await getDestinationsForUser(
    user.id,
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
  const { sendToBrowser } = await getDestinationsForUser(
    toUser.id,
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
  idempotencyKey: string
) => {
  const { sendToBrowser } = await getDestinationsForUser(
    contractCreatorId,
    'unique_bettors_on_your_contract'
  )
  if (!sendToBrowser) return

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
  return await notificationRef.set(removeUndefinedProps(notification))

  // TODO send email notification
}
