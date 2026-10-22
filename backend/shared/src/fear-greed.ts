import { FearGreedPoint, parseFearGreedPayload } from 'common/perps/fear-greed'

import { log } from './utils'

// Alternative.me Crypto Fear & Greed adapter. Documented API, no scraping:
//
//   GET https://api.alternative.me/fng/?limit=1&format=json   latest reading
//   GET https://api.alternative.me/fng/?limit=0&format=json   full history
//
// This module is the ADAPTER only: it fetches and hands the body to the
// parser in common/perps/fear-greed.ts, which is where the payload shape is
// documented and where every field is validated. What the index is and how
// it is published is written up there and in publish-fear-greed.ts.

export const FEAR_GREED_API_URL = 'https://api.alternative.me/fng/'
const FETCH_TIMEOUT_MS = 30_000

const fetchFearGreed = async (limit: number): Promise<FearGreedPoint[]> => {
  const url = `${FEAR_GREED_API_URL}?limit=${limit}&format=json`
  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Manifold/1.0 (+https://manifold.markets)',
    },
    // Without this a slow-trickling response never times out (undici's body
    // timeout resets per chunk), the job never finishes, and croner's
    // `protect` then silently skips subsequent firings with only a warning —
    // below the ERROR severity that alerting pages on.
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!response.ok)
    throw new Error(
      `Fear & Greed request failed: ${response.status} ${response.statusText}`
    )
  const body = (await response.json()) as unknown
  const parsed = parseFearGreedPayload(body)
  if (!parsed.ok)
    throw new Error(`Fear & Greed payload rejected: ${parsed.reason}`)
  log(
    `[fear-greed] fetched ${parsed.points.length} reading(s)` +
      (parsed.points.length > 0
        ? `, latest ${
            parsed.points[parsed.points.length - 1].value
          } at ${new Date(
            parsed.points[parsed.points.length - 1].sourceTs
          ).toISOString()}`
        : '')
  )
  return parsed.points
}

/** The current reading — the oracle price. */
export const fetchFearGreedLatest = async (): Promise<FearGreedPoint> => {
  const points = await fetchFearGreed(1)
  const latest = points[points.length - 1]
  if (!latest) throw new Error('Fear & Greed payload carried no reading')
  return latest
}

/** Every reading the provider still serves, oldest first. Backfill only. */
export const fetchFearGreedHistory = (): Promise<FearGreedPoint[]> =>
  fetchFearGreed(0)
