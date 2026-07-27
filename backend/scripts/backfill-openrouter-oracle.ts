import {
  OPEN_WEIGHT_WINDOW_DAYS,
  computeOpenWeightShare,
  utcDateString,
} from 'common/perps/open-weight-models'
import { DAY_MS } from 'common/util/time'
import { fetchOpenRouterRankings } from 'shared/openrouter-tokens'
import {
  OPENROUTER_OPEN_WEIGHT_FEED_ID,
  insertOraclePrices,
} from 'shared/oracle'
import { log } from 'shared/utils'
import { runScript } from './run-script'

// Backfill the `openrouter-open-weight-share` feed so the market chart has
// context on day one — the perps chart needs history to render timeframes.
//
// One point per historical UTC day D, valued at the trailing-7-day share over
// [D-6, D] — the same window the hourly job computes, so the series is
// continuous across the handoff. Each point is stamped at the END of day D
// (D+1 00:00 UTC), the instant that window became complete; day-boundary
// stamps never collide with the live job's Date.now() stamps.
//
// Two honest limitations, both of which belong in the market description:
//  - Historical points are classified with the CURRENT list. Reconstructing
//    "what we would have thought at the time" is not possible, and the
//    alternative (retroactive reclassification) rewrites settled history.
//  - Re-running this after the classification list changes WILL rewrite these
//    points, since day-boundary timestamps are stable. That is fine before a
//    market exists and is not fine after one does. Don't re-run it live.
//
// OpenRouter caps a single request at 366 days, which comfortably covers a
// year of chart history in one call.
const BACKFILL_DAYS = 365

if (require.main === module)
  runScript(async ({ pg }) => {
    const now = Date.now()
    const startDate = utcDateString(now - BACKFILL_DAYS * DAY_MS)
    const endDate = utcDateString(now)

    const rankings = await fetchOpenRouterRankings(startDate, endDate)
    if (!rankings) {
      log.error('no OPENROUTER_API_KEY — cannot backfill')
      return
    }
    log(`fetched ${rankings.rows.length} rows (as_of ${rankings.asOf})`)

    // Bucket rows by date once; recomputing the filter per day is O(n^2) over
    // ~18k rows.
    const byDate: Record<string, typeof rankings.rows> = {}
    for (const r of rankings.rows) (byDate[r.date] ??= []).push(r)
    const dates = Object.keys(byDate).sort()
    log(
      `covering ${dates.length} days: ${dates[0]}..${dates[dates.length - 1]}`
    )

    const points: { ts: number; price: number }[] = []
    const unclassifiedSeen = new Set<string>()
    // Start once a full window is available, so no point is computed from a
    // short window (which would read as a spike at the left edge).
    for (let i = OPEN_WEIGHT_WINDOW_DAYS - 1; i < dates.length; i++) {
      const window = dates.slice(i - OPEN_WEIGHT_WINDOW_DAYS + 1, i + 1)
      const rows = window.flatMap((d) => byDate[d])
      const result = computeOpenWeightShare(rows)
      if (result.share == null) continue
      for (const u of result.unclassified) unclassifiedSeen.add(u)
      points.push({
        ts: Date.parse(`${dates[i]}T00:00:00.000Z`) + DAY_MS,
        price: result.share,
      })
    }

    if (unclassifiedSeen.size > 0)
      log.error(
        `models excluded from history (not in the classification list): ${Array.from(
          unclassifiedSeen
        )
          .sort()
          .join(', ')}`
      )

    log(`computed ${points.length} daily trailing-window points`)
    if (points.length > 0) {
      const first = points[0]
      const last = points[points.length - 1]
      const prices = points.map((p) => p.price)
      log(
        `first: ${new Date(first.ts).toISOString()} = ${first.price.toFixed(
          2
        )}%`
      )
      log(
        `last:  ${new Date(last.ts).toISOString()} = ${last.price.toFixed(2)}%`
      )
      log(
        `range: ${Math.min(...prices).toFixed(2)}% .. ${Math.max(
          ...prices
        ).toFixed(2)}%`
      )
    }
    await insertOraclePrices(pg, OPENROUTER_OPEN_WEIGHT_FEED_ID, points)
    log(`backfilled ${points.length} ${OPENROUTER_OPEN_WEIGHT_FEED_ID} points`)
  })
