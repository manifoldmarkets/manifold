import {
  addInterestingContractsToFeed,
  MINUTE_INTERVAL,
} from 'shared/add-interesting-contracts-to-feed'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'

export async function addTrendingFeedContracts() {
  const db = createSupabaseClient()
  const pg = createSupabaseDirectClient()
  const startTime = Date.now()
  // Keep running with the users cached (we refresh for new users) until we've just 10 minutes left,
  // on the next run we'll do a full refresh (picking a new random sample of old users)
  while (Date.now() < startTime + (MINUTE_INTERVAL - 10) * 60 * 1000) {
    await addInterestingContractsToFeed(db, pg)
  }
}
