import * as functions from 'firebase-functions'
import { getUser, getValues } from './utils'
import { createCommentOrAnswerOrUpdatedContractNotification } from './create-notification'
import { Contract } from '../../common/contract'
import { Bet } from '../../common/bet'
import * as admin from 'firebase-admin'
import { ContractComment } from '../../common/comment'
import { scoreCommentorsAndBettors } from '../../common/scoring'
import {
  MINIMUM_UNIQUE_BETTORS_FOR_PROVEN_CORRECT_BADGE,
  ProvenCorrectBadge,
} from '../../common/badge'

export const onUpdateContract = functions.firestore
  .document('contracts/{contractId}')
  .onUpdate(async (change, context) => {
    const contract = change.after.data() as Contract
    const { eventId } = context

    const contractUpdater = await getUser(contract.creatorId)
    if (!contractUpdater) throw new Error('Could not find contract updater')

    const previousValue = change.before.data() as Contract

    // Notifications for market resolution are also handled in resolve-market.ts
    if (!previousValue.isResolved && contract.isResolved)
      return await handleResolvedContract(contract)

    if (
      previousValue.closeTime !== contract.closeTime ||
      previousValue.question !== contract.question
    ) {
      let sourceText = ''
      if (
        previousValue.closeTime !== contract.closeTime &&
        contract.closeTime
      ) {
        sourceText = contract.closeTime.toString()
      } else if (previousValue.question !== contract.question) {
        sourceText = contract.question
      }

      await createCommentOrAnswerOrUpdatedContractNotification(
        contract.id,
        'contract',
        'updated',
        contractUpdater,
        eventId,
        sourceText,
        contract
      )
    }
  })
const firestore = admin.firestore()

async function handleResolvedContract(contract: Contract) {
  if (
    (contract.uniqueBettorCount ?? 0) <
    MINIMUM_UNIQUE_BETTORS_FOR_PROVEN_CORRECT_BADGE
  )
    return

  // get all bets on this contract
  const bets = await getValues<Bet>(
    firestore.collection(`contracts/${contract.id}/bets`)
  )

  // get comments on this contract
  const comments = await getValues<ContractComment>(
    firestore.collection(`contracts/${contract.id}/comments`)
  )

  const { topCommentId, profitById, commentsById, betsById } =
    scoreCommentorsAndBettors(contract, bets, comments)
  if (topCommentId && profitById[topCommentId] > 0) {
    // award proven correct badge to user
    const comment = commentsById[topCommentId]
    const bet = betsById[topCommentId]

    const user = await getUser(comment.userId)
    if (!user) return
    const newProvenCorrectBadge = {
      createdTime: Date.now(),
      type: 'PROVEN_CORRECT',
      data: {
        contractSlug: contract.slug,
        contractCreatorUsername: contract.creatorUsername,
        commentId: comment.id,
        betAmount: bet.amount,
        contractTitle: contract.question,
      },
    } as ProvenCorrectBadge
    // update user
    await firestore
      .collection('users')
      .doc(user.id)
      .update({
        achievements: {
          ...user.achievements,
          provenCorrect: {
            totalBadges:
              (user.achievements?.provenCorrect?.totalBadges ?? 0) + 1,
            badges: [
              ...(user.achievements?.provenCorrect?.badges ?? []),
              newProvenCorrectBadge,
            ],
          },
        },
      })
  }
}
