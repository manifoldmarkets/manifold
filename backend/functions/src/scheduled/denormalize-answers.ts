import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { chunk, sortBy } from 'lodash'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { secrets } from 'common/secrets'
import { getAnswersForContracts } from 'common/supabase/contracts'
import { SupabaseClient } from 'common/supabase/utils'

export const denormalizeAnswers = functions
  .runWith({
    secrets,
    timeoutSeconds: 540,
  })
  .pubsub.schedule('*/1 * * * *') // runs every minute
  .onRun(denormalizeAnswersCore)

export async function denormalizeAnswersCore() {
  const pg = createSupabaseDirectClient()

  // Fetch answers modified in the last minute (plus 5 seconds)
  const oneMinuteAgo = new Date(Date.now() - 65 * 1000)
  const contractIds = await pg.map(
    `
        select id from contracts
        where last_updated_time > $1
        and mechanism = 'cpmm-multi-1'
        `,
    [oneMinuteAgo.toISOString()],
    (r) => r.id as string
  )
  console.log('Denormalizing answers for contracts: ', contractIds)

  const contractIdChunks = chunk(contractIds, 20)
  const db = createSupabaseClient()
  for (const contractIdChunk of contractIdChunks) {
    await denormalizeContractAnswers(db, contractIdChunk)
  }

  console.log('Done.')
}

export const denormalizeContractAnswers = async (
  db: SupabaseClient,
  contractIds: string[]
) => {
  const answersByContractId = await getAnswersForContracts(db, contractIds)
  console.log('Got answers for chunk', contractIds)
  await Promise.all(
    Object.entries(answersByContractId).map(([contractId, answers]) => {
      const sortedAnswers = sortBy(answers, (answer) => answer.index)
      return firestore.collection('contracts').doc(contractId).update({
        answers: sortedAnswers,
      })
    })
  )
}

const firestore = admin.firestore()
