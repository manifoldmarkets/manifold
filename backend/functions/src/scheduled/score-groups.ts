import * as functions from 'firebase-functions'
import { secrets } from 'common/secrets'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { calculateGroupImportanceScore } from 'shared/group-importance-score'

const IMPORTANCE_MINUTE_INTERVAL = 60
export const groupImportanceScoreScheduler = functions
  .runWith({ secrets })
  .pubsub.schedule(`every ${IMPORTANCE_MINUTE_INTERVAL} minutes`)
  .onRun(async () => {
    const pg = createSupabaseDirectClient()
    await calculateGroupImportanceScore(pg)
  })
