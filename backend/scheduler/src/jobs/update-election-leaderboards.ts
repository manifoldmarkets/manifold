import { createSupabaseDirectClient } from 'shared/supabase/init'
import { rebuildElectionLeaderboards } from 'shared/supabase/election-leaderboards'
import { log } from 'shared/utils'

// Rebuilds the /election page's leaderboards that are due. The broad boards
// read positions on tens of thousands of markets (the live US politics topic
// board took over a minute in the API), which is why the API serves stored
// boards instead.
export const updateElectionLeaderboards = async () => {
  const pg = createSupabaseDirectClient()
  const started = Date.now()
  const summary = await rebuildElectionLeaderboards(pg, started)
  log('[election-leaderboards] rebuilt', {
    ...summary,
    ms: Date.now() - started,
  })
}
