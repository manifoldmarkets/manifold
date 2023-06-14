import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { uniq } from 'lodash'
import { createSupabaseClient } from 'shared/supabase/init'
import { secrets } from 'common/secrets'
import { getAnswersForContracts } from 'common/supabase/contracts'

export const denormalizeAnswers = functions
  .runWith({
    secrets,
    timeoutSeconds: 540,
  })
  .pubsub.schedule('*/1 * * * *') // runs every minute
  .onRun(denormalizeAnswersCore)

export async function denormalizeAnswersCore() {
  const db = createSupabaseClient()

  // Fetch answers modified in the last minute (plus 5 seconds)
  const oneMinuteAgo = new Date(Date.now() - 65 * 1000)
  const { data: recentAnswers } = await db
    .from('answers')
    .select('contract_id')
    .gt('fs_updated_time', oneMinuteAgo.toISOString())

  if (!recentAnswers || recentAnswers.length === 0) {
    console.log('No recently updated answers')
    return
  }

  const contractIds = uniq(
    recentAnswers.map((answer) => answer.contract_id as string)
  )

  console.log('Denormalizing answers for contracts: ', contractIds)

  const answersByContractId = await getAnswersForContracts(db, contractIds)
  await Promise.all(
    Object.entries(answersByContractId).map(([contractId, answers]) => {
      return firestore.collection('contracts').doc(contractId).update({
        answers,
      })
    })
  )
  console.log('Done.')
}

const firestore = admin.firestore()
