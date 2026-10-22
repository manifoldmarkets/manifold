// Every 10 seconds: for every Odds API game market whose game has started and
// is not resolved, ask for its sport's scores when /admin/sports says one is
// due (live scores per sport or game, finals once a game is due to end), write
// live scores onto the markets, and resolve when the provider marks a game
// completed. Makes no call while nothing is due. No-op without
// THE_ODDS_API_KEY.

import { log } from 'shared/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { hasOddsApiKey } from 'shared/the-odds-api-client'
import {
  newScorePollState,
  pollOddsScoresAndResolve,
} from 'shared/odds-markets'

// When each sport was last polled, for this process's lifetime.
const state = newScorePollState()
let warnedNoKey = false

export async function resolveOddsSportsMarkets() {
  if (!hasOddsApiKey()) {
    if (!warnedNoKey) {
      log('[sports-odds-resolve] THE_ODDS_API_KEY not set — skipping')
      warnedNoKey = true
    }
    return
  }
  const pg = createSupabaseDirectClient()
  const r = await pollOddsScoresAndResolve(pg, state)
  if (r.polled > 0) {
    log(
      `[sports-odds-resolve] polled=${r.polled} live=${r.live} resolved=${r.resolved} pending=${r.pending} errors=${r.errors}`
    )
  }
}
