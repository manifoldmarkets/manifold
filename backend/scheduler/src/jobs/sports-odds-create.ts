// Daily: create the missing moneyline markets for every competition with a
// phase switched on in /admin/sports (defaults in common/sports-calendar.ts),
// and keep open markets' kickoffs in sync. One Odds API call per competition.
// No-op without THE_ODDS_API_KEY.

import { log } from 'shared/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { hasOddsApiKey } from 'shared/the-odds-api-client'
import { createOddsMarketsForActiveCalendar } from 'shared/odds-markets'

export async function createOddsSportsMarkets() {
  if (!hasOddsApiKey()) {
    log('[sports-odds-create] THE_ODDS_API_KEY not set — skipping')
    return
  }
  const pg = createSupabaseDirectClient()
  const results = await createOddsMarketsForActiveCalendar(pg)
  for (const [competitionId, r] of Object.entries(results)) {
    const summary = `[sports-odds-create] ${competitionId}: created=${r.created} skipped=${r.skipped} errors=${r.errors}`
    const failed = r.log.filter((row) => row.status === 'error')
    // A game that failed to create (an empty @ManifoldSports balance, a
    // database error) is an error, so it alerts: one line per competition.
    if (failed.length > 0) {
      log.error(
        `${summary}. ${failed
          .slice(0, 3)
          .map((row) => `${row.question}: ${row.reason}`)
          .join('; ')}`
      )
    } else {
      log(summary)
    }
  }
}
