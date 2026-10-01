// Daily: create the missing moneyline markets for every competition in an
// active auto-create phase of the sports calendar (common/sports-calendar.ts).
// One Odds API call per competition. No-op without THE_ODDS_API_KEY.

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
    log(
      `[sports-odds-create] ${competitionId}: created=${r.created} skipped=${r.skipped} errors=${r.errors}`
    )
    for (const row of r.log) {
      if (row.status === 'error')
        log(`[sports-odds-create]   ${row.question}: ${row.reason}`)
    }
  }
}
