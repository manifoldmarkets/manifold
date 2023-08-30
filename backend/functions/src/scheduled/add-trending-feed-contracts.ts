import * as functions from 'firebase-functions'
import { secrets } from 'common/secrets'
import {
  addInterestingContractsToFeed,
  MINUTE_INTERVAL,
} from 'shared/add-interesting-contracts-to-feed'
import { invokeFunction, log } from 'shared/utils'
import { onRequest } from 'firebase-functions/v2/https'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'

export const addTrendingFeedContractsScheduler = functions
  .runWith({
    timeoutSeconds: 540,
    secrets,
  })
  .pubsub.schedule(`every ${MINUTE_INTERVAL} minutes`)
  .onRun(async () => {
    try {
      log('running addcontractstofeed firebase v2 function')
      log(await invokeFunction('addcontractstofeed'))
    } catch (e) {
      console.error(e)
    }
  })

export const addcontractstofeed = onRequest(
  {
    timeoutSeconds: MINUTE_INTERVAL * 60,
    memory: '4GiB',
    secrets,
    cpu: 2,
  },
  async (_req, res) => {
    const db = createSupabaseClient()
    const pg = createSupabaseDirectClient()
    const startTime = Date.now()
    // TODO: we should just turn this into a docker container
    // Keep running with the users cached (we refresh for new users) until we've just 10 minutes left,
    // on the next run we'll do a full refresh (picking a new random sample of old users)
    while (Date.now() < startTime + (MINUTE_INTERVAL * 60 - 10) * 1000) {
      await addInterestingContractsToFeed(db, pg)
    }

    res.status(200).json({ success: true })
  }
)
