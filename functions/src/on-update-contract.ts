import * as functions from 'firebase-functions'
import { getUser } from './utils'
import { createCommentOrAnswerOrUpdatedContractNotification } from './create-notification'
import { Contract } from '../../common/contract'
import { GroupContractDoc } from '../../common/group'
import * as admin from 'firebase-admin'

export const onUpdateContract = functions.firestore
  .document('contracts/{contractId}')
  .onUpdate(async (change, context) => {
    const contract = change.after.data() as Contract
    const previousContract = change.before.data() as Contract
    const { eventId } = context
    const { closeTime, question } = contract

    if (!previousContract.isResolved && contract.isResolved) {
      // No need to notify users of resolution, that's handled in resolve-market
      return
    } else if (previousContract.groupSlugs !== contract.groupSlugs) {
      await handleContractGroupUpdated(previousContract, contract)
    } else if (
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
