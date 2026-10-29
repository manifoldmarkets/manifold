// Every 15 minutes: keep F1 session markets on their sessions' times (a
// session moved, postponed or cancelled), resolve the ones that closed at
// least F1_RESOLVE_DELAY_HOURS ago from BALLDONTLIE's classification of
// their session, and keep the season title markets' close on the final race
// and pay them from the final standings (shared/f1-markets.ts). One
// provider call while a session market is open, and none while no session
// market is due and no title market is open. No-op without
// BALLDONTLIE_API_KEY.

import { log } from 'shared/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { hasBalldontlieKey } from 'shared/balldontlie-f1-client'
import {
  resolveF1Markets,
  resolveF1TitleMarkets,
  syncF1SessionMarkets,
} from 'shared/f1-markets'

// Markets already reported as needing a person, for this process's
// lifetime: one alert each, not one every 15 minutes.
const alerted = new Set<string>()
let warnedNoKey = false

export async function resolveF1SportsMarkets() {
  if (!hasBalldontlieKey()) {
    if (!warnedNoKey) {
      log('[sports-f1-resolve] BALLDONTLIE_API_KEY not set — skipping')
      warnedNoKey = true
    }
    return
  }
  const pg = createSupabaseDirectClient()
  // First, so a session cancelled since the last run closes before anything
  // reads it. A provider outage here mustn't stop the payouts below.
  try {
    const s = await syncF1SessionMarkets(pg)
    if (s.moved + s.closed > 0) {
      log(
        `[sports-f1-resolve] sessions: checked=${s.checked} moved=${s.moved} closed=${s.closed}`
      )
    }
  } catch (e) {
    log.error(
      `[sports-f1-resolve] couldn't check session times: ${
        e instanceof Error ? e.message : String(e)
      }`
    )
  }
  const r = await resolveF1Markets(pg, alerted)
  if (r.checked > 0) {
    log(
      `[sports-f1-resolve] checked=${r.checked} resolved=${r.resolved} waiting=${r.waiting} attention=${r.attention} errors=${r.errors}`
    )
  }
  // A title waits all season, so only a run that did something says so.
  const t = await resolveF1TitleMarkets(pg, alerted)
  if (t.resolved + t.moved + t.attention + t.errors > 0) {
    log(
      `[sports-f1-resolve] titles: checked=${t.checked} resolved=${t.resolved} moved=${t.moved} waiting=${t.waiting} attention=${t.attention} errors=${t.errors}`
    )
  }
}
