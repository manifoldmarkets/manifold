import { normalizeOraclePointBatch } from 'common/perps/oracle'

import { OSRS_BOND_GP_FEED_ID, insertOraclePrices } from 'shared/oracle'
import { getOracleFeed } from 'shared/oracle-feeds'
import {
  OSRS_TIMESERIES_WINDOW_SECONDS,
  fetchOsrsBondHistory,
} from 'shared/osrs-bond-price'
import { log } from 'shared/utils'
import { assertBackfillTarget } from './backfill-guard'
import { runScript } from './run-script'

// Backfill `osrs-bond-gp` from the OSRS Wiki's `/timeseries` route, so the
// market chart has context on day one.
//
// One point per window, stamped at the window's END and carrying the window's
// start as `sourceTs` — exactly what the live feed publishes, so the seeded
// series and the live one are the same quantity measured the same way.
//
// The route returns up to 365 windows, so the timestep chooses span against
// resolution: `--timestep=6h` (the default) is about three months at four
// points a day, and `--timestep=24h` is a full year of dailies — which is the
// one that shows the 16.4M January 2026 high and the fall to 11.3M, i.e. the
// context that tells a trader this is a two-sided market. Run 24h first and 6h
// after it if you want both; the stamps differ, so they append rather than
// collide, and on-conflict-do-nothing makes the overlap a no-op.
//
// ⚠️ NOT for a live feed. Published points are immutable and may already have
// been consumed by funding and liquidations; this is for standing up a NEW
// feed. The guard refuses a feed that backs an unresolved market unless
// `--force` is passed.
if (require.main === module)
  runScript(async ({ pg }) => {
    const feed = getOracleFeed(OSRS_BOND_GP_FEED_ID)
    if (!feed) throw new Error(`${OSRS_BOND_GP_FEED_ID} is not registered`)
    await assertBackfillTarget(pg, OSRS_BOND_GP_FEED_ID)

    const timestepArg = process.argv
      .find((arg) => arg.startsWith('--timestep='))
      ?.slice('--timestep='.length)
    const timestep = timestepArg ?? '6h'
    if (OSRS_TIMESERIES_WINDOW_SECONDS[timestep] == null)
      throw new Error(
        `unknown --timestep=${timestep}; expected one of ${Object.keys(
          OSRS_TIMESERIES_WINDOW_SECONDS
        ).join(', ')}`
      )

    const { windows, skipped } = await fetchOsrsBondHistory(timestep)
    log(`fetched ${windows.length} usable ${timestep} window(s)`)
    if (skipped.length > 0)
      // Expected, not alarming: a one-sided or thin window is a normal quiet
      // stretch, and the live feed publishes nothing for those either.
      log.warn(
        `skipped ${skipped.length} unusable window(s): ${skipped
          .slice(0, 5)
          .join(' | ')}`
      )

    const outOfBounds: string[] = []
    const raw = windows.flatMap((window) => {
      if (window.price < feed.minPrice || window.price > feed.maxPrice) {
        outOfBounds.push(
          `${new Date(window.windowEndMs).toISOString()} = ${window.price}`
        )
        return []
      }
      return [
        {
          ts: window.windowEndMs,
          price: window.price,
          sourceTs: window.windowStartMs,
        },
      ]
    })
    if (outOfBounds.length > 0)
      log.warn(
        `skipping ${outOfBounds.length} midpoint(s) outside [${
          feed.minPrice
        }, ${feed.maxPrice}]: ${outOfBounds.slice(0, 10).join(', ')}`
      )

    const batch = normalizeOraclePointBatch(raw)
    if (!batch.ok) throw new Error(`refusing to backfill: ${batch.reason}`)
    const points = batch.points

    if (points.length > 0) {
      const first = points[0]
      const last = points[points.length - 1]
      const values = points.map((point) => point.price)
      log(`first: ${new Date(first.ts).toISOString()} = ${first.price} gp`)
      log(`last:  ${new Date(last.ts).toISOString()} = ${last.price} gp`)
      log(`range: ${Math.min(...values)} .. ${Math.max(...values)} gp`)
    }
    await insertOraclePrices(pg, OSRS_BOND_GP_FEED_ID, points)
    log(`backfilled ${points.length} ${OSRS_BOND_GP_FEED_ID} points`)
  })
