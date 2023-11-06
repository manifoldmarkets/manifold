import { secrets } from 'common/secrets'
import {
  addInterestingContractsToFeed,
  MINUTE_INTERVAL,
} from 'shared/add-interesting-contracts-to-feed'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { runSingleton } from 'shared/firestore-lock'

export const addcontractstofeed = onSchedule(
  {
    schedule: `every ${MINUTE_INTERVAL} minutes`,
    timeoutSeconds: 3600,
    memory: '4GiB',
    secrets,
    cpu: 2
  },
  async () => {
    await runSingleton('add-contracts-to-feed', async () => {
      const db = createSupabaseClient()
      const pg = createSupabaseDirectClient()
      const startTime = Date.now()
      // TODO: we should just turn this into a docker container
      // Keep running with the users cached (we refresh for new users) until we've just 10 minutes left,
      // on the next run we'll do a full refresh (picking a new random sample of old users)
      while (Date.now() < startTime + (MINUTE_INTERVAL - 10) * 60 * 1000) {
        await addInterestingContractsToFeed(db, pg)
      }

    })
  }
)
