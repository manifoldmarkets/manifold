import * as admin from 'firebase-admin'
import {
  Notification,
  notification_reason_types,
  notification_source_update_types,
  notification_source_types,
} from '../../common/notification'
import { User } from '../../common/user'
import { Contract } from '../../common/contract'
import { getValues, log } from './utils'
import { Comment } from '../../common/comment'
import { uniq } from 'lodash'
import { Bet, LimitBet } from '../../common/bet'
import { Answer } from '../../common/answer'
import { getContractBetMetrics } from '../../common/calculate'
import { removeUndefinedProps } from '../../common/util/object'
import { TipTxn } from '../../common/txn'
import { Group, GROUP_CHAT_SLUG } from '../../common/group'
import { Challenge } from '../../common/challenge'
import { richTextToString } from '../../common/util/parse'
import { Like } from '../../common/like'
const firestore = admin.firestore()

type user_to_reason_texts = {
  [userId: string]: { reason: notification_reason_types }
}

export const createNotification = async (
  sourceId: string,
  sourceType: notification_source_types,
  sourceUpdateType: notification_source_update_types,
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
    userToReasonTexts: user_to_reason_texts
  ) => {
    return (
      sourceUser.id != userId &&
      !Object.keys(userToReasonTexts).includes(userId)
    )
  }

  const createUsersNotifications = async (
    userToReasonTexts: user_to_reason_texts
  ) => {
    await Promise.all(
      Object.keys(userToReasonTexts).map(async (userId) => {
        const notificationRef = firestore
          .collection(`/users/${userId}/notifications`)
          .doc(idempotencyKey)
        const notification: Notification = {
          id: idempotencyKey,
          userId,
          reason: userToReasonTexts[userId].reason,
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
      })
    )
  }

  const notifyUsersFollowers = async (
    userToReasonTexts: user_to_reason_texts
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
          reason: 'you_follow_user',
        }
      }
    })
  }

  const notifyFollowedUser = (
    userToReasonTexts: user_to_reason_texts,
    followedUserId: string
  ) => {
    if (shouldGetNotification(followedUserId, userToReasonTexts))
      userToReasonTexts[followedUserId] = {
        reason: 'on_new_follow',
      }
  }

  const notifyTaggedUsers = (
    userToReasonTexts: user_to_reason_texts,
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
    userToReasonTexts: user_to_reason_texts,
    sourceContract: Contract,
    options?: { force: boolean }
  ) => {
    if (
      options?.force ||
      shouldGetNotification(sourceContract.creatorId, userToReasonTexts)
    )
      userToReasonTexts[sourceContract.creatorId] = {
        reason: 'on_users_contract',
      }
  }

  const notifyUserAddedToGroup = (
    userToReasonTexts: user_to_reason_texts,
    relatedUserId: string
  ) => {
    if (shouldGetNotification(relatedUserId, userToReasonTexts))
      userToReasonTexts[relatedUserId] = {
        reason: 'added_you_to_group',
      }
  }

  const notifyContractCreatorOfUniqueBettorsBonus = async (
    userToReasonTexts: user_to_reason_texts,
    userId: string
  ) => {
    userToReasonTexts[userId] = {
      reason: 'unique_bettors_on_your_contract',
    }
  }

  const userToReasonTexts: user_to_reason_texts = {}
  // The following functions modify the userToReasonTexts object in place.

  if (sourceType === 'follow' && recipients?.[0]) {
    notifyFollowedUser(userToReasonTexts, recipients[0])
  } else if (
    sourceType === 'group' &&
    sourceUpdateType === 'created' &&
    recipients
  ) {
    recipients.forEach((r) => notifyUserAddedToGroup(userToReasonTexts, r))
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
  } else if (
    sourceType === 'bonus' &&
    sourceUpdateType === 'created' &&
    sourceContract
  ) {
    // Note: the daily bonus won't have a contract attached to it
    await notifyContractCreatorOfUniqueBettorsBonus(
      userToReasonTexts,
      sourceContract.creatorId
    )
  }

  await createUsersNotifications(userToReasonTexts)
}

export const createCommentOrAnswerOrUpdatedContractNotification = async (
  sourceId: string,
  sourceType: notification_source_types,
  sourceUpdateType: notification_source_update_types,
  sourceUser: User,
  idempotencyKey: string,
  sourceText: string,
  sourceContract: Contract,
  miscData?: {
    relatedSourceType?: notification_source_types
    repliedUserId?: string
    taggedUserIds?: string[]
  }
) => {
  const { relatedSourceType, repliedUserId, taggedUserIds } = miscData ?? {}

  const createUsersNotifications = async (
    userToReasonTexts: user_to_reason_texts
  ) => {
    await Promise.all(
      Object.keys(userToReasonTexts).map(async (userId) => {
        const notificationRef = firestore
          .collection(`/users/${userId}/notifications`)
          .doc(idempotencyKey)
        const notification: Notification = {
          id: idempotencyKey,
          userId,
          reason: userToReasonTexts[userId].reason,
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
        await notificationRef.set(removeUndefinedProps(notification))
      })
    )
  }

  // get contract follower documents and check here if they're a follower
  const contractFollowersSnap = await firestore
    .collection(`contracts/${sourceContract.id}/follows`)
    .get()
  const contractFollowersIds = contractFollowersSnap.docs.map(
    (doc) => doc.data().id
  )
  log('contractFollowerIds', contractFollowersIds)

  const stillFollowingContract = (userId: string) => {
    return contractFollowersIds.includes(userId)
  }

  const shouldGetNotification = (
    userId: string,
    userToReasonTexts: user_to_reason_texts
  ) => {
    return (
      sourceUser.id != userId &&
      !Object.keys(userToReasonTexts).includes(userId)
    )
  }

  const notifyContractFollowers = async (
    userToReasonTexts: user_to_reason_texts
  ) => {
    for (const userId of contractFollowersIds) {
      if (shouldGetNotification(userId, userToReasonTexts))
        userToReasonTexts[userId] = {
          reason: 'you_follow_contract',
        }
    }
  }

  const notifyContractCreator = async (
    userToReasonTexts: user_to_reason_texts
  ) => {
    if (
      shouldGetNotification(sourceContract.creatorId, userToReasonTexts) &&
      stillFollowingContract(sourceContract.creatorId)
    )
      userToReasonTexts[sourceContract.creatorId] = {
        reason: 'on_users_contract',
      }
  }

  const notifyOtherAnswerersOnContract = async (
    userToReasonTexts: user_to_reason_texts
  ) => {
    const answers = await getValues<Answer>(
      firestore
        .collection('contracts')
        .doc(sourceContract.id)
        .collection('answers')
    )
    const recipientUserIds = uniq(answers.map((answer) => answer.userId))
    recipientUserIds.forEach((userId) => {
      if (
        shouldGetNotification(userId, userToReasonTexts) &&
        stillFollowingContract(userId)
      )
        userToReasonTexts[userId] = {
          reason: 'on_contract_with_users_answer',
        }
    })
  }

  const notifyOtherCommentersOnContract = async (
    userToReasonTexts: user_to_reason_texts
  ) => {
    const comments = await getValues<Comment>(
      firestore
        .collection('contracts')
        .doc(sourceContract.id)
        .collection('comments')
    )
    const recipientUserIds = uniq(comments.map((comment) => comment.userId))
    recipientUserIds.forEach((userId) => {
      if (
        shouldGetNotification(userId, userToReasonTexts) &&
        stillFollowingContract(userId)
      )
        userToReasonTexts[userId] = {
          reason: 'on_contract_with_users_comment',
        }
    })
  }

  const notifyBettorsOnContract = async (
    userToReasonTexts: user_to_reason_texts
  ) => {
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
    recipientUserIds.forEach((userId) => {
      if (
        shouldGetNotification(userId, userToReasonTexts) &&
        stillFollowingContract(userId)
      )
        userToReasonTexts[userId] = {
          reason: 'on_contract_with_users_shares_in',
        }
    })
  }

  const notifyRepliedUser = (
    userToReasonTexts: user_to_reason_texts,
    relatedUserId: string,
    relatedSourceType: notification_source_types
  ) => {
    if (
      shouldGetNotification(relatedUserId, userToReasonTexts) &&
      stillFollowingContract(relatedUserId)
    ) {
      if (relatedSourceType === 'comment') {
        userToReasonTexts[relatedUserId] = {
          reason: 'reply_to_users_comment',
        }
      } else if (relatedSourceType === 'answer') {
        userToReasonTexts[relatedUserId] = {
          reason: 'reply_to_users_answer',
        }
      }
    }
  }

  const notifyTaggedUsers = (
    userToReasonTexts: user_to_reason_texts,
    userIds: (string | undefined)[]
  ) => {
    userIds.forEach((id) => {
      console.log('tagged user: ', id)
      // Allowing non-following users to get tagged
      if (id && shouldGetNotification(id, userToReasonTexts))
        userToReasonTexts[id] = {
          reason: 'tagged_user',
        }
    })
  }

  const notifyLiquidityProviders = async (
    userToReasonTexts: user_to_reason_texts
  ) => {
    const liquidityProviders = await firestore
      .collection(`contracts/${sourceContract.id}/liquidity`)
      .get()
    const liquidityProvidersIds = uniq(
      liquidityProviders.docs.map((doc) => doc.data().userId)
    )
    liquidityProvidersIds.forEach((userId) => {
      if (
        shouldGetNotification(userId, userToReasonTexts) &&
        stillFollowingContract(userId)
      ) {
        userToReasonTexts[userId] = {
          reason: 'on_contract_with_users_shares_in',
        }
      }
    })
  }
  const userToReasonTexts: user_to_reason_texts = {}

  if (sourceType === 'comment') {
    if (repliedUserId && relatedSourceType)
      notifyRepliedUser(userToReasonTexts, repliedUserId, relatedSourceType)
    if (sourceText) notifyTaggedUsers(userToReasonTexts, taggedUserIds ?? [])
  }
  await notifyContractCreator(userToReasonTexts)
  await notifyOtherAnswerersOnContract(userToReasonTexts)
  await notifyLiquidityProviders(userToReasonTexts)
  await notifyBettorsOnContract(userToReasonTexts)
  await notifyOtherCommentersOnContract(userToReasonTexts)
  // if they weren't added previously, add them now
  await notifyContractFollowers(userToReasonTexts)

  await createUsersNotifications(userToReasonTexts)
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
}

export const createBetFillNotification = async (
  fromUser: User,
  toUser: User,
  bet: Bet,
  userBet: LimitBet,
  contract: Contract,
  idempotencyKey: string
) => {
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
}

export const createGroupCommentNotification = async (
  fromUser: User,
  toUserId: string,
  comment: Comment,
  group: Group,
  idempotencyKey: string
) => {
  if (toUserId === fromUser.id) return
  const notificationRef = firestore
    .collection(`/users/${toUserId}/notifications`)
    .doc(idempotencyKey)
  const sourceSlug = `/group/${group.slug}/${GROUP_CHAT_SLUG}`
  const notification: Notification = {
    id: idempotencyKey,
    userId: toUserId,
    reason: 'on_group_you_are_member_of',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: comment.id,
    sourceType: 'comment',
    sourceUpdateType: 'created',
    sourceUserName: fromUser.name,
    sourceUserUsername: fromUser.username,
    sourceUserAvatarUrl: fromUser.avatarUrl,
    sourceText: richTextToString(comment.content),
    sourceSlug,
    sourceTitle: `${group.name}`,
    isSeenOnHref: sourceSlug,
  }
  await notificationRef.set(removeUndefinedProps(notification))
}

export const createReferralNotification = async (
  toUser: User,
  referredUser: User,
  idempotencyKey: string,
  bonusAmount: string,
  referredByContract?: Contract,
  referredByGroup?: Group
) => {
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
}

export const createLoanIncomeNotification = async (
  toUser: User,
  idempotencyKey: string,
  income: number
) => {
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
  const notificationRef = firestore
    .collection(`/users/${toUser.id}/notifications`)
    .doc(idempotencyKey)
  const notification: Notification = {
    id: idempotencyKey,
    userId: toUser.id,
    reason: tip ? 'liked_and_tipped_your_contract' : 'liked_your_contract',
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
}
