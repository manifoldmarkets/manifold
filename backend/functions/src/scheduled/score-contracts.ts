import * as functions from 'firebase-functions'
import { secrets } from 'common/secrets'
import {
  MINUTE_INTERVAL,
} from 'shared/score-contracts-internal'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { invokeFunction, log } from 'shared/utils'
import { onRequest } from 'firebase-functions/v2/https'
import {
  IMPORTANCE_MINUTE_INTERVAL,
  calculateImportanceScore,
} from 'shared/importance-score'

export const importanceScoreScheduler = functions
  .runWith({ secrets })
  .pubsub.schedule(`every ${IMPORTANCE_MINUTE_INTERVAL} minutes`)
  .onRun(async () => {
    const db = createSupabaseClient()
    const pg = createSupabaseDirectClient()
    await calculateImportanceScore(db, pg)
  })

export const scoreContractsScheduler = functions
  .runWith({
    memory: '1GB',
    timeoutSeconds: 540,
    secrets,
  })
  .pubsub.schedule(`every ${MINUTE_INTERVAL} minutes`)
  .onRun(async () => {
    try {
      log('running score contracts firebase v2 function')
      log(await invokeFunction('scorecontracts'))
    } catch (e) {
      console.error(e)
    }
  })

// TODO: Make more robust.
// This process is really slow
export const scorecontracts = onRequest(
  { timeoutSeconds: 3600, memory: '1GiB', secrets },
  async (_req, res) => {
    const db = createSupabaseClient()
    const pg = createSupabaseDirectClient()
    // await scoreContractsInternal(db, pg)
    res.status(200).json({ success: true })
  }
)
