import { createSupabaseDirectClient } from 'shared/supabase/init'
import { rebuildSportsLeaderboards } from 'shared/supabase/sports-leaderboards'
import { log } from 'shared/utils'

// Rebuilds the sports pages' leaderboards. Each run reads the positions on
// every sports market (about 400k rows in Oct 2026: tens of seconds warm,
// minutes cold), which is why the API serves stored boards instead.
export const updateSportsLeaderboards = async () => {
  const pg = createSupabaseDirectClient()
  const started = Date.now()
  const boards = await rebuildSportsLeaderboards(pg, started)
  log('[sports-leaderboards] rebuilt', {
    boards,
    ms: Date.now() - started,
  })
}
