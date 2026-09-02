import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
dayjs.extend(utc)
dayjs.extend(timezone)

import { readPublishedSeries } from 'common/perps/votehub-average'

import { log } from 'shared/utils'
import { insertOraclePrices } from 'shared/oracle'
import {
  ALL_VOTEHUB_FEED_SPECS,
  fetchVoteHubAverage,
  getVoteHubFeedSpec,
} from 'shared/votehub-feeds'
import { runScript } from './run-script'

// Backfill a VoteHub average feed from VoteHub's published, time-weighted
// series — the same series the live job publishes, so a backfill and the
// live feed can never disagree about what the index means.
//
//   npx ts-node backfill-votehub-oracle.ts --feed=votehub-generic-ballot-2026
//   npx ts-node backfill-votehub-oracle.ts --feed=vance-favorability
//
// (`--feed=trump-approval-rating` works too and is equivalent to
// backfill-trump-approval-oracle.ts.)
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
    const spec = feedId ? getVoteHubFeedSpec(feedId) : undefined
    if (!spec)
      throw new Error(
        `pass --feed=<feedId>; known VoteHub feeds: ${ALL_VOTEHUB_FEED_SPECS.map(
          (s) => s.feedId
        ).join(', ')}`
      )

    // Stamp each day's point from its own calendar date rather than adding a
    // day to a running instant: dayjs.tz(...).add(1,'day') adds 24 UTC hours,
    // so a loop started in PST drifts to 1 AM once PDT begins, and every
    // summer stamp lands an hour off midnight — colliding with the correctly
    // stamped rows the live job writes.
    const series = readPublishedSeries(await fetchVoteHubAverage(spec), {
      answerKey: spec.answerKey,
    })
    const points = series.map((entry) => ({
      ts: dayjs.tz(entry.day, spec.tz).valueOf(),
      price: entry.price,
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
