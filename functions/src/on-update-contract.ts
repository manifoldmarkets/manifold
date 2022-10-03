import * as functions from 'firebase-functions'
import { getUser } from './utils'
import { createCommentOrAnswerOrUpdatedContractNotification } from './create-notification'
import { Contract } from '../../common/contract'

export const onUpdateContract = functions.firestore
  .document('contracts/{contractId}')
  .onUpdate(async (change, context) => {
    const contract = change.after.data() as Contract
    const previousContract = change.before.data() as Contract
    const { eventId } = context
    const { openCommentBounties, closeTime, question } = contract

    if (
      !previousContract.isResolved &&
      contract.isResolved &&
      (openCommentBounties ?? 0) > 0
    ) {
      // No need to notify users of resolution, that's handled in resolve-market
      return
    }
    if (
      previousContract.closeTime !== closeTime ||
      previousContract.question !== question
    ) {
      await handleUpdatedCloseTime(previousContract, contract, eventId)
    }
  })

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
