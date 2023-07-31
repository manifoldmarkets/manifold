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
  { timeoutSeconds: (MINUTE_INTERVAL + 10) * 60, memory: '2GiB', secrets },
  async (_req, res) => {
    const db = createSupabaseClient()
    const pg = createSupabaseDirectClient()
    await addInterestingContractsToFeed(db, pg)
    res.status(200).json({ success: true })
  }
)
