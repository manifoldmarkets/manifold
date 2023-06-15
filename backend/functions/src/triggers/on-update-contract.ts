import * as functions from 'firebase-functions'
import { getUser, processPaginated, revalidateStaticProps } from 'shared/utils'
import { createCommentOrAnswerOrUpdatedContractNotification } from 'shared/create-notification'
import { Contract, contractPath } from 'common/contract'
import * as admin from 'firebase-admin'

import { isEqual } from 'lodash'
import { secrets } from 'common/secrets'
import { run } from 'common/supabase/utils'
import { createSupabaseClient } from 'shared/supabase/init'

export const onUpdateContract = functions
  .runWith({ secrets })
  .firestore.document('contracts/{contractId}')
  .onUpdate(async (change, context) => {
    const contract = change.after.data() as Contract
    const previousContract = change.before.data() as Contract
    const { eventId } = context
    const { closeTime, question, description, resolution } = contract

    const db = createSupabaseClient()

    if (
      !isEqual(previousContract.description, description) ||
      !isEqual(previousContract.question, question) ||
      !isEqual(previousContract.closeTime, closeTime) ||
      !isEqual(previousContract.resolution, resolution)
    ) {
      await run(
        db.from('contract_edits').insert({
          contract_id: contract.id,
          editor_id: contract.creatorId,
          data: previousContract,
          idempotency_key: eventId,
        })
      )
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
      // Check if replicated to supabase before revalidating contract.
      const result = await db
        .from('contracts')
        .select('*')
        .eq('id', contract.id)
        .limit(1)
      if (result.data && result.data.length > 0) {
        await revalidateContractStaticProps(contract)
      }
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
  const batchSize = 500

  // Update comments' visibility
  const commentsRef = contractRef.collection('comments')
  await processPaginated(commentsRef, batchSize, (ts) => {
    const updatePromises = ts.docs.map((doc) => {
      return doc.ref.update({ visibility: newVisibility })
    })
    return Promise.all(updatePromises)
  })

  // Update bets' visibility
  const betsRef = contractRef.collection('bets')
  await processPaginated(betsRef, batchSize, (ts) => {
    const updatePromises = ts.docs.map((doc) => {
      return doc.ref.update({ visibility: newVisibility })
    })
    return Promise.all(updatePromises)
  })
}

async function revalidateContractStaticProps(contract: Contract) {
  await revalidateStaticProps(contractPath(contract))
  await revalidateStaticProps(`/embed${contractPath(contract)}`)
}

const firestore = admin.firestore()
