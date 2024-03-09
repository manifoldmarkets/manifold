import * as functions from 'firebase-functions'
import {
  getUser,
  log,
  processPaginated,
  revalidateContractStaticProps,
} from 'shared/utils'
import { createCommentOrUpdatedContractNotification } from 'shared/create-notification'
import { Contract, CPMMMultiContract, MultiContract } from 'common/contract'
import * as admin from 'firebase-admin'
import { isEqual, pick } from 'lodash'
import { secrets } from 'common/secrets'
import { createSupabaseClient } from 'shared/supabase/init'

type AnyContract = Contract & CPMMMultiContract & MultiContract
const propsThatTriggerRevalidation: (keyof AnyContract)[] = [
  // 'volume', // This DOES trigger revalidation, but is run in place-bet.ts
  'question',
  'closeTime',
  'description',
  'groupLinks',
  'lastCommentTime',
  'visibility',
  'addAnswersMode',
  'sort',
  'coverImageUrl',
  'isPolitics',
] as const

const propsThatTriggerUpdatedTime: (keyof AnyContract)[] = [
  'question',
  'description',
  'closeTime',
  'groupLinks',
  'isResolved',
  'isRanked',
  'isSubsidized',
  'visibility',
] as const

export const onUpdateContract = functions
  .runWith({ secrets })
  .firestore.document('contracts/{contractId}')
  .onUpdate(async (change, context) => {
    const contract = change.after.data() as Contract
    const previousContract = change.before.data() as Contract
    const { eventId } = context
    const { closeTime, question } = contract

    const db = createSupabaseClient()

    if (
      (previousContract.closeTime !== closeTime ||
        previousContract.question !== question) &&
      !contract.isResolved
    ) {
      await handleUpdatedCloseTime(previousContract, contract, eventId)
    }

    if (
      !isEqual(
        pick(previousContract, propsThatTriggerRevalidation),
        pick(contract, propsThatTriggerRevalidation)
      )
    ) {
      // Check if replicated to supabase before revalidating contract.
      const result = await db
        .from('contracts')
        .select('id')
        .eq('id', contract.id)
        .limit(1)
      if (result.data && result.data.length > 0) {
        log(`Revalidating contract ${contract.id}.`)
        await revalidateContractStaticProps(contract)
      }
    }

    if (previousContract.visibility !== contract.visibility) {
      const newVisibility = contract.visibility as 'public' | 'unlisted'

      await updateContractSubcollectionsVisibility(contract.id, newVisibility)
    }

    if (
      !isEqual(
        pick(previousContract, propsThatTriggerUpdatedTime),
        pick(contract, propsThatTriggerUpdatedTime)
      )
    ) {
      log(`Updating lastUpdatedTime for contract ${contract.id}.`)
      // mqp: ugly to do this update in the trigger but i was too lazy
      // to fix all the random call sites
      await firestore.collection('contracts').doc(contract.id).update({
        lastUpdatedTime: Date.now(),
      })
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

  await createCommentOrUpdatedContractNotification(
    contract.id,
    'contract',
    'updated',
    contractUpdater,
    eventId,
    sourceText,
    contract
  )
}

async function updateContractSubcollectionsVisibility(
  contractId: string,
  newVisibility: 'public' | 'unlisted'
) {
  const contractRef = firestore.collection('contracts').doc(contractId)
  const batchSize = 500

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
