import { normalizeOraclePointBatch } from 'common/perps/oracle'

import { fetchEurUsdHourlyHistory } from 'shared/fx-price'
import { EUR_USD_FEED_ID, insertOraclePrices } from 'shared/oracle'
import { getOracleFeed } from 'shared/oracle-feeds'
import { log } from 'shared/utils'
import { assertBackfillTarget } from './backfill-guard'
import { runScript } from './run-script'

// Backfill `eur-usd` from Bitstamp's hourly EUR/USD candles, so the market
// chart has context on day one.
//
// One point per hourly candle, stamped at the candle's CLOSE, which is about 41
// days of history in a single call — past the 30-day, 720-point minimum the
// launch manifest asks of a fast feed. Hourly stamps land on the hour and the
// live job stamps at Date.now(), so the two series meet without colliding.
//
// ⚠️ NOT for a live feed. Published points are immutable and may already have
// been consumed by funding and liquidations; this is for standing up a NEW
// feed. `insertOraclePrices` is on-conflict-do-nothing, so an accidental rerun
// leaves existing rows alone, and the guard refuses a feed that backs an
// unresolved market unless `--force` is passed.
//
// Closes outside the registry bounds are skipped and reported rather than
// clamped — the live feed would have published nothing for that hour either.
if (require.main === module)
  runScript(async ({ pg }) => {
    const feed = getOracleFeed(EUR_USD_FEED_ID)
    if (!feed) throw new Error(`${EUR_USD_FEED_ID} is not registered`)
    await assertBackfillTarget(pg, EUR_USD_FEED_ID)

    const history = await fetchEurUsdHourlyHistory()
    log(`fetched ${history.length} hourly candle(s)`)

    const skipped: string[] = []
    const raw = history.flatMap((point) => {
      if (point.price < feed.minPrice || point.price > feed.maxPrice) {
        skipped.push(`${new Date(point.ts).toISOString()} = ${point.price}`)
        return []
      }
      return [point]
    })
    if (skipped.length > 0)
      log.warn(
        `skipping ${skipped.length} close(s) outside [${feed.minPrice}, ${
          feed.maxPrice
        }]: ${skipped.slice(0, 10).join(', ')}`
      )

    // Two closes on one stamp would let insert order pick the published value.
    const batch = normalizeOraclePointBatch(raw)
    if (!batch.ok) throw new Error(`refusing to backfill: ${batch.reason}`)
    const points = batch.points

    if (points.length > 0) {
      const first = points[0]
      const last = points[points.length - 1]
      const values = points.map((point) => point.price)
      log(`first: ${new Date(first.ts).toISOString()} = ${first.price}`)
      log(`last:  ${new Date(last.ts).toISOString()} = ${last.price}`)
      log(`range: ${Math.min(...values)} .. ${Math.max(...values)}`)
    }
    await insertOraclePrices(pg, EUR_USD_FEED_ID, points)
    log(`backfilled ${points.length} ${EUR_USD_FEED_ID} points`)
  })
