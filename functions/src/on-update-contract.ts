import * as functions from 'firebase-functions'
import { getUser, getValues } from './utils'
import {
  createBadgeAwardedNotification,
  createCommentOrAnswerOrUpdatedContractNotification,
} from './create-notification'
import { Contract } from '../../common/contract'
import { Bet } from '../../common/bet'
import * as admin from 'firebase-admin'
import { ContractComment } from '../../common/comment'
import { scoreCommentorsAndBettors } from '../../common/scoring'
import {
  MINIMUM_UNIQUE_BETTORS_FOR_PROVEN_CORRECT_BADGE,
  ProvenCorrectBadge,
} from '../../common/badge'
import { GroupContractDoc } from '../../common/group'

export const onUpdateContract = functions.firestore
  .document('contracts/{contractId}')
  .onUpdate(async (change, context) => {
    const contract = change.after.data() as Contract
    const previousContract = change.before.data() as Contract
    const { eventId } = context
    const { closeTime, question } = contract

    if (!previousContract.isResolved && contract.isResolved) {
      // No need to notify users of resolution, that's handled in resolve-market
      return await handleResolvedContract(contract)
    } else if (previousContract.groupSlugs !== contract.groupSlugs) {
      await handleContractGroupUpdated(previousContract, contract)
    } else if (
      previousContract.closeTime !== closeTime ||
      previousContract.question !== question
    ) {
      await handleUpdatedCloseTime(previousContract, contract, eventId)
    }
  })

async function handleResolvedContract(contract: Contract) {
  if (
    (contract.uniqueBettorCount ?? 0) <
      MINIMUM_UNIQUE_BETTORS_FOR_PROVEN_CORRECT_BADGE ||
    contract.resolution === 'CANCEL'
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

  const { topCommentId, profitById, commentsById, betsById, topCommentBetId } =
    scoreCommentorsAndBettors(contract, bets, comments)
  if (topCommentBetId && profitById[topCommentBetId] > 0) {
    // award proven correct badge to user
    const comment = commentsById[topCommentId]
    const bet = betsById[topCommentBetId]

    const user = await getUser(comment.userId)
    if (!user) return
    const newProvenCorrectBadge = {
      createdTime: Date.now(),
      type: 'PROVEN_CORRECT',
      name: 'Proven Correct',
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
            badges: [
              ...(user.achievements?.provenCorrect?.badges ?? []),
              newProvenCorrectBadge,
            ],
          },
        },
      })
    await createBadgeAwardedNotification(user, newProvenCorrectBadge)
  }
}

async function handleUpdatedCloseTime(
  previousContract: Contract,
  contract: Contract,
  eventId: string
) {
  const contractUpdater = await getUser(contract.creatorId)
  if (!contractUpdater) throw new Error('Could not find contract updater')
  let sourceText = ''
  if (previousContract.closeTime !== contract.closeTime && contract.closeTime) {
    sourceText = contract.closeTime.toString()
  } else if (previousContract.question !== contract.question) {
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

async function handleContractGroupUpdated(
  previousContract: Contract,
  contract: Contract
) {
  const prevLength = previousContract.groupSlugs?.length ?? 0
  const newLength = contract.groupSlugs?.length ?? 0
  if (prevLength < newLength) {
    // Contract was added to a new group
    const groupId = contract.groupLinks?.find(
      (link) =>
        !previousContract.groupLinks
          ?.map((l) => l.groupId)
          .includes(link.groupId)
    )?.groupId
    if (!groupId) throw new Error('Could not find new group id')

    await firestore
      .collection(`groups/${groupId}/groupContracts`)
      .doc(contract.id)
      .set({
        contractId: contract.id,
        createdTime: Date.now(),
      } as GroupContractDoc)
  }
  if (prevLength > newLength) {
    // Contract was removed from a group
    const groupId = previousContract.groupLinks?.find(
      (link) =>
        !contract.groupLinks?.map((l) => l.groupId).includes(link.groupId)
    )?.groupId
    if (!groupId) throw new Error('Could not find old group id')

    await firestore
      .collection(`groups/${groupId}/groupContracts`)
      .doc(contract.id)
      .delete()
  }
}
const firestore = admin.firestore()
