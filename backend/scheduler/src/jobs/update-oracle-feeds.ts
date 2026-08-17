import { normalizeOraclePointBatch } from 'common/perps/oracle'
import { MINUTE_MS } from 'common/util/time'

import { insertOraclePrices } from 'shared/oracle'
import {
  ORACLE_FEEDS,
  OracleFeedDef,
  validateOraclePoint,
} from 'shared/oracle-feeds'
import {
  SupabaseDirectClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { log } from 'shared/utils'
import { applyOraclePointToLivePerps } from 'shared/perps/apply-oracle-point'

// The fast oracle tick (fires every 5s, modeled on sports-live). For each
// `fast` feed in the registry that is due to be polled:
//   1. Fetch the latest point, validate against sanity bounds and timestamp
//      ordering, and upsert into oracle_prices.
//   2. Apply the price to every live perp on the feed via runOracleUpdate
//      (liquidation + ADL run atomically with the price write — do NOT add a
//      cheaper price-only path; closes settle against the cached price).
//   3. Alert (log.error → GCP log-based alerting) when a feed goes stale.
// `daily` feeds are written by their own jobs; their staleness is checked by
// the hourly update-perps job, which sees which live contracts they back.
// Feeds are dispatched, NOT awaited, and each is guarded independently. This
// matters because croner's `protect` is per-JOB: it skips a firing while the
// previous one is still running, so awaiting every due feed together would
// let any one slow source hold the whole run across the next tick. With
// xStocks on the same job that is a live regression of this file's purpose —
// their adapter waits on up to three venues at a 5s timeout each and they
// come due every third BTC firing, so one hanging Jupiter request would push
// BTC's interval to 10s exactly when the mark is moving. The per-feed
// in-flight guard below is a strictly finer-grained `protect`: it still
// prevents a feed from stacking on ITSELF, without coupling feeds to each
// other.
export async function updateOracleFeeds() {
  const pg = createSupabaseDirectClient()
  const now = Date.now()

  for (const feed of ORACLE_FEEDS) {
    if (feed.cadence === 'fast') {
      if (isPollDue(feed.id, feed.pollPeriodMs, now))
        dispatch(feed.id, () => tickOneFeed(pg, feed))
    } else if (isPollDue(feed.id, DAILY_PROBE_PERIOD_MS, now)) {
      dispatch(feed.id, () => probeDailyFeedStaleness(pg, feed))
    }
  }
}

// Per-feed poll throttle. The cron fires at the rate the FASTEST feed wants
// (5s, for BTC); every other feed opts down via pollPeriodMs, so raising the
// tick rate for one source does not raise it for all of them. State is
// in-memory — a scheduler restart polls everything once immediately, which is
// the correct bias: fresher marks, and staleness alerting re-arms at once.
const lastPollAttempt: Record<string, number> = {}
const inFlight: Record<string, boolean> = {}

/**
 * Start a feed's work without blocking the cron run, at most once at a time.
 *
 * Skipping while in-flight is what replaces croner's `protect` at feed
 * granularity: a source slower than its own poll period falls back to running
 * as often as it can finish, rather than piling up overlapping fetches.
 *
 * The attempt is stamped here, before the work starts, so a source that hangs
 * to its fetch timeout does not earn an immediate retry on the next firing.
 * `tickOneFeed` and `probeDailyFeedStaleness` both catch internally and never
 * reject; the `.catch` is a backstop so a future edit that lets one throw
 * cannot become an unhandled rejection that takes the scheduler down.
 */
const dispatch = (feedId: string, run: () => Promise<void>) => {
  if (inFlight[feedId]) return
  inFlight[feedId] = true
  lastPollAttempt[feedId] = Date.now()
  void run()
    .catch((err) => log.error(`[oracle-feeds] ${feedId}: unhandled — ${err}`))
    .finally(() => {
      inFlight[feedId] = false
    })
}

// The daily feeds' staleness probe is a read-only indexed lookup, but it has
// no reason to run 12x a minute; it can only alert once an hour anyway.
const DAILY_PROBE_PERIOD_MS = MINUTE_MS

// Cron firings are not spaced exactly pollPeriodMs apart. Without slack, a
// feed whose period equals the tick interval would fail the comparison on
// roughly every other firing and silently run at half its configured rate.
const POLL_PERIOD_SLACK = 0.8

const isPollDue = (
  feedId: string,
  periodMs: number | undefined,
  now: number
) => {
  // Absent or nonsensical period = poll on every firing (the pre-throttle
  // behavior), so a registry addition can never accidentally go silent.
  if (periodMs == null || !Number.isFinite(periodMs) || periodMs <= 0)
    return true
  const last = lastPollAttempt[feedId]
  if (last == null) return true
  return now - last >= periodMs * POLL_PERIOD_SLACK
}

// Dead-man switch for daily feeds. Their points are written by their own
// jobs, and the only other staleness check (update-perps) runs per LIVE
// contract — a daily feed with no unresolved market on it can die silently.
// This probe is read-only (no fetch, no apply) and throttled so a stale feed
// alerts about once per hour instead of on every probe. Throttle state is
// in-memory; a scheduler restart re-alerts immediately, which is fine.
const STALE_ALERT_INTERVAL_MS = 60 * 60 * 1000
const lastStaleAlert: Record<string, number> = {}

const probeDailyFeedStaleness = async (
  pg: SupabaseDirectClient,
  feed: OracleFeedDef
) => {
  try {
    const row = await pg.oneOrNone<{ ts: string }>(
      `select ts from oracle_prices
       where feed_id = $1 order by ts desc limit 1`,
      [feed.id]
    )
    const latestTs = row ? new Date(row.ts).getTime() : null
    const stale = latestTs == null || Date.now() - latestTs > feed.staleAfterMs
    if (!stale) return
    const last = lastStaleAlert[feed.id] ?? 0
    if (Date.now() - last < STALE_ALERT_INTERVAL_MS) return
    lastStaleAlert[feed.id] = Date.now()
    log.error(
      `[oracle-feeds] daily feed ${feed.id} is stale: latest point ${
        latestTs ? new Date(latestTs).toISOString() : 'none'
      } exceeds staleAfterMs=${feed.staleAfterMs}`
    )
  } catch (err) {
    log.error(`[oracle-feeds] ${feed.id}: staleness probe failed — ${err}`)
  }
}

const tickOneFeed = async (pg: SupabaseDirectClient, feed: OracleFeedDef) => {
  try {
    const prevRow = await pg.oneOrNone<{ ts: string; price: number | string }>(
      `select ts, price from oracle_prices
       where feed_id = $1 order by ts desc limit 1`,
      [feed.id]
    )
    const prev = prevRow
      ? { ts: new Date(prevRow.ts).getTime(), price: Number(prevRow.price) }
      : null

    let latest = prev
    if (feed.fetchRecent) {
      // Batch sources publish out of order (NESO settles actuals in late
      // batches), so insert the whole window — idempotent on (feed_id, ts) —
      // rather than sampling the newest point and permanently dropping any
      // block that finalized after its successor. Row growth is bounded by
      // the source's block cadence, not the tick rate, so shouldWrite's
      // dedupe isn't needed here.
      const points = await feed.fetchRecent()
      const valid: { ts: number; price: number }[] = []
      for (const point of points) {
        const rejection = validateOraclePoint(feed, null, point)
        if (rejection) {
          log.error(
            `[oracle-feeds] ${feed.id}: rejected ${point.price} @ ${new Date(
              point.ts
            ).toISOString()} — ${rejection}`
          )
        } else {
          valid.push(point)
        }
      }
      if (valid.length > 0) {
        const normalized = normalizeOraclePointBatch(valid)
        if (!normalized.ok) {
          log.error(
            `[oracle-feeds] ${feed.id}: rejected ambiguous batch — ${normalized.reason}`
          )
        } else {
          await insertOraclePrices(pg, feed.id, normalized.points)
          const newest = normalized.points[normalized.points.length - 1]
          if (newest && (!latest || newest.ts > latest.ts)) latest = newest
        }
      }
    } else if (feed.fetchLatest) {
      const point = await feed.fetchLatest()
      if (point) {
        const rejection = validateOraclePoint(feed, prev, point)
        if (rejection) {
          log.error(
            `[oracle-feeds] ${feed.id}: rejected ${point.price} @ ${new Date(
              point.ts
            ).toISOString()} — ${rejection}`
          )
        } else if (shouldWrite(feed, prev, point)) {
          await insertOraclePrices(pg, feed.id, [point])
          latest = point
        }
      }
    }

    // Feed health. Fast feeds are launch-critical, so silence is an incident
    // even with no live market attached (this is what would have caught the
    // dev feed that froze unnoticed for 19 days).
    if (latest && Date.now() - latest.ts > feed.staleAfterMs) {
      log.error(
        `[oracle-feeds] ${feed.id} is stale: latest point ${new Date(
          latest.ts
        ).toISOString()} exceeds staleAfterMs=${feed.staleAfterMs}`
      )
    }

    if (!latest) {
      log.error(
        `[oracle-feeds] ${feed.id} has no published point after a successful tick`
      )
      return
    }
    const latestPoint = latest

    // Apply to live perps on this feed. runOracleUpdate takes the
    // per-contract advisory lock and no-ops cheaply when nothing changed.
    await applyOraclePointToLivePerps(pg, feed.id, latestPoint)
  } catch (err) {
    log.error(`[oracle-feeds] ${feed.id}: tick failed — ${err}`)
  }
}

// Write when the price actually changed, plus a heartbeat at half the
// staleness threshold so a genuinely flat price can't trip the freshness
// gate. Skipping identical prices keeps oracle_prices from growing one row
// per tick per feed for no information.
const shouldWrite = (
  feed: OracleFeedDef,
  prev: { ts: number; price: number } | null,
  point: { ts: number; price: number }
) => {
  if (!prev) return true
  if (point.ts <= prev.ts) return false
  if (point.price !== prev.price) return true
  return point.ts - prev.ts >= feed.staleAfterMs / 2
}
