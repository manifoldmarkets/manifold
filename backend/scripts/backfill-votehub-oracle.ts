import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
dayjs.extend(utc)
dayjs.extend(timezone)

import {
  readPublishedSeries,
  voteHubDaySourceTs,
} from 'common/perps/votehub-average'

import { log } from 'shared/utils'
import { insertOraclePrices } from 'shared/oracle'
import { getOracleFeed } from 'shared/oracle-feeds'
import { VOTEHUB_FEED_SPECS, fetchVoteHubAverage } from 'shared/votehub-feeds'
import { runScript } from './run-script'

// Backfill a VoteHub average feed from VoteHub's published, time-weighted
// series — the same series the live job publishes, so a backfill and the
// live feed can never disagree about what the index means.
//
//   npx ts-node backfill-votehub-oracle.ts --feed=votehub-generic-ballot-2026
//   npx ts-node backfill-votehub-oracle.ts --feed=vance-favorability
//
// Only the specs in VOTEHUB_FEED_SPECS are accepted. `trump-approval-rating`
// is deliberately refused: that feed has a live market, and its own
// (equivalent) script, backfill-trump-approval-oracle.ts, exists for the
// record.
//
// ⚠️ NOT for a live feed. Points already published are immutable and may have
// been consumed by funding and liquidations; this writes history under
// whatever the methodology is TODAY, so running it against a feed with open
// positions rewrites the basis those positions were priced against. It exists
// for standing up a NEW feed, and `insertOraclePrices` is on-conflict-do-
// nothing, so existing rows are left alone even if it is run by accident.
//
// Run `list-votehub-averages.ts` first for a feed whose spec is marked as not
// yet verified against a live response: a wrong average key fails here with
// an HTTP error, a wrong answer key reads zero usable days, and either is the
// signal to fix the spec constant rather than the data.
if (require.main === module)
  runScript(async ({ pg }) => {
    const feedId = process.argv
      .find((arg) => arg.startsWith('--feed='))
      ?.slice('--feed='.length)
    const spec = VOTEHUB_FEED_SPECS.find((s) => s.feedId === feedId)
    if (!spec)
      throw new Error(
        `pass --feed=<feedId>; backfillable VoteHub feeds: ${VOTEHUB_FEED_SPECS.map(
          (s) => s.feedId
        ).join(', ')}`
      )
    const feed = getOracleFeed(spec.feedId)
    if (!feed) throw new Error(`${spec.feedId} is not registered`)

    // Stamp each day's point from its own calendar date rather than adding a
    // day to a running instant: dayjs.tz(...).add(1,'day') adds 24 UTC hours,
    // so a loop started in PST drifts to 1 AM once PDT begins, and every
    // summer stamp lands an hour off midnight — colliding with the correctly
    // stamped rows the live job writes.
    const series = readPublishedSeries(await fetchVoteHubAverage(spec), {
      answerKey: spec.answerKey,
    })
    // The live publisher runs every point through validateOraclePoint; give
    // history the same registry bounds rather than writing a value the feed
    // itself would have refused. Skipped, reported, never clamped.
    const skipped = series.filter(
      (entry) => entry.price < feed.minPrice || entry.price > feed.maxPrice
    )
    if (skipped.length > 0)
      log.warn(
        `skipping ${skipped.length} day(s) outside [${feed.minPrice}, ${
          feed.maxPrice
        }]: ${skipped
          .slice(0, 10)
          .map((entry) => `${entry.day}=${entry.price}`)
          .join(', ')}`
      )
    const points = series
      .filter((entry) => !skipped.includes(entry))
      .map((entry) => ({
        ts: dayjs.tz(entry.day, spec.tz).valueOf(),
        price: entry.price,
        // The live publisher records VoteHub's day as source_ts so it can
        // refuse to roll back to an earlier day; history carries it too.
        sourceTs: voteHubDaySourceTs(entry.day) ?? undefined,
      }))
    const fromDay = series[0]?.day ?? 'n/a'
    const toDay = series[series.length - 1]?.day ?? 'n/a'
    log(
      `read ${points.length} published \`${spec.answerKey}\` daily averages ` +
        `for ${spec.averageKey} from ${fromDay} to ${toDay}`
    )
    if (points.length === 0)
      throw new Error(
        `no usable days under answer key \`${spec.answerKey}\` — check the ` +
          `spec against list-votehub-averages.ts before retrying`
      )
    log(
      `first point: ${new Date(
        points[0].ts
      ).toISOString()} = ${points[0].price.toFixed(2)}`
    )
    log(
      `last point: ${new Date(
        points[points.length - 1].ts
      ).toISOString()} = ${points[points.length - 1].price.toFixed(2)}`
    )
    await insertOraclePrices(pg, spec.feedId, points)
    log(`backfilled ${points.length} ${spec.feedId} oracle points`)
  })
