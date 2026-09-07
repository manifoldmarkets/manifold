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
import { OddsApiEvent, OddsApiScore } from 'common/odds-markets'

const BASE_URL = 'https://api.the-odds-api.com/v4'

export const hasOddsApiKey = () => !!process.env.THE_ODDS_API_KEY

function apiKey(): string {
  const key = process.env.THE_ODDS_API_KEY ?? ''
  if (!key) throw new Error('THE_ODDS_API_KEY env var is not set')
  return key
}

function warnOnLowQuota(res: Response) {
  const remaining = res.headers.get('x-requests-remaining')
  if (remaining !== null && parseInt(remaining) < 200) {
    log(
      `[the-odds-api] WARNING: only ${remaining} requests remaining this month`
    )
  }
}

/** Upcoming events with h2h odds for a sport, within `daysAhead`. */
export async function getUpcomingOdds(
  sportKey: string,
  daysAhead = 14
): Promise<OddsApiEvent[]> {
  const commenceTimeTo = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000)
    .toISOString()
    .replace(/\.\d{3}Z$/, 'Z')
  const url = new URL(`${BASE_URL}/sports/${sportKey}/odds`)
  url.searchParams.set('apiKey', apiKey())
  url.searchParams.set('regions', 'us')
  url.searchParams.set('markets', 'h2h')
  url.searchParams.set('oddsFormat', 'american')
  url.searchParams.set('commenceTimeTo', commenceTimeTo)

  const res = await fetch(url.toString())
  if (!res.ok) {
    throw new Error(
      `Odds API /odds error for ${sportKey}: ${res.status} ${res.statusText}`
    )
  }
  warnOnLowQuota(res)
  return res.json()
}

/**
 * Live and upcoming games for a sport plus, with `daysBack`, games completed
 * in the last 1-3 days. Live games carry a partial `scores` array.
 */
export async function getScores(
  sportKey: string,
  daysBack = 1
): Promise<OddsApiScore[]> {
  const url = new URL(`${BASE_URL}/sports/${sportKey}/scores`)
  url.searchParams.set('apiKey', apiKey())
  url.searchParams.set('daysFrom', String(Math.min(3, Math.max(1, daysBack))))

  const res = await fetch(url.toString())
  if (!res.ok) {
    throw new Error(
      `Odds API /scores error for ${sportKey}: ${res.status} ${res.statusText}`
    )
  }
  warnOnLowQuota(res)
  return res.json()
}
