import * as functions from 'firebase-functions'
import {
  getContractSupabase,
  getUser,
  processPaginated,
  revalidateContractStaticProps,
} from 'shared/utils'
import { createCommentOrAnswerOrUpdatedContractNotification } from 'shared/create-notification'
import { Contract } from 'common/contract'
import * as admin from 'firebase-admin'

import { difference, isEqual } from 'lodash'
import { secrets } from 'common/secrets'
import { run } from 'common/supabase/utils'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { upsertGroupEmbedding } from 'shared/helpers/embeddings'
import { buildArray } from 'common/util/array'
import { addContractToFeed } from 'shared/create-feed'
import { DAY_MS } from 'common/util/time'

export const onUpdateContract = functions
  .runWith({ secrets })
  .firestore.document('contracts/{contractId}')
  .onUpdate(async (change, context) => {
    const contract = change.after.data() as Contract
    const previousContract = change.before.data() as Contract
    const { eventId } = context
    const { closeTime, question, description, groupLinks } = contract

    const db = createSupabaseClient()
    const pg = createSupabaseDirectClient()

    if (
      !isEqual(previousContract.description, description) ||
      !isEqual(previousContract.question, question)
    ) {
      await run(
        db.from('contract_edits').insert({
          contract_id: contract.id,
          editor_id: contract.creatorId,
          data: previousContract,
          idempotency_key: eventId,
          updated_keys: buildArray([
            !isEqual(previousContract.description, description) &&
              'description',
            !isEqual(previousContract.question, question) && 'question',
          ]),
        })
      )
    }

    // Update group embeddings if group links changed
    const previousGroupIds = (previousContract.groupLinks ?? []).map(
      (gl) => gl.groupId
    )
    const currentGroupIds = (groupLinks ?? []).map((gl) => gl.groupId)
    const onlyNewGroupIds = difference(currentGroupIds, previousGroupIds)
    const differentGroupIds = onlyNewGroupIds.concat(
      difference(previousGroupIds, currentGroupIds)
    )
    await Promise.all(
      differentGroupIds.map(async (groupId) =>
        upsertGroupEmbedding(pg, groupId)
      )
    )
    // Adding a contract to a group is ~similar~ to creating a new contract in that group
    if (
      onlyNewGroupIds.length > 0 &&
      contract.createdTime > Date.now() - 2 * DAY_MS
    ) {
      const contractWithScore = await getContractSupabase(contract.id)
      if (!contractWithScore) return
      await addContractToFeed(
        contractWithScore,
        ['contract_in_group_you_are_in'],
        'new_contract',
        [contractWithScore.creatorId],
        {
          idempotencyKey: contractWithScore.id + '_new_contract',
        }
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
  const {
    volume,
    question,
    closeTime,
    description,
    groupLinks,
    lastCommentTime,
  } = contract
  return {
    volume,
    question,
    closeTime,
    description,
    groupLinks,
    lastCommentTime,
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

const firestore = admin.firestore()
