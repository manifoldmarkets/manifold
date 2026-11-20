// Twice a day (6:07 and 12:07 LA, see ./index.ts): create the missing
// moneyline markets for every competition with a phase switched on in
// /admin/sports (defaults in common/sports-calendar.ts), and keep open
// markets' kickoffs in sync. One Odds API call per competition, retried by the
// client on a throttle or an outage. Lines for a day's games are often posted
// only that morning, so a competition whose morning call still failed gets
// another go at midday; if that fails too, today's games have no markets, and
// the job says so at ERROR, which alerts. No-op without THE_ODDS_API_KEY.

import { log } from 'shared/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { hasOddsApiKey } from 'shared/the-odds-api-client'
import { createOddsMarketsForActiveCalendar } from 'shared/odds-markets'

export async function createOddsSportsMarkets(opts: {
  /** The day's last scheduled run: a competition that fails now alerts. */
  lastRunOfDay: boolean
}) {
  if (!hasOddsApiKey()) {
    log('[sports-odds-create] THE_ODDS_API_KEY not set — skipping')
    return
  }
  const pg = createSupabaseDirectClient()
  const { results, failed } = await createOddsMarketsForActiveCalendar(pg)
  for (const [competitionId, r] of Object.entries(results)) {
    const summary = `[sports-odds-create] ${competitionId}: created=${r.created} skipped=${r.skipped} errors=${r.errors}`
    const errored = r.log.filter((row) => row.status === 'error')
    // A game that failed to create (an empty @ManifoldSports balance, a
    // database error) is an error, so it alerts: one line per competition.
    if (errored.length > 0) {
      log.error(
        `${summary}. ${errored
          .slice(0, 3)
          .map((row) => `${row.question}: ${row.reason}`)
          .join('; ')}`
      )
    } else {
      log(summary)
    }
  }
  for (const [competitionId, reason] of Object.entries(failed)) {
    // The competition's odds call failed after the client's retries, so
    // nothing was created for it. In the morning that's a warning: the midday
    // run tries again. After the day's last run it's an error, so it alerts:
    // today's games may have no markets. Once the provider is back, create
    // them from /admin/sports.
    if (opts.lastRunOfDay) {
      log.error(
        `[sports-odds-create] ${competitionId} didn't run in the day's last creation run, so today's games may have no markets; create them from /admin/sports. ${reason}`
      )
    } else {
      log.warn(
        `[sports-odds-create] ${competitionId} didn't run; the midday run tries again. ${reason}`
      )
    }
  }
  // On every run, even with nothing on the calendar: the dead-man alert in
  // GCP watches for this line to know the job still runs.
  log(
    `[sports-odds-create] run finished: ${Object.keys(results).length} ran, ${
      Object.keys(failed).length
    } failed`
  )
}
