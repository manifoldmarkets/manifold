import { AdjacentIndexPrice } from 'common/perps/adjacent-msry'
import { normalizeOraclePointBatch } from 'common/perps/oracle'
import { HOUR_MS } from 'common/util/time'

import {
  fetchAdjacentIndexPrices,
  getAdjacentApiKey,
} from 'shared/adjacent-msry'
import { ADJACENT_MSRY_FEED_ID, insertOraclePrices } from 'shared/oracle'
import { getOracleFeed } from 'shared/oracle-feeds'
import { log } from 'shared/utils'
import { assertBackfillTarget } from './backfill-guard'
import { runScript } from './run-script'

// Backfill `adjacent-msry` with Adjacent's hourly MSRY history, so the market
// chart has context on day one.
//
//   npx ts-node backfill-adjacent-msry-oracle.ts [--dry-run] [--public] [--force]
//
// One point per COMPLETE hour, stamped at the hour's end (its value is the
// last one Adjacent recorded in the hour), with Adjacent's bucket start as
// `sourceTs`. Only hours that end before the feed's earliest existing point
// are written, so the backfill never interleaves with what the live feed has
// already published. Uses the realtime tier when ADJACENT_API_KEY is set
// (full history), otherwise or with --public the keyless tier, which serves
// the last 30 days hourly; completed hours are final in either.
//
// ⚠️ Run it only once Adjacent has permitted this use: the chart is part of
// the market (see common/perps/oracle-attribution.ts).
//
// ⚠️ NOT for a live feed. Points already published are immutable and may have
// been consumed by funding and liquidations; assertBackfillTarget refuses a
// feed that backs an unresolved market unless --force is passed.
const MAX_PAGES = 20

if (require.main === module)
  runScript(async ({ pg }) => {
    const dryRun = process.argv.includes('--dry-run')
    const tier =
      process.argv.includes('--public') || !getAdjacentApiKey()
        ? 'public'
        : 'realtime'
    const feed = getOracleFeed(ADJACENT_MSRY_FEED_ID)
    if (!feed) throw new Error(`${ADJACENT_MSRY_FEED_ID} is not registered`)
    await assertBackfillTarget(pg, ADJACENT_MSRY_FEED_ID)

    const earliest = await pg.oneOrNone<{ ts: string | null }>(
      `select min(ts) as ts from oracle_prices where feed_id = $1`,
      [ADJACENT_MSRY_FEED_ID]
    )
    const cutoff = Math.min(
      Date.now(),
      earliest?.ts ? new Date(earliest.ts).getTime() : Infinity
    )

    const rows: AdjacentIndexPrice[] = []
    for (let page = 1; page <= MAX_PAGES; page++) {
      const result = await fetchAdjacentIndexPrices({
        tier,
        interval: '1hour',
        perPage: 1000,
        page,
      })
      rows.push(...result.rows)
      if (!result.hasNext) break
      if (page === MAX_PAGES)
        log.warn(`stopping after ${MAX_PAGES} pages; older history is skipped`)
    }
    log(`fetched ${rows.length} hourly rows from the ${tier} tier`)

    const skipped: string[] = []
    const raw = rows.flatMap((row) => {
      const ts = row.sourceTs + HOUR_MS
      // The newest bucket is still filling (the public tier stamps it at its
      // snapshot minute, not on the hour), and anything at or after the live
      // feed's first point is already covered.
      if (ts > cutoff) return []
      if (row.price < feed.minPrice || row.price > feed.maxPrice) {
        skipped.push(`${new Date(row.sourceTs).toISOString()} = ${row.price}`)
        return []
      }
      return [{ ts, price: row.price, sourceTs: row.sourceTs }]
    })
    if (skipped.length > 0)
      log.warn(
        `skipping ${skipped.length} hour(s) outside [${feed.minPrice}, ${
          feed.maxPrice
        }]: ${skipped.slice(0, 10).join(', ')}`
      )

    const batch = normalizeOraclePointBatch(raw)
    if (!batch.ok) throw new Error(`refusing to backfill: ${batch.reason}`)
    const points = batch.points
    if (points.length > 0) {
      const first = points[0]
      const last = points[points.length - 1]
      const values = points.map((p) => p.price)
      log(`first: ${new Date(first.ts).toISOString()} = ${first.price}`)
      log(`last:  ${new Date(last.ts).toISOString()} = ${last.price}`)
      log(`range: ${Math.min(...values)} .. ${Math.max(...values)}`)
    }
    if (dryRun) {
      log(`--dry-run: would backfill ${points.length} points`)
      return
    }
    await insertOraclePrices(pg, ADJACENT_MSRY_FEED_ID, points)
    log(`backfilled ${points.length} ${ADJACENT_MSRY_FEED_ID} points`)
  })
