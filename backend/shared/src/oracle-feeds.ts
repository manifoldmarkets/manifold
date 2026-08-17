import { DAY_MS, HOUR_MS, MINUTE_MS } from 'common/util/time'
import { validateBasicOraclePoint } from 'common/perps/oracle'

import { fetchBtcUsdSpot } from './btc-price'
import {
  BTC_USD_FEED_ID,
  GLDX_USD_FEED_ID,
  NVDAX_USD_FEED_ID,
  OPENROUTER_OPEN_WEIGHT_FEED_ID,
  QQQX_USD_FEED_ID,
  SPYX_USD_FEED_ID,
  TRUMP_APPROVAL_FEED_ID,
  UK_GRID_CARBON_FEED_ID,
} from './oracle'
import { fetchUkGridCarbonRecent } from './uk-grid-carbon'
import { XSTOCK_SPECS, fetchXStockUsdPrice } from './xstocks-price'

// Registry of known oracle feeds. This is the single place that says how a
// feed updates, what values are plausible, and when its silence is an
// incident. Consumers:
//   - update-oracle-feeds (scheduler, 5s): polls `fast` feeds that are due
//     (see pollPeriodMs), validates points, applies engine updates, alerts
//     on staleness.
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
  /** 'fast' feeds are fetched by the oracle tick; 'daily' feeds are written
   * by their own scheduler job and only health-checked. */
  cadence: 'fast' | 'daily'
  /** Hard plausibility bounds; points outside are dropped and alerted.
   *
   * These reject CORRUPT data, not fast data. There is deliberately no
   * temporal jump guard anywhere in this registry: an oracle exists to
   * report the real number, and refusing a point because it moved a lot
   * does not make the price right — it leaves the market executing against
   * a stale price we already know is wrong, which is the exact latency
   * surface the launch runbook is trying to shrink. A temporal guard also
   * cannot self-heal: the rejected point stays the comparison basis, so one
   * legitimate large move freezes the feed until a human intervenes.
   *
   * Where a feed needs more than bounds, the check belongs at the SOURCE,
   * where it can distinguish "corrupt" from "moved fast" — see
   * getBtcConsensusPrice (cross-exchange agreement),
   * validateOpenWeightPublication (unclassified models, incomplete window),
   * and the per-poll range check in trump-approval.ts. */
  minPrice: number
  maxPrice: number
  /** Feed is considered unhealthy when its latest point is older than this.
   * Doubles as the floor for a market's maxOraclePriceAgeMs at create time. */
  staleAfterMs: number
  /** Expected interval between genuinely NEW values — not the poll cadence
   * (that is pollPeriodMs: UK carbon is polled every 15s but NESO settles a
   * value every 30min), and not staleAfterMs (a deliberately looser health
   * threshold). create-perp derives a market's frozen funding period from
   * this: max(1h, updatePeriodMs). Getting it wrong on a daily feed
   * reintroduces the open-before-the-tick funding dodge, so when in doubt,
   * err longer. */
  updatePeriodMs: number
  /** How often the tick actually polls this `fast` feed, throttled inside
   * update-oracle-feeds. Absent = poll on every tick firing.
   *
   * This exists because the tick's cron is global but the right poll rate is
   * per-feed. The rate is an anti-latency-arbitrage control, not a data-
   * freshness one: perp trades execute at the cached mark with no spread and
   * no price impact, so the interval between polls IS the window in which a
   * bot that watches the underlying directly can trade a price we already
   * know is wrong. Measured on the BTC feed, the frequency of windows that
   * diverge past the taker fee scales ~T^1.95, so shortening the poll is a
   * far better-targeted deterrent than raising the fee (which charges honest
   * holders too). Trade it off against the source's rate limits: poll faster
   * than the source publishes and you spend quota for no new information. */
  pollPeriodMs?: number
  fetchLatest?: () => Promise<{ ts: number; price: number } | null>
  /** All recently-finalized points, oldest first. Takes precedence over
   * fetchLatest in the tick: sources that publish out of order (NESO batch
   * settling) permanently lose interleaved points under a latest-only
   * sampler, so the tick upserts the whole window (idempotent on ts). */
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
    // Corruption is caught at the source: the adapter requires live
    // agreement between independent exchanges, which validates the current
    // level without assuming BTC moves slowly.
    staleAfterMs: 2 * MINUTE_MS,
    // BTC quotes continuously, so "interval between new values" is really the
    // poll rate. Funding is unaffected: max(1h, updatePeriodMs) is 1h either
    // way, so contracts created before and after this keep the same cadence.
    updatePeriodMs: 5_000,
    // 5s rather than 15s: three exchanges at 12 req/min each, comfortably
    // inside their public limits, and it cuts the stale-mark window that
    // latency bots trade against by 3x. See pollPeriodMs.
    pollPeriodMs: 5_000,
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
    // Pinned to the tick's old rate so speeding up the BTC feed does not
    // silently triple our call volume against NESO, which settles a value
    // every 30min regardless. Nothing here needs 5s.
    pollPeriodMs: 15_000,
    fetchRecent: fetchUkGridCarbonRecent,
  },
  // Tokenized-equity (xStocks) feeds. Corruption is caught at the source —
  // fetchXStockUsdPrice requires cross-venue agreement, like BTC — so bounds
  // here only reject unit-confused garbage (a cents-denominated or
  // percent-scaled value), not fast moves. Uniform wide bounds on purpose:
  // the four tokens trade in the $200–800 range today and a genuine 10×
  // move in either direction should still publish. staleAfterMs is looser
  // than BTC's because these books are thin: consensus can transiently fail
  // on quiet weekend prints, and five minutes tolerates a few skipped ticks
  // without paging while still bounding how old an executable price can get
  // (markets pause at the same threshold via maxOraclePriceAgeMs).
  {
    id: SPYX_USD_FEED_ID,
    description:
      'SPYx/USD (tokenized S&P 500 ETF), median of Jupiter/Gate/MEXC',
    marketCreationEnabled: true,
    cadence: 'fast',
    minPrice: 10,
    maxPrice: 50_000,
    staleAfterMs: 5 * MINUTE_MS,
    updatePeriodMs: 15_000,
    fetchLatest: () => fetchXStockUsdPrice(XSTOCK_SPECS.SPYX),
  },
  {
    id: QQQX_USD_FEED_ID,
    description:
      'QQQx/USD (tokenized Nasdaq-100 ETF), Jupiter+Gate agreement',
    marketCreationEnabled: true,
    cadence: 'fast',
    minPrice: 10,
    maxPrice: 50_000,
    staleAfterMs: 5 * MINUTE_MS,
    updatePeriodMs: 15_000,
    fetchLatest: () => fetchXStockUsdPrice(XSTOCK_SPECS.QQQX),
  },
  {
    id: GLDX_USD_FEED_ID,
    description: 'GLDx/USD (tokenized gold ETF), Jupiter+Gate agreement',
    marketCreationEnabled: true,
    cadence: 'fast',
    minPrice: 10,
    maxPrice: 50_000,
    staleAfterMs: 5 * MINUTE_MS,
    updatePeriodMs: 15_000,
    fetchLatest: () => fetchXStockUsdPrice(XSTOCK_SPECS.GLDX),
  },
  {
    id: NVDAX_USD_FEED_ID,
    description: 'NVDAx/USD (tokenized Nvidia), median of Jupiter/Gate/MEXC',
    marketCreationEnabled: true,
    cadence: 'fast',
    minPrice: 10,
    maxPrice: 50_000,
    staleAfterMs: 5 * MINUTE_MS,
    updatePeriodMs: 15_000,
    fetchLatest: () => fetchXStockUsdPrice(XSTOCK_SPECS.NVDAX),
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
    // Corruption is caught at the source: getApprovePct drops any poll
    // reporting a percentage outside [0,100], which is what would otherwise
    // drag the unweighted mean far enough to matter while still landing
    // inside these bounds. A genuine multi-point shift in the average is
    // news, and the market should trade on it.
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
    // Corruption is caught at the source: validateOpenWeightPublication
    // fails closed on malformed token rows, unclassified models, and an
    // incomplete window — the actual conditions a movement cap here was
    // only ever proxying for, and it catches them whether or not the
    // resulting share happens to move much.
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
  // Deliberately no move-size check. See the note on minPrice/maxPrice: the
  // oracle reports the real number, and per-feed source validation is what
  // separates corrupt data from a large genuine move.
  return null
}
