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
} from './oracle'
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
   * (that is pollPeriodMs: the openrouter feed writes a point every hour but
   * its value only steps once a UTC day), and not staleAfterMs (a
   * deliberately looser health threshold). create-perp derives a market's
   * frozen funding period from this: max(1h, updatePeriodMs). Getting it
   * wrong on a daily feed reintroduces the open-before-the-tick funding
   * dodge, so when in doubt, err longer. */
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
    description:
      'BTC/USD spot, median of the agreeing cluster among Coinbase/Kraken/Bitstamp/Gemini',
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
    updatePeriodMs: 2_000,
    // 2s: four exchanges at 30 req/min each. Still inside every venue's
    // public limits (Kraken's ~1 req/s is the tightest), but this is the
    // practical ceiling for REST polling — 1s would be 60/min per venue, and
    // the failure mode is backwards: fetchBtcUsdSpot needs 2 venues to answer
    // or it writes NO point at all, so tripping a rate limit LENGTHENS the
    // stale-mark window it was meant to shorten. Going below 2s wants
    // exchange websocket tickers, not a faster poll.
    //
    // Measured divergence-window frequency scales ~T^1.95, so 5s -> 2s is
    // roughly a 6x cut in the windows a latency bot can trade against.
    pollPeriodMs: 2_000,
    fetchLatest: fetchBtcUsdSpot,
  },
  // The `uk-grid-carbon` (NESO) feed was removed when its market was
  // sunset on 2026-08-10. Nothing consumed it afterwards, and the tick kept
  // polling NESO every 15s for a resolved market — which also forced the
  // `[oracle-feeds]` GCP alert to carry a `NOT ... "uk-grid-carbon"` filter
  // that silenced real errors from every other feed by substring. Reviving
  // it means restoring this entry, the adapter and its backfill script from
  // history, and dropping that alert exclusion. Its historical oracle_prices
  // rows are untouched, and its attribution entry deliberately stays in
  // common/perps/oracle-attribution.ts — the resolved market page still
  // renders that data and the NESO credit is a licence obligation.

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
  //
  // All four stay on the tick's old 15s poll rather than following BTC to 5s.
  // A round costs 4 Jupiter calls (one per token), 4 Gate and 2 MEXC; at 5s
  // that is 48/min against Jupiter's keyless lite tier, which is close enough
  // to its limit that a 429 is likely — and a 429 drops QQQx or GLDx below
  // getConsensusMedian's two-source minimum, skipping the tick entirely. A
  // stalled feed pauses its market, which is a far worse outcome than a mark
  // that is 15s old. Nothing here is being sniped yet either: these markets
  // do not exist until after this deploys, so there is no measured edge to
  // price against, unlike BTC. To move them to 5s later, batch the Jupiter
  // leg first — its price v3 endpoint takes comma-separated ids, so all four
  // tokens collapse into one call.
  {
    id: SPYX_USD_FEED_ID,
    description:
      'SPYx/USD (tokenized S&P 500 ETF), median of Jupiter/Gate/MEXC',
    marketCreationEnabled: true,
    cadence: 'fast',
    minPrice: 10,
    maxPrice: 50_000,
    staleAfterMs: 5 * MINUTE_MS,
    updatePeriodMs: 16_000,
    // 16s, not 15s: pollPeriodMs must be a whole number of ORACLE_TICK_PERIOD_MS
    // ticks or isPollDue rounds it down (15s would run at 14s). These adapters
    // wait on up to three venues, so round AWAY from more load, not toward it.
    pollPeriodMs: 16_000,
    fetchLatest: () => fetchXStockUsdPrice(XSTOCK_SPECS.SPYX),
  },
  {
    id: QQQX_USD_FEED_ID,
    description: 'QQQx/USD (tokenized Nasdaq-100 ETF), Jupiter+Gate agreement',
    marketCreationEnabled: true,
    cadence: 'fast',
    minPrice: 10,
    maxPrice: 50_000,
    staleAfterMs: 5 * MINUTE_MS,
    updatePeriodMs: 16_000,
    // 16s, not 15s: pollPeriodMs must be a whole number of ORACLE_TICK_PERIOD_MS
    // ticks or isPollDue rounds it down (15s would run at 14s). These adapters
    // wait on up to three venues, so round AWAY from more load, not toward it.
    pollPeriodMs: 16_000,
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
    updatePeriodMs: 16_000,
    // 16s, not 15s: pollPeriodMs must be a whole number of ORACLE_TICK_PERIOD_MS
    // ticks or isPollDue rounds it down (15s would run at 14s). These adapters
    // wait on up to three venues, so round AWAY from more load, not toward it.
    pollPeriodMs: 16_000,
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
    updatePeriodMs: 16_000,
    // 16s, not 15s: pollPeriodMs must be a whole number of ORACLE_TICK_PERIOD_MS
    // ticks or isPollDue rounds it down (15s would run at 14s). These adapters
    // wait on up to three venues, so round AWAY from more load, not toward it.
    pollPeriodMs: 16_000,
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
    description: "VoteHub's published time-weighted Trump approval average",
    marketCreationEnabled: true,
    // 'daily' means "own scheduler job, health-checked here only" — it does
    // NOT mean daily cadence. update-trump-approval polls every 5 minutes
    // (VoteHub serves Cache-Control: max-age=300) and writes a point only
    // when the value moves, plus a heartbeat so a flat stretch cannot look
    // like a dead feed.
    cadence: 'daily',
    minPrice: 10,
    maxPrice: 90,
    // Corruption is caught at the source in two places, neither of which is
    // on the price path any more: readPublishedApprovalAverage rejects a
    // published average outside (0,100) or staler than
    // TRUMP_APPROVAL_MAX_SOURCE_AGE_DAYS, and the independent cross-check
    // refuses to publish a value our own computation disagrees with by more
    // than TRUMP_APPROVAL_MAX_CROSS_CHECK_GAP. getApprovePct now only
    // screens polls feeding that cross-check.
    staleAfterMs: 26 * HOUR_MS,
    // The value changes about once a day even though it is polled every 5
    // minutes, and this drives the funding period of any NEW market on the
    // feed (max(1h, updatePeriodMs)). Holding it at a day keeps funding
    // matched to how often the number actually moves rather than to how
    // often we look at it. The live market carries its own frozen 24h value.
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

/**
 * Minimum `maxOraclePriceAgeMs` a market on this feed may be configured with —
 * i.e. the tightest "refuse to trade against a mark older than this" gate.
 *
 * This used to be `staleAfterMs`, which conflated two different questions.
 * `staleAfterMs` answers "when should this feed page someone?", and is
 * deliberately slack — 2 minutes on BTC, so a couple of missed ticks do not
 * wake anyone at 3am. The trading gate answers "how old a price may a trade
 * execute against?", where 2 minutes is 60 ticks of a 2s feed. Using the
 * alerting number as the floor is why the BTC market shipped accepting trades
 * against a two-minute-old mark, which is the window latency bots were paid
 * out of.
 *
 * The floor that actually matters is the feed's own cadence: a gate tighter
 * than a couple of update periods would freeze trading between perfectly
 * healthy updates. Taking the MIN of the two can only ever loosen the previous
 * floor, so every market that validates today still validates.
 */
export const MIN_MARK_AGE_UPDATE_PERIODS = 2

export const getMinTradingMarkAgeMs = (feed: OracleFeedDef) =>
  Math.min(feed.staleAfterMs, MIN_MARK_AGE_UPDATE_PERIODS * feed.updatePeriodMs)

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
