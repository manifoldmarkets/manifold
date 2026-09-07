// Every few minutes: for every Odds API game market whose game has started and
// is not resolved, fetch the sport's scores once, write the live score onto the
// market (the sports page shows it), and resolve when the provider marks the
// game completed. Makes no call while nothing is in play. No-op without
// THE_ODDS_API_KEY.

import { log } from 'shared/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { hasOddsApiKey } from 'shared/the-odds-api-client'
import { pollOddsScoresAndResolve } from 'shared/odds-markets'

export async function resolveOddsSportsMarkets() {
  if (!hasOddsApiKey()) {
    log('[sports-odds-resolve] THE_ODDS_API_KEY not set — skipping')
    return
  }
  const pg = createSupabaseDirectClient()
  const r = await pollOddsScoresAndResolve(pg)
  if (r.live + r.resolved + r.pending + r.errors > 0) {
    log(
      `[sports-odds-resolve] live=${r.live} resolved=${r.resolved} pending=${r.pending} errors=${r.errors}`
    )
  }
}
