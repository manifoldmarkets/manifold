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
// Polls on a slow feed. A new value is at most about a minute late on screen,
// which is as fast as or faster than these feeds are ingested.
export const PERP_SLOW_FEED_POLL_MS = MINUTE_MS

// A feed is slow if its contract tolerates prices this old, or if its funding
// period was stretched past the hourly floor to match the feed.
const SLOW_FEED_MIN_AGE_BUDGET_MS = HOUR_MS

export type PerpPollCadence = {
  // Period of the get-perp-quote fallback poll, or null for none.
  quoteFallbackMs: number | null
  metaMs: number
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
 * - Fast feeds keep the trading cadence (4s quote fallback, 15s meta) wherever
 *   they are shown.
 * - Slow feeds on a trading surface back the quote fallback off to a minute.
 *   Meta stays at 15s: the trade panel reads live config (leverage, fees) and
 *   pools from it.
 * - Slow feeds on a `displayOnly` card (e.g. the elections page, which shows
 *   only the price) skip the quote poll entirely and poll meta once a minute.
 *   get-perp-quote is no-cache, so every request reaches the API origin, while
 *   `market/:id` is served from Cloudflare's cache (public, max-age=5) and the
 *   meta poll already feeds its price into the quote pipeline. The card is then
 *   at most about a minute behind a new daily value even with the socket down,
 *   and the API sees roughly one request per market per cache window however
 *   many readers there are.
 */
export const getPerpPollCadence = (
  contract: { fundingPeriodMs?: number; maxOraclePriceAgeMs?: number },
  options: { displayOnly?: boolean } = {}
): PerpPollCadence => {
  if (!isSlowPerpFeed(contract)) {
    return {
      quoteFallbackMs: PERP_FAST_QUOTE_POLL_MS,
      metaMs: PERP_FAST_META_POLL_MS,
    }
  }
  if (options.displayOnly) {
    return { quoteFallbackMs: null, metaMs: PERP_SLOW_FEED_POLL_MS }
  }
  return {
    quoteFallbackMs: PERP_SLOW_FEED_POLL_MS,
    metaMs: PERP_FAST_META_POLL_MS,
  }
}
