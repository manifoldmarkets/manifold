import {
  ADJACENT_MSRY_INDEX_ID,
  AdjacentIndexPrice,
  buildMsryObservation,
  MSRY_POLL_MS,
  MsryObservation,
  parseAdjacentIndexPrices,
} from 'common/perps/adjacent-msry'
import { OraclePoint } from 'common/perps/oracle'
import { HOUR_MS, MINUTE_MS } from 'common/util/time'

import { localOracleClock, OracleClock } from './oracle-clock'
import { OracleProviderError } from './oracle-provider'
import { log } from './utils'

// Adjacent Markets adapter for the Misery Implied Index (MSRY). Documented
// REST API (https://docs.adjacent.markets), no scraping:
//
//   GET /api/v1/indices/msry/prices?interval=1min      realtime, live feed
//     Authorization: Bearer <ADJACENT_API_KEY>, an `ak_` key with read scope
//     for indices, created under Settings → API keys on an organization that
//     holds a paid plan (without one Adjacent answers 403).
//   GET /api/v1/public/indices/msry/prices?interval=1hour   keyless, 15
//     minutes delayed, 30 days of hourly history: chart backfill ONLY.
//
// This module is the ADAPTER only: it fetches and hands the body to the
// parser and the observation rule in common/perps/adjacent-msry.ts, which is
// where the payload and the feed are documented.
//
// Rate limits are per Adjacent ORGANIZATION (Pro: 30/minute, 20,000/day,
// 4 concurrent), shared by every key, so dev and prod together must stay
// well inside them: see MSRY_POLL_MS. A 429 is honoured via Retry-After.

export const ADJACENT_API_URL = 'https://api.adjacent.markets/api/v1'

// Well inside the 20s poll, and a hung request cannot hold the feed's tick
// slot (update-oracle-feeds runs one poll per feed at a time).
const FETCH_TIMEOUT_MS = 5_000
const USER_AGENT = 'Manifold-oracle/1.0 (+https://manifold.markets/perps)'

/** A failed response, carrying what the backoff and the logs need. */
export class AdjacentHttpError extends OracleProviderError {
  constructor(
    readonly status: number,
    readonly retryAfter: string | null,
    detail: string
  ) {
    super(`Adjacent returned HTTP ${status}${detail ? `: ${detail}` : ''}`)
  }
}

export type AdjacentPricesRequest = {
  tier: 'realtime' | 'public'
  interval: '1min' | '5min' | '1hour' | '1d'
  perPage: number
  page?: number
  start?: number
  end?: number
}

export type AdjacentPricesPage = {
  rows: AdjacentIndexPrice[]
  hasNext: boolean
}

type FetchLike = (url: string, init: RequestInit) => Promise<Response>

/** The realtime key, or undefined while it is not provisioned. */
export const getAdjacentApiKey = () => {
  const key = process.env.ADJACENT_API_KEY?.trim()
  return key ? key : undefined
}

// Adjacent's error bodies are JSON with `error` and, on most, `message`.
// Keep at most a line of it: the key never appears in a response, but an
// unbounded upstream body has no business in our logs.
const describeErrorBody = async (response: Response) => {
  try {
    const body = (await response.json()) as unknown
    if (body && typeof body === 'object') {
      const { error, message } = body as Record<string, unknown>
      const text = [error, message]
        .filter((part) => typeof part === 'string' && part.length > 0)
        .join(': ')
      return text.slice(0, 200)
    }
  } catch {
    // Not JSON; the status says enough.
  }
  return ''
}

/** One page of an index's price history, newest first. */
export const fetchAdjacentIndexPrices = async (
  request: AdjacentPricesRequest,
  options: { fetch?: FetchLike; apiKey?: string } = {}
): Promise<AdjacentPricesPage> => {
  const fetchFn = options.fetch ?? fetch
  const params = new URLSearchParams({
    interval: request.interval,
    per_page: String(request.perPage),
    order: 'desc',
  })
  if (request.page != null) params.set('page', String(request.page))
  if (request.start != null)
    params.set('start', new Date(request.start).toISOString())
  if (request.end != null)
    params.set('end', new Date(request.end).toISOString())
  const path =
    request.tier === 'public'
      ? `/public/indices/${ADJACENT_MSRY_INDEX_ID}/prices`
      : `/indices/${ADJACENT_MSRY_INDEX_ID}/prices`
  const headers: Record<string, string> = {
    accept: 'application/json',
    'user-agent': USER_AGENT,
  }
  if (request.tier === 'realtime') {
    const apiKey = options.apiKey ?? getAdjacentApiKey()
    if (!apiKey)
      throw new OracleProviderError(
        'ADJACENT_API_KEY is not configured, so the realtime MSRY feed cannot poll'
      )
    // A header, never the documented `?api_key=` form: query strings end up
    // in proxy and error logs.
    headers.authorization = `Bearer ${apiKey}`
  }
  const response = await fetchFn(`${ADJACENT_API_URL}${path}?${params}`, {
    headers,
    // Without this a slow-trickling response never times out (undici's body
    // timeout resets per chunk) and the feed's tick slot stays held.
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  }).catch((error) => {
    throw new OracleProviderError(`Adjacent request failed: ${error}`)
  })
  if (!response.ok)
    throw new AdjacentHttpError(
      response.status,
      response.headers.get('retry-after'),
      await describeErrorBody(response)
    )
  const body = (await response.json().catch(() => {
    throw new OracleProviderError('Adjacent returned invalid JSON')
  })) as unknown
  const parsed = parseAdjacentIndexPrices(body)
  if (!parsed.ok)
    throw new OracleProviderError(
      `Adjacent MSRY payload rejected: ${parsed.reason}`
    )
  const meta =
    body && typeof body === 'object'
      ? (body as Record<string, unknown>).meta
      : undefined
  const hasNext =
    !!meta &&
    typeof meta === 'object' &&
    (meta as Record<string, unknown>).has_next === true
  return { rows: parsed.rows, hasNext }
}

// Back off for Retry-After on a 429, never less than one poll and never more
// than an hour: a daily-budget 429 names the seconds until 00:00 UTC, and an
// hourly retry is cheap. Other failures just retry on the next 20s poll.
const MAX_BACKOFF_MS = HOUR_MS

export const adjacentRetryDelay = (error: unknown, now: number) => {
  if (!(error instanceof AdjacentHttpError) || error.status !== 429) return 0
  const header = error.retryAfter?.trim()
  const seconds =
    header != null && /^\d+(\.\d+)?$/.test(header) ? Number(header) : NaN
  const retryAt = Number.isFinite(seconds)
    ? now + seconds * 1000
    : header != null
    ? Date.parse(header)
    : NaN
  const requested = Number.isFinite(retryAt) ? retryAt - now : MINUTE_MS
  return Math.min(MAX_BACKOFF_MS, Math.max(MSRY_POLL_MS, requested))
}

/**
 * The live feed's `fetchObservation`. Transport, HTTP and payload failures
 * throw OracleProviderError: the fast tick then counts them against the
 * provider's incident budget (a warning a minute, an error an hour once
 * sustained) and the market pauses when its provider check goes stale. A
 * well-formed answer that is empty or stale returns `unavailable` health,
 * which pauses trading at once.
 *
 * State is per process: the last observed point (so a re-served minute is not
 * a new observation) and a 429 backoff deadline.
 */
export const createAdjacentMsryObserver = (
  options: { fetch?: FetchLike; apiKey?: () => string | undefined } = {}
) => {
  let previous: OraclePoint | undefined
  let retryAt = 0
  let backoffError: unknown
  let lastRevisionLogAt = -Infinity

  return async (
    clock: OracleClock = localOracleClock
  ): Promise<Omit<MsryObservation, 'revision'>> => {
    // Read before the request so the stamp never postdates the value. A
    // failed read is ours, not Adjacent's, and must not start a backoff.
    const fetchedAt = await clock()
    if (Date.now() < retryAt) throw backoffError
    let page: AdjacentPricesPage
    try {
      page = await fetchAdjacentIndexPrices(
        // A few rows, not one: the newest is all the rule uses, but a short
        // page shows a skipped minute in the logs when debugging.
        { tier: 'realtime', interval: '1min', perPage: 5 },
        {
          fetch: options.fetch,
          // An injected key source is authoritative: '' means "no key", not
          // "fall back to the environment".
          apiKey: options.apiKey ? options.apiKey() ?? '' : undefined,
        }
      )
    } catch (error) {
      const delay = adjacentRetryDelay(error, Date.now())
      if (delay > 0) {
        retryAt = Date.now() + delay
        backoffError = error
        if (error instanceof Error)
          error.message += `; next Adjacent attempt ${new Date(
            retryAt
          ).toISOString()}`
      }
      throw error
    }
    const observation = buildMsryObservation(page.rows, fetchedAt, previous)
    if (observation.point) previous = observation.point
    const { revision, ...rest } = observation
    if (revision) {
      const now = Date.now()
      if (now - lastRevisionLogAt >= MINUTE_MS) {
        lastRevisionLogAt = now
        log.warn(
          `[oracle-feeds] Adjacent re-recorded MSRY for ${new Date(
            revision.sourceTs
          ).toISOString()} as ${revision.latest} after we published ${
            revision.published
          }; the published value stands until the next minute`
        )
      }
    }
    return rest
  }
}

export const fetchAdjacentMsryObservation = createAdjacentMsryObserver()
