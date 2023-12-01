import {
  addInterestingContractsToFeed,
  MINUTE_INTERVAL,
} from 'shared/add-interesting-contracts-to-feed'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { GCPLog } from 'shared/utils'

export async function addTrendingFeedContracts(log: GCPLog) {
  const db = createSupabaseClient()
  const pg = createSupabaseDirectClient()
  const startTime = Date.now()
  // Keep running with the users cached (we refresh for new users) until we've just 10 minutes left,
  // on the next run we'll do a full refresh (picking a new random sample of old users)
  await addInterestingContractsToFeed(db, pg, true, log)
  while (Date.now() < startTime + (MINUTE_INTERVAL - 10) * 60 * 1000) {
    await addInterestingContractsToFeed(db, pg, false, log)
  }
}
