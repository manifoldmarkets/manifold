import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import * as _ from 'lodash'

import { getContract, getUser, getValues } from './utils'
import { Comment } from '../../common/comment'
import { sendNewCommentEmail } from './emails'
import { Bet } from '../../common/bet'

const firestore = admin.firestore()

export const onCreateComment = functions.firestore
  .document('contracts/{contractId}/comments/{commentId}')
  .onCreate(async (change, context) => {
    const { contractId } = context.params as {
      contractId: string
    }

    const contract = await getContract(contractId)
    if (!contract) return

    const comment = change.data() as Comment

    const commentCreator = await getUser(comment.userId)
    if (!commentCreator) return

    const betSnapshot = await firestore
      .collection('contracts')
      .doc(contractId)
      .collection('bets')
      .doc(comment.betId)
      .get()
    const bet = betSnapshot.data() as Bet

    const answer =
      contract.outcomeType === 'FREE_RESPONSE' && contract.answers
        ? contract.answers.find((answer) => answer.id === bet.outcome)
        : undefined

    const comments = await getValues<Comment>(
      firestore.collection('contracts').doc(contractId).collection('comments')
    )

    const recipientUserIds = _.uniq([
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
          answer
        )
      )
    )
  })
