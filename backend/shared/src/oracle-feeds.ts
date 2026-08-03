import { DAY_MS, HOUR_MS, MINUTE_MS } from 'common/util/time'
import { validateBasicOraclePoint } from 'common/perps/oracle'

import { fetchBtcUsdSpot } from './btc-price'
import {
  BTC_USD_FEED_ID,
  OPENROUTER_OPEN_WEIGHT_FEED_ID,
  TRUMP_APPROVAL_FEED_ID,
  UK_GRID_CARBON_FEED_ID,
} from './oracle'
import { fetchUkGridCarbonRecent } from './uk-grid-carbon'

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
  /** Whether admins may create new perp markets on this feed. Required so
   * every registry addition makes an explicit product decision. Disabling
   * creation does not stop ingestion, health checks, or updates for existing
   * contracts. */
  marketCreationEnabled: boolean
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
  /** Expected interval between genuinely NEW values — not the poll cadence
   * (UK carbon polls every 15s but NESO settles a value every 30min), and
   * not staleAfterMs (a deliberately looser health threshold). create-perp
   * derives a market's frozen funding period from this:
   * max(1h, updatePeriodMs). Getting it wrong on a daily feed reintroduces
   * the open-before-the-tick funding dodge, so when in doubt, err longer. */
  updatePeriodMs: number
  fetchLatest?: () => Promise<{ ts: number; price: number } | null>
  /** All recently-finalized points, oldest first. Takes precedence over
   * fetchLatest in the tick: sources that publish out of order (NESO batch
   * settling) permanently lose interleaved points under a latest-only
   * sampler, so the tick upserts the whole window (idempotent on ts).
   * Points are bounds-checked only — the jump guard needs a well-ordered
   * prev and doesn't apply to a batch. */
  fetchRecent?: () => Promise<{ ts: number; price: number }[]>
}

export const ORACLE_FEEDS: OracleFeedDef[] = [
  {
    id: BTC_USD_FEED_ID,
    description: 'BTC/USD spot, median of Coinbase/Kraken/Bitstamp',
    marketCreationEnabled: true,
    cadence: 'fast',
    minPrice: 1_000,
    maxPrice: 10_000_000,
    // No temporal jump guard: the adapter requires live agreement between
    // independent exchanges, so legitimate discontinuous moves recover
    // immediately after downtime instead of wedging against a stale point.
    staleAfterMs: 2 * MINUTE_MS,
    updatePeriodMs: 15_000,
    fetchLatest: fetchBtcUsdSpot,
  },
  {
    id: UK_GRID_CARBON_FEED_ID,
    description: 'GB grid carbon intensity (gCO2/kWh), NESO 30-min actuals',
    marketCreationEnabled: true,
    cadence: 'fast',
    minPrice: 1,
    maxPrice: 600,
    // Actuals land one settlement block behind, occasionally later.
    staleAfterMs: 2 * HOUR_MS,
    updatePeriodMs: 30 * MINUTE_MS,
    fetchRecent: fetchUkGridCarbonRecent,
  },
  // Daily feeds use a 26h threshold (one missed daily run + slack) rather
  // than a lazy 3d: the hourly update-perps job turns feed staleness into
  // ERROR log lines, and the GCP presence alert pages on those. GCP's
  // metric-absence conditions cap at 23h30m, so a daily heartbeat cannot be
  // absence-monitored directly — this staleness path is the daily-job
  // dead-man switch. (Markets' own maxOraclePriceAgeMs can still be larger;
  // trading tolerance and alerting are separate thresholds.)
  {
    id: TRUMP_APPROVAL_FEED_ID,
    description: '14-day rolling Trump approval average (VoteHub polls)',
    marketCreationEnabled: true,
    cadence: 'daily',
    minPrice: 10,
    maxPrice: 90,
    // A 14-day rolling mean of many polls moves 1-3% relative day over day,
    // so 10% is far above anything legitimate while still catching a single
    // corrupt poll dragging the unweighted average. The [10,90] bounds alone
    // are too coarse: one bad row can shift the mean ~20 points and stay
    // inside them, and the resulting step is applied to live positions as a
    // real price (liquidations and ADL are irreversible). Unlike BTC, this
    // feed has no cross-source consensus check to fall back on.
    maxJumpFrac: 0.1,
    staleAfterMs: 26 * HOUR_MS,
    updatePeriodMs: DAY_MS,
  },
  {
    id: OPENROUTER_OPEN_WEIGHT_FEED_ID,
    description: 'Open-weight share of top-50 model tokens on OpenRouter (%)',
    marketCreationEnabled: true,
    // 'daily' here means "own scheduler job, health-checked only" — it does
    // NOT mean daily cadence. This job runs HOURLY, recomputing the trailing
    // 7-day window and appending a point stamped at write time.
    cadence: 'daily',
    minPrice: 5,
    maxPrice: 95,
    // Sized against 362 real day-transitions of backfilled history, not a
    // guess. Legitimate daily steps peaked at 8.1% relative (2.7 points) —
    // the fraction is largest when the index is LOW, since the absolute move
    // is roughly level-independent. 0.05 would have rejected 18 of those 362
    // legitimate rollovers, and a rejection is not self-healing: the next
    // hour re-compares against the same stale point, so one bad rollover
    // freezes the feed (stale alert at 3h, market frozen at 6h).
    //
    // This is a backstop, not the classification tripwire. An unclassified
    // model already emits its own log.error from the job, on exactly the
    // condition this would be proxying for, so the guard can afford to sit
    // above the observed legitimate range instead of inside it.
    maxJumpFrac: 0.1,
    staleAfterMs: 3 * HOUR_MS,
    // HOUR_MS, not DAY_MS. This drives the contract's frozen funding period
    // (max(1h, updatePeriodMs)), and hourly is what keeps holding a position
    // continuously costly. Daily funding would be strictly worse here: the
    // oracle-anchor gate that protects slow periods keys on a new POINT, not
    // a new VALUE, and we write a point every hour — so a 24h period would
    // free-run to an arbitrary time and let anyone flat at that instant pay
    // nothing.
    updatePeriodMs: HOUR_MS,
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
  const basicRejection = validateBasicOraclePoint(point)
  if (basicRejection) return basicRejection
  if (prev && point.ts <= prev.ts)
    return `timestamp ${point.ts} is not newer than ${prev.ts}`
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
