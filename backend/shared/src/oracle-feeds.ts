import { DAY_MS, HOUR_MS, MINUTE_MS } from 'common/util/time'

import { fetchBtcUsdSpot } from './btc-price'
import {
  BTC_USD_FEED_ID,
  ECI_FRONTIER_FEED_ID,
  TRUMP_APPROVAL_FEED_ID,
  UK_GRID_CARBON_FEED_ID,
} from './oracle'
import { fetchUkGridCarbonActual } from './uk-grid-carbon'

// Registry of known oracle feeds. This is the single place that says how a
// feed updates, what values are plausible, and when its silence is an
// incident. Consumers:
//   - update-oracle-feeds (scheduler, 15s): polls `fast` feeds, validates
//     points, applies engine updates, alerts on staleness.
//   - update-perps (scheduler, hourly): alerts when a live contract's feed is
//     stale (covers `daily` feeds, which write via their own jobs).
//   - create-perp (API): rejects a market whose maxOraclePriceAgeMs is
//     tighter than the feed's expected cadence (it would freeze between
//     perfectly normal updates).

export type OracleFeedDef = {
  id: string
  description: string
  /** 'fast' feeds are fetched by the 15s tick; 'daily' feeds are written by
   * their own scheduler job and only health-checked. */
  cadence: 'fast' | 'daily'
  /** Hard plausibility bounds; points outside are dropped and alerted. */
  minPrice: number
  maxPrice: number
  /** Reject a point that jumps more than this fraction vs the last stored
   * point. Omit for feeds with legitimate step changes. */
  maxJumpFrac?: number
  /** Feed is considered unhealthy when its latest point is older than this.
   * Doubles as the floor for a market's maxOraclePriceAgeMs at create time. */
  staleAfterMs: number
  fetchLatest?: () => Promise<{ ts: number; price: number } | null>
}

export const ORACLE_FEEDS: OracleFeedDef[] = [
  {
    id: BTC_USD_FEED_ID,
    description: 'BTC/USD spot, median of Coinbase/Kraken/Bitstamp',
    cadence: 'fast',
    minPrice: 1_000,
    maxPrice: 10_000_000,
    maxJumpFrac: 0.1,
    staleAfterMs: 2 * MINUTE_MS,
    fetchLatest: fetchBtcUsdSpot,
  },
  {
    id: UK_GRID_CARBON_FEED_ID,
    description: 'GB grid carbon intensity (gCO2/kWh), NESO 30-min actuals',
    cadence: 'fast',
    minPrice: 1,
    maxPrice: 600,
    // Actuals land one settlement block behind, occasionally later.
    staleAfterMs: 2 * HOUR_MS,
    fetchLatest: fetchUkGridCarbonActual,
  },
  {
    id: TRUMP_APPROVAL_FEED_ID,
    description: '14-day rolling Trump approval average (VoteHub polls)',
    cadence: 'daily',
    minPrice: 10,
    maxPrice: 90,
    staleAfterMs: 3 * DAY_MS,
  },
  {
    id: ECI_FRONTIER_FEED_ID,
    description: 'Epoch Capabilities Index frontier (max ECI, released models)',
    cadence: 'daily',
    minPrice: 100,
    maxPrice: 250,
    staleAfterMs: 3 * DAY_MS,
  },
]

export const getOracleFeed = (id: string) =>
  ORACLE_FEEDS.find((f) => f.id === id)

/** Returns a rejection reason, or null if the point is acceptable. */
export const validateOraclePoint = (
  feed: OracleFeedDef,
  prev: { ts: number; price: number } | null,
  point: { ts: number; price: number }
): string | null => {
  if (!isFinite(point.price) || point.price <= 0)
    return `non-positive price ${point.price}`
  if (point.price < feed.minPrice || point.price > feed.maxPrice)
    return `price ${point.price} outside sanity bounds [${feed.minPrice}, ${feed.maxPrice}]`
  if (
    feed.maxJumpFrac != null &&
    prev &&
    Math.abs(point.price - prev.price) / prev.price > feed.maxJumpFrac
  )
    return `jump from ${prev.price} to ${point.price} exceeds ${
      feed.maxJumpFrac * 100
    }% guard`
  return null
}
