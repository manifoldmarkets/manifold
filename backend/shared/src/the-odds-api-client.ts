/**
 * HTTP client for The Odds API (api.the-odds-api.com/v4). The maths and the
 * market shapes live in common/odds-markets.ts; this file only fetches.
 *
 * Quota: these endpoints cost credits against the monthly plan. `/odds` costs 1
 * per region per market; `/scores` costs 1, or 2 with `daysFrom` (needed to
 * see completed games). The jobs that call these only do so while a market
 * actually needs the data; keep it that way.
 *
 * Docs: https://the-odds-api.com/liveapi/guides/v4/
 */

import { ADDITIONAL_FEED_BY_KEY } from 'common/sports-feeds'
import { log } from 'shared/utils'
import { recordOddsApiUsage } from 'shared/supabase/odds-api-usage'
import { OddsApiEvent, OddsApiScore } from 'common/odds-markets'
import { sleep } from 'common/util/time'

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

/**
 * How long to wait before each retry of a failed call. The provider throttles
 * bursts with a 429 and has brief outages (502s), both seen at the top of the
 * hour, when every customer's cron fires: on 31 Oct and 7 Nov 2026 one such
 * response each cost a Saturday's NBA slate, because the creation job made
 * one attempt a day. A 4xx other than 429 (a bad key, exhausted credits, bad
 * parameters) won't fix itself and isn't retried. The creation run can wait
 * out a throttle; the resolver ticks every 10 seconds with its own backoff
 * per sport, so its waits are short.
 */
export const ODDS_RETRY_DELAYS_MS = [3_000, 10_000, 30_000]
export const SCORES_RETRY_DELAYS_MS = [2_000, 5_000]
/** The most a Retry-After header can stretch one wait. */
const MAX_RETRY_AFTER_MS = 60_000

const isRetryable = (status: number) => status === 429 || status >= 500

/** The wait a Retry-After header asks for, capped; undefined without one. */
function retryAfterMs(res: Response | undefined): number | undefined {
  const header = res?.headers.get('retry-after')
  if (!header) return undefined
  const seconds = Number(header)
  const ms = Number.isFinite(seconds)
    ? seconds * 1000
    : Date.parse(header) - Date.now()
  if (!Number.isFinite(ms) || ms <= 0) return undefined
  return Math.min(ms, MAX_RETRY_AFTER_MS)
}

/**
 * One call, parsed, with every response's quota headers recorded, retried
 * per `retryDelaysMs` on a 429, a 5xx, a dropped connection or a body that
 * didn't arrive whole. Throws on the first failure that isn't retryable, or
 * on the last one.
 */
async function fetchWithRetry<T>(
  url: URL,
  endpoint: '/odds' | '/scores',
  sportKey: string,
  retryDelaysMs: number[]
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    let res: Response | undefined
    // The HTTP status, when that is what failed (a body failure has none).
    let status: number | undefined
    let failure: string
    try {
      res = await fetch(url.toString(), {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      warnOnLowQuota(res)
      void recordOddsApiUsage(sportKey, res.headers)
      // The body streams in after the headers, under the same timeout: a
      // connection dropped or stalled while it's delivered rejects here and
      // is retried like a dropped request.
      if (res.ok) return (await res.json()) as T
      status = res.status
      failure = `${res.status} ${res.statusText}`
    } catch (e) {
      failure = e instanceof Error ? e.message : String(e)
    }
    const delay = retryDelaysMs[attempt - 1]
    if (delay === undefined || (status !== undefined && !isRetryable(status))) {
      throw new Error(
        `Odds API ${endpoint} error for ${sportKey}: ${failure}` +
          (attempt > 1 ? ` (after ${attempt} attempts)` : '')
      )
    }
    const wait = retryAfterMs(res) ?? delay
    log(
      `[the-odds-api] ${endpoint} for ${sportKey} failed (${failure}); retry ${attempt} of ${
        retryDelaysMs.length
      } in ${Math.round(wait / 1000)}s`
    )
    await sleep(wait)
  }
}

/**
 * Upcoming events with h2h odds for a sport, within `daysAhead`. Retried per
 * `retryDelaysMs` (ODDS_RETRY_DELAYS_MS unless given; `[]` for one attempt).
 */
export async function getUpcomingOdds(
  sportKey: string,
  daysAhead = 14,
  opts: { retryDelaysMs?: number[] } = {}
): Promise<OddsApiEvent[]> {
  const iso = (ms: number) =>
    new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
  const now = Date.now()
  const url = new URL(`${BASE_URL}/sports/${sportKey}/odds`)
  url.searchParams.set('apiKey', apiKey())
  url.searchParams.set(
    'regions',
    ADDITIONAL_FEED_BY_KEY[sportKey]?.region ?? 'us'
  )
  url.searchParams.set('markets', 'h2h')
  url.searchParams.set('oddsFormat', 'american')
  // Games that have not started; the endpoint would otherwise include live
  // ones. (A retried call keeps this bound, so a game that kicked off during
  // the wait can appear; the caller drops started games on its own clock.)
  url.searchParams.set('commenceTimeFrom', iso(now))
  url.searchParams.set(
    'commenceTimeTo',
    iso(now + daysAhead * 24 * 60 * 60 * 1000)
  )

  return fetchWithRetry<OddsApiEvent[]>(
    url,
    '/odds',
    sportKey,
    opts.retryDelaysMs ?? ODDS_RETRY_DELAYS_MS
  )
}

/**
 * Live and upcoming games for a sport (1 credit). With `finishedDays`, also
 * the games completed in the last 1-3 days (2 credits), which resolving
 * needs. Live games carry a partial `scores` array. Retried per
 * `retryDelaysMs` (SCORES_RETRY_DELAYS_MS unless given).
 */
export async function getScores(
  sportKey: string,
  opts: { finishedDays?: number; retryDelaysMs?: number[] } = {}
): Promise<OddsApiScore[]> {
  const url = new URL(`${BASE_URL}/sports/${sportKey}/scores`)
  url.searchParams.set('apiKey', apiKey())
  if (opts.finishedDays) {
    url.searchParams.set(
      'daysFrom',
      String(Math.min(3, Math.max(1, opts.finishedDays)))
    )
  }

  return fetchWithRetry<OddsApiScore[]>(
    url,
    '/scores',
    sportKey,
    opts.retryDelaysMs ?? SCORES_RETRY_DELAYS_MS
  )
}
