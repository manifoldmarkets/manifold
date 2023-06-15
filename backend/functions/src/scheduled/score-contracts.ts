import * as functions from 'firebase-functions'
import { secrets } from 'common/secrets'
import { scoreContractsInternal } from 'shared/score-contracts-internal'
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
  .pubsub.schedule('every 10 minutes')
  .onRun(async () => {
    const fr = admin.firestore()
    const db = createSupabaseClient()
    const pg = createSupabaseDirectClient()
    await scoreContractsInternal(fr, db, pg)
  })
