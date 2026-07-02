import { UK_GRID_CARBON_FEED_ID, upsertOraclePrices } from 'shared/oracle'
import { fetchIntensityBlocks, toNesoIso } from 'shared/uk-grid-carbon'
import { log } from 'shared/utils'
import { runScript } from './run-script'

// Backfill the `uk-grid-carbon` oracle feed with 90 days of 30-minute actual
// carbon intensity from the NESO API. The API caps range requests, so fetch
// in 7-day chunks. One point per finalized settlement block, recorded at the
// block's end time.
const DAYS = 90
const CHUNK_MS = 7 * 24 * 60 * 60 * 1000

if (require.main === module)
  runScript(async ({ pg }) => {
    const now = Date.now()
    const startMs = now - DAYS * 24 * 60 * 60 * 1000

    let total = 0
    for (let from = startMs; from < now; from += CHUNK_MS) {
      const to = Math.min(from + CHUNK_MS, now)
      const blocks = await fetchIntensityBlocks(toNesoIso(from), toNesoIso(to))
      const points = blocks
        .filter(
          (b) => b.intensity.actual != null && isFinite(b.intensity.actual)
        )
        .map((b) => ({
          ts: Math.min(Date.parse(b.to), now),
          price: b.intensity.actual as number,
        }))
      await upsertOraclePrices(pg, UK_GRID_CARBON_FEED_ID, points)
      total += points.length
      log(
        `chunk ending ${new Date(to).toISOString()}: ${points.length} blocks`
      )
      await new Promise((r) => setTimeout(r, 300))
    }

    log(`backfilled ${total} ${UK_GRID_CARBON_FEED_ID} oracle points`)
  })
