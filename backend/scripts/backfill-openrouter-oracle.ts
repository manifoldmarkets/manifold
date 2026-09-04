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
import { getOracleFeed, validateOraclePoint } from 'shared/oracle-feeds'
import {
  recordPendingLabClassifications,
  resolveLabClassifications,
} from 'shared/perps/lab-classifications'
import type { PendingLabClassification } from 'shared/perps/lab-classifications'
import { log } from 'shared/utils'
import { assertBackfillTarget } from './backfill-guard'
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
// ⚠️ NOT for a live feed. Points already published are immutable and may have
// been consumed by funding and liquidations; this writes day-boundary history
// under the CURRENT resolved classifications and exists for standing up a NEW
// feed (today, the two lab-share feeds). `insertOraclePrices` is on-conflict-
// do-nothing, so existing rows are left alone even if it is run by accident —
// but a run against a feed that already has a live market would still append
// a day-boundary point next to every live Date.now() point. The DEFAULT
// target (no --feed) is the open-weight feed, which already has a market —
// so the script REFUSES any feed that backs an unresolved market unless
// --force is passed (assertBackfillTarget), whatever the default says.
//
// Two honest limitations, both of which belong in the market description:
//  - Historical points are classified with the CURRENT snapshot (models for
//    the open-weight feed, author/model placements for the Chinese-lab feed).
//    Reconstructing "what we would have thought at the time" is not possible;
//    retroactive reclassification would rewrite settled history.
//  - Re-running this after a classification snapshot changes will NOT rewrite
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
    // Own-property lookup: `--feed=constructor` must not resolve to
    // Object.prototype and write rows under that feed id.
    const labFeed: LabShareFeed | undefined =
      Object.prototype.hasOwnProperty.call(LAB_FEEDS, feedId)
        ? LAB_FEEDS[feedId]
        : undefined
    if (feedId !== OPENROUTER_OPEN_WEIGHT_FEED_ID && !labFeed)
      throw new Error(
        `unknown --feed=${feedId}; expected ${[
          OPENROUTER_OPEN_WEIGHT_FEED_ID,
          ...Object.keys(LAB_FEEDS),
        ].join(', ')}`
      )

    const feed = getOracleFeed(feedId)
    if (!feed) throw new Error(`${feedId} is not registered`)
    await assertBackfillTarget(pg, feedId)

    // Freeze one resolved classification snapshot for the entire run. A
    // click in the operator queue must unblock the backfill without a deploy,
    // while every historical window in one run must use the same methodology.
    const labClassifications =
      labFeed === 'chinese-lab'
        ? await resolveLabClassifications(pg)
        : undefined

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
    const pendingLabSubjects: PendingLabClassification[] = []
    // Start once a full window is available, so no point is computed from a
    // short window (which would read as a spike at the left edge).
    for (let i = OPEN_WEIGHT_WINDOW_DAYS - 1; i < dates.length; i++) {
      const window = dates.slice(i - OPEN_WEIGHT_WINDOW_DAYS + 1, i + 1)
      const rows = window.flatMap((d) => byDate[d])
      // Cap 0 = halt on ANY unclassified model (open-weight) or unknown
      // author/model (Chinese-lab), which is what this script has always meant.
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
      // So this script keeps its original posture: any unclassified model or
      // unknown lab subject in any window aborts the whole run with no inserts,
      // and a human clears the database queue before retrying.
      const labResult = labFeed
        ? computeLabShare(
            labFeed,
            rows,
            OPEN_WEIGHT_WINDOW_DAYS,
            labClassifications
          )
        : undefined
      if (labFeed === 'chinese-lab' && labResult) {
        const firstRankedAt = Date.parse(`${dates[i]}T00:00:00.000Z`)
        pendingLabSubjects.push(
          ...labResult.unknownAuthors.map((subjectSlug) => ({
            subjectType: 'author' as const,
            subjectSlug,
            evidence: { discoveredVia: 'backfill' },
            firstRankedAt,
          })),
          ...labResult.unknownModels.map((subjectSlug) => ({
            subjectType: 'model' as const,
            subjectSlug,
            evidence: { discoveredVia: 'backfill' },
            firstRankedAt,
          }))
        )
      }
      const publication = labResult
        ? validateLabSharePublication(labResult, { unknownShareCap: 0 })
        : validateOpenWeightPublication(computeOpenWeightShare(rows), {
            unclassifiedShareCap: 0,
          })
      if (!publication.ok) {
        rejections.push(`${dates[i]}: ${publication.reason}`)
        continue
      }
      const point = {
        ts: Date.parse(`${dates[i]}T00:00:00.000Z`) + DAY_MS,
        price: publication.share,
        sourceTs,
      }
      // Every historical point is held to the same registry definition the
      // live job applies (validateOraclePoint: bounds, positivity, strictly
      // increasing stamps). A share the live feed would refuse must not enter
      // history just because it is old — and a real value outside the bounds
      // is exactly the conversation the bounds exist to force.
      const rejection = validateOraclePoint(
        feed,
        points[points.length - 1] ?? null,
        point
      )
      if (rejection) {
        rejections.push(`${dates[i]}: ${rejection}`)
        continue
      }
      points.push(point)
    }

    // A delisted historical subject may be absent from today's catalog and
    // rankings. Populate the same operator queue before reporting the
    // zero-tolerance rejection, so a failed first run always exposes its own
    // no-deploy remedy.
    if (pendingLabSubjects.length > 0) {
      const changed = await recordPendingLabClassifications(
        pg,
        pendingLabSubjects
      )
      log(`recorded ${changed} historical lab subject(s) for review`)
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
