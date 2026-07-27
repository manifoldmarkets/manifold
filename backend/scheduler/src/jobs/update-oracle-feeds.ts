import { upsertOraclePrices } from 'shared/oracle'
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

// The fast oracle tick (every 15s, modeled on sports-live). For each `fast`
// feed in the registry:
//   1. Fetch the latest point, validate against sanity bounds / jump guard,
//      and upsert into oracle_prices.
//   2. Apply the price to every live perp on the feed via runOracleUpdate
//      (liquidation + ADL run atomically with the price write — do NOT add a
//      cheaper price-only path; closes settle against the cached price).
//   3. Alert (log.error → GCP log-based alerting) when a feed goes stale.
// `daily` feeds are written by their own jobs; their staleness is checked by
// the hourly update-perps job, which sees which live contracts they back.
// Croner's `protect` skips a firing while the previous one still runs, so a
// slow upstream can't stack ticks.
export async function updateOracleFeeds() {
  const pg = createSupabaseDirectClient()
  const fastFeeds = ORACLE_FEEDS.filter((f) => f.cadence === 'fast')
  await Promise.all(fastFeeds.map((feed) => tickOneFeed(pg, feed)))
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
      // batches), so upsert the whole window — idempotent on (feed_id, ts) —
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
        await upsertOraclePrices(pg, feed.id, valid)
        const newest = valid[valid.length - 1]
        if (!latest || newest.ts > latest.ts) latest = newest
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
          await upsertOraclePrices(pg, feed.id, [point])
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

    if (!latest) return
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
