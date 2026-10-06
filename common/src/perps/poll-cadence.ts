// How often a browser tab polls a perp market's HTTP endpoints. The websocket
// push is the primary price path; these polls are the fallback for when no
// push is arriving.
//
// The polls exist so a fast feed's price is never more than a few seconds old,
// even with the socket down. On a slow feed that cadence is wasted: the
// VoteHub averages and the other `daily` feeds produce a new value every few
// minutes at most, often once a day, yet an open tab still polled every 4s. The
// 2026 midterms page embeds three such feeds, so each idle reader cost about
// 1.3 requests per second, every one a no-store GET plus its CORS preflight.
//
// The feed's cadence comes from the contract, not from a client-side list of
// feed ids (that list would drift from the backend registry):
//   - fundingPeriodMs is frozen at create time as max(1h, the feed's
//     updatePeriodMs). Above an hour means the feed itself publishes slower
//     than hourly.
//   - maxOraclePriceAgeMs covers markets created before fundingPeriodMs
//     existed. A market that accepts an hour-old price cannot be on a feed
//     that needs a 4s poll to stay current: fast feeds run with a budget of
//     minutes.

import { HOUR_MS, MINUTE_MS } from '../util/time'

// Fallback poll of the uncached quote endpoint while no push is arriving.
export const PERP_FAST_QUOTE_POLL_MS = 4_000
// Edge-cached `market/:id` poll for resolution, volume and live config.
export const PERP_FAST_META_POLL_MS = 15_000
// Both polls on a slow feed. A new value is at most a minute late on screen,
// which is the same as or better than how often these feeds are ingested.
export const PERP_SLOW_FEED_POLL_MS = MINUTE_MS

// A feed is slow if its contract tolerates prices this old, or if its funding
// period was stretched past the hourly floor to match the feed.
const SLOW_FEED_MIN_AGE_BUDGET_MS = HOUR_MS

export type PerpPollCadence = {
  quoteFallbackMs: number
  metaMs: number
  // Fetch the quote with `cache: 'no-store'`. The endpoint already answers
  // `Cache-Control: no-cache`, so the browser revalidates every time either
  // way; no-store additionally makes Chrome skip its CORS preflight cache, so
  // every poll also costs an OPTIONS round trip. Kept on trading surfaces,
  // where it predates this module; display-only cards on slow feeds drop it.
  quoteNoStore: boolean
}

export const isSlowPerpFeed = (contract: {
  fundingPeriodMs?: number
  maxOraclePriceAgeMs?: number
}): boolean => {
  const { fundingPeriodMs, maxOraclePriceAgeMs } = contract
  if (
    fundingPeriodMs != null &&
    Number.isFinite(fundingPeriodMs) &&
    fundingPeriodMs > HOUR_MS
  )
    return true
  return (
    maxOraclePriceAgeMs != null &&
    Number.isFinite(maxOraclePriceAgeMs) &&
    maxOraclePriceAgeMs >= SLOW_FEED_MIN_AGE_BUDGET_MS
  )
}

/**
 * Poll cadence for one open perp view.
 *
 * Fast feeds keep the trading cadence (4s quote fallback, 15s meta) wherever
 * they are shown. Slow feeds back the quote fallback off to a minute
 * everywhere. Their meta poll stays at 15s on trading surfaces, which read live
 * config (leverage, fees) and pools from it. With `displayOnly` it also backs
 * off and the quote is fetched without no-store (see quoteNoStore), for
 * read-only cards such as the elections page that show only the price.
 */
export const getPerpPollCadence = (
  contract: { fundingPeriodMs?: number; maxOraclePriceAgeMs?: number },
  options: { displayOnly?: boolean } = {}
): PerpPollCadence => {
  if (!isSlowPerpFeed(contract)) {
    return {
      quoteFallbackMs: PERP_FAST_QUOTE_POLL_MS,
      metaMs: PERP_FAST_META_POLL_MS,
      quoteNoStore: true,
    }
  }
  return {
    quoteFallbackMs: PERP_SLOW_FEED_POLL_MS,
    metaMs: options.displayOnly
      ? PERP_SLOW_FEED_POLL_MS
      : PERP_FAST_META_POLL_MS,
    quoteNoStore: !options.displayOnly,
  }
}
