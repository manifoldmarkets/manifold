// Sports live score polling job.
// NOT YET REGISTERED — add the createJob call in index.ts to enable.
//
// When enabled, this runs every 60 seconds and polls football-data.org for
// in-play scores during active game windows (any market closeTime within ±3h).
// Results are stored in the API server's in-memory cache via sports-live-cache.ts.
//
// To enable: import this file in jobs/index.ts and add:
//   createJob('sports-live-poll', '0 */1 * * * *', pollAllSportsLiveScores)

import { log } from 'shared/utils'
import { TOURNAMENT_CONFIGS } from 'shared/sports-markets'
import {
  pollLiveScoresIfActive,
} from 'shared/sports-live-poller'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export async function pollAllSportsLiveScores() {
  const apiKey = process.env.FOOTBALL_DATA_API_KEY ?? ''
  if (!apiKey) {
    log('[sports-live-poll] FOOTBALL_DATA_API_KEY not set — skipping')
    return
  }

  const pg = createSupabaseDirectClient()

  for (const [code, config] of Object.entries(TOURNAMENT_CONFIGS)) {
    try {
      const scores = await pollLiveScoresIfActive(config, apiKey, pg)
      if (scores === null) {
        log(`[sports-live-poll] ${code}: outside active window, skipping`)
      } else {
        log(`[sports-live-poll] ${code}: fetched ${scores.length} in-play scores`)
        // In production, write scores to a shared store (DB or Redis) here.
        // For local dev, the API server polls directly via its own interval.
      }
    } catch (e) {
      log(`[sports-live-poll] ${code}: error — ${e}`)
    }
  }
}
