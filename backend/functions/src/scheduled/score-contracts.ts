import * as functions from 'firebase-functions'
import { secrets } from 'common/secrets'

import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
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
