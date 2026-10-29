// Daily: create the coming two weeks' F1 session markets (race winner,
// podium, sprint winner, pole) from BALLDONTLIE for every F1 calendar phase
// switched on in /admin/sports; all are off by default. A few provider calls
// per competition. No-op without BALLDONTLIE_API_KEY.

import { log } from 'shared/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { hasBalldontlieKey } from 'shared/balldontlie-f1-client'
import { createF1MarketsForActiveCalendar } from 'shared/f1-markets'

export async function createF1SportsMarkets() {
  if (!hasBalldontlieKey()) {
    log('[sports-f1-create] BALLDONTLIE_API_KEY not set — skipping')
    return
  }
  const pg = createSupabaseDirectClient()
  const results = await createF1MarketsForActiveCalendar(pg)
  for (const [competitionId, r] of Object.entries(results)) {
    const summary = `[sports-f1-create] ${competitionId}: created=${r.created} skipped=${r.skipped} errors=${r.errors}`
    const failed = r.log.filter((row) => row.status === 'error')
    // A market that failed to create (an empty @ManifoldSports balance, a
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
