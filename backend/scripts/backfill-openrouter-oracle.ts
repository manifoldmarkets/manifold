import {
  LabShareFeed,
  computeLabShare,
  validateLabSharePublication,
} from 'common/perps/lab-share'
import {
  OPEN_WEIGHT_WINDOW_DAYS,
  computeOpenWeightShare,
  utcDateString,
  validateOpenWeightPublication,
} from 'common/perps/open-weight-models'
import { DAY_MS } from 'common/util/time'
import { fetchOpenRouterRankings } from 'shared/openrouter-tokens'
import {
  OPENROUTER_ANTHROPIC_SHARE_FEED_ID,
  OPENROUTER_CHINESE_LAB_SHARE_FEED_ID,
  OPENROUTER_OPEN_WEIGHT_FEED_ID,
  insertOraclePrices,
} from 'shared/oracle'
import { log } from 'shared/utils'
import { runScript } from './run-script'

// Backfill an OpenRouter index feed so the market chart has context on day
// one — the perps chart needs history to render timeframes.
//
//   npx ts-node backfill-openrouter-oracle.ts                       (open-weight, the default)
//   npx ts-node backfill-openrouter-oracle.ts --feed=openrouter-anthropic-share
//   npx ts-node backfill-openrouter-oracle.ts --feed=openrouter-chinese-lab-share
//
// One point per historical UTC day D, valued at the trailing-7-day share over
// [D-6, D] — the same window the hourly job computes, so the series is
// continuous across the handoff. Each point is stamped at the END of day D
// (D+1 00:00 UTC), the instant that window became complete; day-boundary
// stamps never collide with the live job's Date.now() stamps.
//
// Two honest limitations, both of which belong in the market description:
//  - Historical points are classified with the CURRENT list (models for the
//    open-weight feed, authors for the Chinese-lab feed). Reconstructing
//    "what we would have thought at the time" is not possible, and the
//    alternative (retroactive reclassification) rewrites settled history.
//  - Re-running this after a classification list changes will NOT rewrite
//    the stable day-boundary points: published history is append-only. A new
//    methodology therefore needs a new feed id rather than a live rerun.
//
// OpenRouter caps a single request at 366 days, which comfortably covers a
// year of chart history in one call — ONE call for whichever feed is chosen.
const BACKFILL_DAYS = 365

const LAB_FEEDS: Record<string, LabShareFeed> = {
  [OPENROUTER_ANTHROPIC_SHARE_FEED_ID]: 'anthropic',
  [OPENROUTER_CHINESE_LAB_SHARE_FEED_ID]: 'chinese-lab',
}

if (require.main === module)
  runScript(async ({ pg }) => {
    const feedId =
      process.argv
        .find((arg) => arg.startsWith('--feed='))
        ?.slice('--feed='.length) ?? OPENROUTER_OPEN_WEIGHT_FEED_ID
    const labFeed: LabShareFeed | undefined = LAB_FEEDS[feedId]
    if (feedId !== OPENROUTER_OPEN_WEIGHT_FEED_ID && !labFeed)
      throw new Error(
        `unknown --feed=${feedId}; expected ${[
          OPENROUTER_OPEN_WEIGHT_FEED_ID,
          ...Object.keys(LAB_FEEDS),
        ].join(', ')}`
      )

    const now = Date.now()
    const startDate = utcDateString(now - BACKFILL_DAYS * DAY_MS)
    const endDate = utcDateString(now)

    const rankings = await fetchOpenRouterRankings(startDate, endDate)
    if (!rankings) {
      log.error('no OPENROUTER_API_KEY — cannot backfill')
      return
    }
    if (!rankings.asOf) {
      log.error(
        'OpenRouter response has no valid meta.as_of — aborting backfill'
      )
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

    const sourceTs = Date.parse(rankings.asOf)
    const points: { ts: number; price: number; sourceTs: number }[] = []
    const rejections: string[] = []
    // Start once a full window is available, so no point is computed from a
    // short window (which would read as a spike at the left edge).
    for (let i = OPEN_WEIGHT_WINDOW_DAYS - 1; i < dates.length; i++) {
      const window = dates.slice(i - OPEN_WEIGHT_WINDOW_DAYS + 1, i + 1)
      const rows = window.flatMap((d) => byDate[d])
      // Cap 0 = halt on ANY unclassified model (open-weight) or unknown
      // author (Chinese-lab), which is what this script has always meant.
      //
      // Grace is a trade the LIVE feed can make: publishing a bounded sub-point
      // error for a few hours beats marking a live market against a stale
      // oracle, and the error is temporary because the model gets classified
      // and the next tick is correct. A backfill has neither half of that.
      // There is no stale-oracle harm to weigh against — nothing is trading on
      // a point from six months ago — and nothing self-corrects, because
      // insertOraclePrices never overwrites an existing (feed_id, ts). A point
      // written under grace here is a permanently wrong point in published
      // history, computed from a denominator that silently omitted a model.
      //
      // So this script keeps its original posture: any unclassified model (or
      // unknown author) in any window aborts the whole run with no inserts,
      // and a human extends the list before retrying.
      const publication = labFeed
        ? validateLabSharePublication(computeLabShare(labFeed, rows), {
            unknownShareCap: 0,
          })
        : validateOpenWeightPublication(computeOpenWeightShare(rows), {
            unclassifiedShareCap: 0,
          })
      if (!publication.ok) {
        rejections.push(`${dates[i]}: ${publication.reason}`)
        continue
      }
      points.push({
        ts: Date.parse(`${dates[i]}T00:00:00.000Z`) + DAY_MS,
        price: publication.share,
        sourceTs,
      })
    }

    if (rejections.length > 0) {
      log.error(
        `unsafe OpenRouter history for ${feedId} — aborting without inserts:\n${rejections
          .slice(0, 20)
          .join('\n')}`
      )
      return
    }

    log(`computed ${points.length} daily trailing-window points for ${feedId}`)
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
    await insertOraclePrices(pg, feedId, points)
    log(`backfilled ${points.length} ${feedId} points`)
  })
