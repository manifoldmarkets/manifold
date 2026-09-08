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
import { FAST_TICK_ORACLE_BOUNDS } from 'shared/perps/oracle-tick-bounds'
import {
  createOracleFeedDispatcher,
  OraclePollAbandonedError,
  OraclePollProgress,
} from 'shared/oracle-feed-dispatcher'

// The fast oracle tick (fires every 2s, modeled on sports-live). For each
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
// their adapter waits on an RPC node (1.5s timeout), so one hanging request
// would push BTC's interval out exactly when the mark is moving. The
// per-feed dispatcher gives each feed one active polling slot. A deadline
// releases a hung slot; unfinished work stays counted until it settles.
export async function updateOracleFeeds() {
  const pg = createSupabaseDirectClient()
  const now = Date.now()

  for (const feed of ORACLE_FEEDS) {
    if (feed.cadence === 'fast') {
      if (isPollDue(feed.id, feed.pollPeriodMs, now))
        dispatcher.dispatch(feed.id, (progress) =>
          tickOneFeed(pg, feed, progress)
        )
    } else if (isPollDue(feed.id, DAILY_PROBE_PERIOD_MS, now)) {
      dispatcher.dispatch(feed.id, (progress) =>
        probeDailyFeedStaleness(pg, feed, progress)
      )
    }
  }
}

// Each feed recovers its polling slot after a deadline, while abandoned
// work stays counted against the process-wide limit until it settles.
const dispatcher = createOracleFeedDispatcher(log)

// The daily feeds' staleness probe is a read-only indexed lookup, but it has
// no reason to run 12x a minute; it can only alert once an hour anyway.
const DAILY_PROBE_PERIOD_MS = MINUTE_MS

/**
 * How often this job fires. Exported so the cron registration and the poll
 * throttle cannot disagree — a feed can only ever be polled on a firing, so
 * this is the quantum every pollPeriodMs is rounded to.
 */
export const ORACLE_TICK_PERIOD_MS = 2_000

// Firings are not spaced exactly pollPeriodMs apart, so the due check needs
// slack. Two things make the stamps jitter: croner's own scheduling, and the
// two awaited Supabase round-trips `createJob` performs before it ever calls
// this job — a slow one shifts the stamp by however long it took.
//
// The tolerance is HALF A TICK, tied to the cron quantum rather than to the
// period. It was previously 20% OF THE PERIOD, which silently rescaled the
// request: the nominally 60s daily probe actually ran at 50s, and a 6.3s feed
// would have quantized to 5s — faster than asked, which is the wrong
// direction to round for a rate-limited source. Half a tick makes every
// period land on its nearest multiple of the tick (60s stays 60s) and
// absorbs up to 2.5s of stamp jitter.
const POLL_JITTER_TOLERANCE_MS = ORACLE_TICK_PERIOD_MS / 2

const isPollDue = (
  feedId: string,
  periodMs: number | undefined,
  now: number
) => {
  // Absent or nonsensical period = poll on every firing (the pre-throttle
  // behavior), so a registry addition can never accidentally go silent.
  if (periodMs == null || !Number.isFinite(periodMs) || periodMs <= 0)
    return true
  const last = dispatcher.lastAttemptAt(feedId)
  if (last == null) return true
  // Cap at half the period too, so a period shorter than one tick cannot be
  // swallowed by the tolerance and turn into "poll on every firing".
  const tolerance = Math.min(POLL_JITTER_TOLERANCE_MS, periodMs / 2)
  return now - last >= periodMs - tolerance
}

/**
 * A pollPeriodMs that is not a whole number of ticks cannot be honoured — the
 * feed can only be polled on a firing, so it silently runs at the nearest
 * multiple instead. Report it rather than let the registry read as a promise
 * the scheduler does not keep. Checked once at startup; `pollPeriodMs` is a
 * static registry value, so a clean boot is a permanent all-clear.
 */
export const validateOracleFeedPollPeriods = () => {
  for (const feed of ORACLE_FEEDS) {
    const period = feed.pollPeriodMs
    if (period == null) continue
    if (!Number.isFinite(period) || period <= 0) {
      log.error(
        `[oracle-feeds] ${feed.id}: pollPeriodMs ${period} is not a positive duration; it will be polled on every tick`
      )
      continue
    }
    if (period % ORACLE_TICK_PERIOD_MS !== 0) {
      // Report what isPollDue ACTUALLY does, which is round DOWN, not to the
      // nearest tick: it fires on the first firing at or past
      // `period - tolerance`, so a 15s period on a 2s tick runs at 14s, not
      // 16s. The previous Math.round here misreported that in the direction
      // that matters — it claimed a feed was slower than it really is, which
      // would send someone hunting the wrong problem while the oracle quietly
      // polled a venue harder than its rate limit allows.
      const tolerance = Math.min(POLL_JITTER_TOLERANCE_MS, period / 2)
      const effective =
        Math.max(1, Math.ceil((period - tolerance) / ORACLE_TICK_PERIOD_MS)) *
        ORACLE_TICK_PERIOD_MS
      log.error(
        `[oracle-feeds] ${feed.id}: pollPeriodMs ${period} is not a multiple of the ${ORACLE_TICK_PERIOD_MS}ms tick; it will actually poll every ${effective}ms`
      )
    }
  }
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
  feed: OracleFeedDef,
  progress: OraclePollProgress
) => {
  try {
    progress.checkpoint('daily:read-latest-point')
    const row = await pg.oneOrNone<{ ts: string }>(
      `select ts from oracle_prices
       where feed_id = $1 order by ts desc limit 1`,
      [feed.id]
    )
    progress.checkpoint('daily:check-staleness')
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
    if (err instanceof OraclePollAbandonedError) return
    log.error(`[oracle-feeds] ${feed.id}: staleness probe failed — ${err}`)
  }
}

const tickOneFeed = async (
  pg: SupabaseDirectClient,
  feed: OracleFeedDef,
  progress: OraclePollProgress
) => {
  try {
    progress.checkpoint('read-latest-point')
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
      progress.checkpoint('fetch-recent')
      const points = await feed.fetchRecent()
      progress.checkpoint('validate-points')
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
          progress.checkpoint('insert-points')
          await insertOraclePrices(pg, feed.id, normalized.points)
          const newest = normalized.points[normalized.points.length - 1]
          if (newest && (!latest || newest.ts > latest.ts)) latest = newest
        }
      }
    } else if (feed.fetchLatest) {
      progress.checkpoint('fetch-latest')
      const point = await feed.fetchLatest()
      progress.checkpoint('validate-point')
      if (point) {
        const rejection = validateOraclePoint(feed, prev, point)
        if (rejection) {
          log.error(
            `[oracle-feeds] ${feed.id}: rejected ${point.price} @ ${new Date(
              point.ts
            ).toISOString()} — ${rejection}`
          )
        } else if (shouldWrite(feed, prev, point)) {
          progress.checkpoint('insert-point')
          await insertOraclePrices(pg, feed.id, [point])
          latest = point
        }
      }
    }

    progress.checkpoint('check-feed-health')
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
    //
    // This is the ONLY caller that passes bounds. The fast tick is the one
    // context where abandoning an apply beats completing it late: the next
    // tick is seconds away and carries a better price. Every other caller
    // (hourly update-perps, the daily publishers, the admin write path) must
    // wait and apply — see OracleUpdateBounds.
    await applyOraclePointToLivePerps(
      pg,
      feed.id,
      latestPoint,
      FAST_TICK_ORACLE_BOUNDS,
      progress
    )
  } catch (err) {
    if (err instanceof OraclePollAbandonedError) return
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
