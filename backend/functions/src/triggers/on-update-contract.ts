import * as functions from 'firebase-functions'
import { getUser, revalidateStaticProps } from 'shared/utils'
import { createCommentOrAnswerOrUpdatedContractNotification } from 'shared/create-notification'
import { Contract, contractPath } from 'common/contract'
import * as admin from 'firebase-admin'

import { GroupContractDoc } from 'common/group'
import { isEqual } from 'lodash'
import { secrets } from 'shared/secrets'

export const onUpdateContract = functions
  .runWith({ secrets })
  .firestore.document('contracts/{contractId}')
  .onUpdate(async (change, context) => {
    const contract = change.after.data() as Contract
    const previousContract = change.before.data() as Contract
    const { eventId } = context
    const { closeTime, question } = contract

    if (!isEqual(previousContract.groupSlugs, contract.groupSlugs)) {
      await handleContractGroupUpdated(previousContract, contract)
    }

    if (
      (previousContract.closeTime !== closeTime ||
        previousContract.question !== question) &&
      !contract.isResolved
    ) {
      await handleUpdatedCloseTime(previousContract, contract, eventId)
    }

    if (
      !isEqual(
        getPropsThatTriggerRevalidation(previousContract),
        getPropsThatTriggerRevalidation(contract)
      )
    ) {
      await revalidateContractStaticProps(contract)
    }

    if (previousContract.visibility !== contract.visibility) {
      const newVisibility = contract.visibility as 'public' | 'unlisted'

      await updateContractSubcollectionsVisibility(contract.id, newVisibility)
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
      (link) => !contract.groupLinks?.some((l) => l.groupId === link.groupId)
    )?.groupId
    if (!groupId) throw new Error('Could not find old group id')

    await firestore
      .collection(`groups/${groupId}/groupContracts`)
      .doc(contract.id)
      .delete()
  }
}

const getPropsThatTriggerRevalidation = (contract: Contract) => {
  const { volume, question, closeTime, description, groupLinks } = contract
  return {
    volume,
    question,
    closeTime,
    description,
    groupLinks,
  }
}

async function updateContractSubcollectionsVisibility(
  contractId: string,
  newVisibility: 'public' | 'unlisted'
) {
  const contractRef = firestore.collection('contracts').doc(contractId)

  // Update comments' visibility
  const commentsRef = contractRef.collection('comments')
  const commentsSnapshot = await commentsRef.get()

  let commentsBatch = firestore.batch()
  let commentsCounter = 0

  for (const commentDoc of commentsSnapshot.docs) {
    commentsBatch.update(commentDoc.ref, { visibility: newVisibility })
    commentsCounter++

    if (commentsCounter === 500) {
      // Maximum batch size is 500 operations
      await commentsBatch.commit()
      commentsBatch = firestore.batch()
      commentsCounter = 0
    }
  }

  if (commentsCounter > 0) {
    await commentsBatch.commit()
  }

  // Update bets' visibility
  const betsRef = contractRef.collection('bets')
  const betsSnapshot = await betsRef.get()

  let betsBatch = firestore.batch()
  let betsCounter = 0

  for (const betDoc of betsSnapshot.docs) {
    betsBatch.update(betDoc.ref, { visibility: newVisibility })
    betsCounter++

    if (betsCounter === 500) {
      // Maximum batch size is 500 operations
      await betsBatch.commit()
      betsBatch = firestore.batch()
      betsCounter = 0
    }
  }

  if (betsCounter > 0) {
    await betsBatch.commit()
  }
}

async function revalidateContractStaticProps(contract: Contract) {
  await revalidateStaticProps(contractPath(contract))
  await revalidateStaticProps(`/embed${contractPath(contract)}`)
}

const firestore = admin.firestore()
