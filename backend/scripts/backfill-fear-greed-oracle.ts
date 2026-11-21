import { fearGreedDayStartUtc } from 'common/perps/fear-greed'
import { normalizeOraclePointBatch } from 'common/perps/oracle'

import { fetchFearGreedHistory } from 'shared/fear-greed'
import { CRYPTO_FEAR_GREED_FEED_ID, insertOraclePrices } from 'shared/oracle'
import { getOracleFeed } from 'shared/oracle-feeds'
import { log } from 'shared/utils'
import { assertBackfillTarget } from './backfill-guard'
import { runScript } from './run-script'

// Backfill `crypto-fear-greed` from Alternative.me's full history
// (`/fng/?limit=0`), so the market chart has context on day one.
//
// One point per historical UTC day, stamped at that day's 00:00 UTC — the
// instant the provider publishes it — with the provider's own timestamp as
// `sourceTs`. Day-boundary stamps never collide with the live job's
// Date.now() stamps, so the series is continuous across the handoff.
//
// ⚠️ NOT for a live feed. Points already published are immutable and may have
// been consumed by funding and liquidations; this exists for standing up a
// NEW feed, and `insertOraclePrices` is on-conflict-do-nothing, so existing
// rows are left alone even if it is run by accident.
//
// A reading outside the registry bounds — in practice only a literal 0, which
// the positivity rule forbids — is skipped and reported rather than clamped;
// the live feed would have paused on that day too.
if (require.main === module)
  runScript(async ({ pg }) => {
    const feed = getOracleFeed(CRYPTO_FEAR_GREED_FEED_ID)
    if (!feed) throw new Error(`${CRYPTO_FEAR_GREED_FEED_ID} is not registered`)
    await assertBackfillTarget(pg, CRYPTO_FEAR_GREED_FEED_ID)

    const history = await fetchFearGreedHistory()
    log(`fetched ${history.length} readings`)

    const skipped: string[] = []
    const raw = history.flatMap((reading) => {
      if (reading.value < feed.minPrice || reading.value > feed.maxPrice) {
        skipped.push(
          `${new Date(reading.sourceTs).toISOString()} = ${reading.value}`
        )
        return []
      }
      return [
        {
          ts: fearGreedDayStartUtc(reading.sourceTs),
          price: reading.value,
          sourceTs: reading.sourceTs,
        },
      ]
    })
    if (skipped.length > 0)
      log.warn(
        `skipping ${skipped.length} reading(s) outside [${feed.minPrice}, ${
          feed.maxPrice
        }]: ${skipped.slice(0, 10).join(', ')}`
      )

    // Two readings in one UTC day would map to one stamp; refuse the batch
    // rather than let insert order pick the winner.
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
    await insertOraclePrices(pg, CRYPTO_FEAR_GREED_FEED_ID, points)
    log(`backfilled ${points.length} ${CRYPTO_FEAR_GREED_FEED_ID} points`)
  })
