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

export const scoreContracts = functions
  .runWith({
    memory: '1GB',
    timeoutSeconds: 540,
    secrets,
  })
  .pubsub.schedule(`every ${MINUTE_INTERVAL} minutes`)
  .onRun(async () => {
    const fr = admin.firestore()
    const db = createSupabaseClient()
    const pg = createSupabaseDirectClient()
    await scoreContractsInternal(fr, db, pg)
  })
