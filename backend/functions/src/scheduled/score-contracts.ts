import * as functions from 'firebase-functions'
import { secrets } from 'common/secrets'
import {
  MINUTE_INTERVAL,
  scoreContractsInternal,
} from 'shared/score-contracts-internal'
import * as admin from 'firebase-admin'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { invokeFunction, log } from 'shared/utils'
import { onRequest } from 'firebase-functions/v2/https'

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

export const scorecontracts = onRequest(
  { timeoutSeconds: 3600, memory: '1GiB' },
  async (_req, res) => {
    const fr = admin.firestore()
    const db = createSupabaseClient()
    const pg = createSupabaseDirectClient()
    await scoreContractsInternal(fr, db, pg)
    res.status(200).json({ success: true })
  }
)
