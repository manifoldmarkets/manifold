import * as admin from 'firebase-admin'
import {
  Notification,
  notification_reason_types,
  notification_source_types,
} from '../../common/notification'
import { User } from '../../common/user'
import { Contract } from '../../common/contract'
import { getValues } from './utils'
import { Comment } from '../../common/comment'
import { uniq } from 'lodash'
import { Bet } from '../../common/bet'
import { Answer } from '../../common/answer'
const firestore = admin.firestore()

type user_to_reason_texts = {
  [userId: string]: { text: string; reason: notification_reason_types }
}

export const createNotification = async (
  sourceId: string,
  sourceType: notification_source_types,
  reason: notification_reason_types,
  sourceContract: Contract,
  sourceUser: User,
  idempotencyKey: string
) => {
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
          reasonText: userToReasonTexts[userId].text,
          reason: userToReasonTexts[userId].reason,
          createdTime: Date.now(),
          isSeen: false,
          sourceId,
          sourceType,
          sourceContractId: sourceContract.id,
          sourceUserName: sourceUser.name,
          sourceUserUsername: sourceUser.username,
          sourceUserAvatarUrl: sourceUser.avatarUrl,
        }
        await notificationRef.set(notification)
      })
    )
  }

  // TODO: Update for liquidity.
  // TODO: Find tagged users.
  // TODO: Find replies to comments.
  // TODO: Filter bets for only open bets
  if (
    sourceType === 'comment' ||
    sourceType === 'answer' ||
    sourceType === 'contract'
  ) {
    let reasonTextPretext = getReasonTextFromReason(sourceType, reason)

    const notifyContractCreator = async (
      userToReasonTexts: user_to_reason_texts
    ) => {
      if (shouldGetNotification(sourceContract.creatorId, userToReasonTexts))
        userToReasonTexts[sourceContract.creatorId] = {
          text: `${reasonTextPretext} your question`,
          reason,
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
        if (shouldGetNotification(userId, userToReasonTexts))
          userToReasonTexts[userId] = {
            text: `${reasonTextPretext} a question you submitted an answer to`,
            reason,
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
        if (shouldGetNotification(userId, userToReasonTexts))
          userToReasonTexts[userId] = {
            text: `${reasonTextPretext} a question you commented on`,
            reason,
          }
      })
    }

    const notifyOtherBettorsOnContract = async (
      userToReasonTexts: user_to_reason_texts
    ) => {
      const betsSnap = await firestore
        .collection(`contracts/${sourceContract.id}/bets`)
        .get()
      const bets = betsSnap.docs.map((doc) => doc.data() as Bet)
      const recipientUserIds = uniq(bets.map((bet) => bet.userId))
      recipientUserIds.forEach((userId) => {
        if (shouldGetNotification(userId, userToReasonTexts))
          userToReasonTexts[userId] = {
            text: `${reasonTextPretext} a question you bet on`,
            reason,
          }
      })
    }

    const getUsersToNotify = async () => {
      const userToReasonTexts: user_to_reason_texts = {}
      // The following functions modify the userToReasonTexts object in place.
      await notifyContractCreator(userToReasonTexts)
      await notifyOtherAnswerersOnContract(userToReasonTexts)
      await notifyOtherCommentersOnContract(userToReasonTexts)
      await notifyOtherBettorsOnContract(userToReasonTexts)
      return userToReasonTexts
    }

    const userToReasonTexts = await getUsersToNotify()
    await createUsersNotifications(userToReasonTexts)
  }
}

function getReasonTextFromReason(
  source: notification_source_types,
  reason: notification_reason_types
) {
  // TODO: Find tagged users.
  // TODO: Find replies to comments.
  switch (source) {
    case 'comment':
      return 'commented on'
    case 'contract':
      return reason
    case 'answer':
      return 'answered'
    default:
      throw new Error('Invalid notification reason')
  }
}
