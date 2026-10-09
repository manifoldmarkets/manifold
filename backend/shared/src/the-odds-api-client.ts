/**
 * HTTP client for The Odds API (api.the-odds-api.com/v4). The maths and the
 * market shapes live in common/odds-markets.ts; this file only fetches.
 *
 * Quota: every call costs credits against the monthly plan. `/odds` costs 1
 * per region per market; `/scores` costs 1, or 2 with `daysFrom` (needed to
 * see completed games). The jobs that call these only do so while a market
 * actually needs the data; keep it that way.
 *
 * Docs: https://the-odds-api.com/liveapi/guides/v4/
 */

import { log } from 'shared/utils'
import { recordOddsApiUsage } from 'shared/supabase/odds-api-usage'
import { OddsApiEvent, OddsApiScore } from 'common/odds-markets'

const BASE_URL = 'https://api.the-odds-api.com/v4'

export const hasOddsApiKey = () => !!process.env.THE_ODDS_API_KEY

function apiKey(): string {
  const key = process.env.THE_ODDS_API_KEY ?? ''
  if (!key) throw new Error('THE_ODDS_API_KEY env var is not set')
  return key
}

function warnOnLowQuota(res: Response) {
  const header = res.headers.get('x-requests-remaining')
  if (header === null) return
  const remaining = parseInt(header)
  // In season 2,000 credits is a few days of headroom (a sport in play costs
  // 12 to 240 an hour, set on /admin/sports); at 200, creation and
  // resolution are about to stop.
  if (remaining < 200) {
    log.error(`[the-odds-api] only ${remaining} credits left this month`)
  } else if (remaining < 2000) {
    log.warn(`[the-odds-api] ${remaining} credits left this month`)
  }
}

// A hung connection would otherwise stall the scheduler job that made the
// call, with nothing in the logs.
const FETCH_TIMEOUT_MS = 15_000

/** Upcoming events with h2h odds for a sport, within `daysAhead`. */
export async function getUpcomingOdds(
  sportKey: string,
  daysAhead = 14
): Promise<OddsApiEvent[]> {
  const iso = (ms: number) =>
    new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
  const now = Date.now()
  const url = new URL(`${BASE_URL}/sports/${sportKey}/odds`)
  url.searchParams.set('apiKey', apiKey())
  url.searchParams.set('regions', 'us')
  url.searchParams.set('markets', 'h2h')
  url.searchParams.set('oddsFormat', 'american')
  // Games that have not started; the endpoint would otherwise include live ones.
  url.searchParams.set('commenceTimeFrom', iso(now))
  url.searchParams.set(
    'commenceTimeTo',
    iso(now + daysAhead * 24 * 60 * 60 * 1000)
  )

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new Error(
      `Odds API /odds error for ${sportKey}: ${res.status} ${res.statusText}`
    )
  }
  warnOnLowQuota(res)
  void recordOddsApiUsage(sportKey, res.headers)
  return res.json()
}

/**
 * Live and upcoming games for a sport (1 credit). With `finishedDays`, also
 * the games completed in the last 1-3 days (2 credits), which resolving
 * needs. Live games carry a partial `scores` array.
 */
export async function getScores(
  sportKey: string,
  opts: { finishedDays?: number } = {}
): Promise<OddsApiScore[]> {
  const url = new URL(`${BASE_URL}/sports/${sportKey}/scores`)
  url.searchParams.set('apiKey', apiKey())
  if (opts.finishedDays) {
    url.searchParams.set(
      'daysFrom',
      String(Math.min(3, Math.max(1, opts.finishedDays)))
    )
  }

  const res = await fetch(url.toString(), {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) {
    throw new Error(
      `Odds API /scores error for ${sportKey}: ${res.status} ${res.statusText}`
    )
  }
  warnOnLowQuota(res)
  void recordOddsApiUsage(sportKey, res.headers)
  return res.json()
}
