import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { uniq } from 'lodash'

import { getContract, getUser, getValues } from './utils'
import { Comment } from '../../common/comment'
import { sendNewCommentEmail } from './emails'
import { Bet } from '../../common/bet'
import { Answer } from '../../common/answer'
import { createNotification } from './create-notification'
import { NotificationSourceTypes } from '../../common/notification'

const firestore = admin.firestore()

export const onCreateComment = functions.firestore
  .document('contracts/{contractId}/comments/{commentId}')
  .onCreate(async (change, context) => {
    const { contractId } = context.params as {
      contractId: string
    }

    const contract = await getContract(contractId)
    if (!contract)
      throw new Error('Could not find contract corresponding with comment')

    const comment = change.data() as Comment
    const lastCommentTime = comment.createdTime

    const commentCreator = await getUser(comment.userId)
    if (!commentCreator) throw new Error('Could not find comment creator')

    await createNotification(
      comment.id,
      NotificationSourceTypes.COMMENT,
      contract,
      commentCreator
    )

    await firestore
      .collection('contracts')
      .doc(contract.id)
      .update({ lastCommentTime, lastUpdatedTime: Date.now() })

    let bet: Bet | undefined
    let answer: Answer | undefined
    if (comment.answerOutcome) {
      answer =
        contract.outcomeType === 'FREE_RESPONSE' && contract.answers
          ? contract.answers?.find(
              (answer) => answer.id === comment.answerOutcome
            )
          : undefined
    } else if (comment.betId) {
      const betSnapshot = await firestore
        .collection('contracts')
        .doc(contractId)
        .collection('bets')
        .doc(comment.betId)
        .get()
      bet = betSnapshot.data() as Bet

      answer =
        contract.outcomeType === 'FREE_RESPONSE' && contract.answers
          ? contract.answers.find((answer) => answer.id === bet?.outcome)
          : undefined
    }

    const comments = await getValues<Comment>(
      firestore.collection('contracts').doc(contractId).collection('comments')
    )

    const recipientUserIds = uniq([
      contract.creatorId,
      ...comments.map((comment) => comment.userId),
    ]).filter((id) => id !== comment.userId)

    await Promise.all(
      recipientUserIds.map((userId) =>
        sendNewCommentEmail(
          userId,
          commentCreator,
          contract,
          comment,
          bet,
          answer?.text,
          answer?.id
        )
      )
    )
  })
