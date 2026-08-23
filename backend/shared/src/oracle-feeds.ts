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
