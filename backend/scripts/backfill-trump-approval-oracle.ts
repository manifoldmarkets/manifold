import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
dayjs.extend(utc)
dayjs.extend(timezone)

import { readPublishedApprovalSeries } from 'common/perps/trump-approval'

import { log } from 'shared/utils'
import { TRUMP_APPROVAL_FEED_ID, insertOraclePrices } from 'shared/oracle'
import { fetchTrumpApprovalAverage } from 'shared/trump-approval'
import { runScript } from './run-script'

// Backfill `trump-approval-rating` from VoteHub's published, time-weighted
// approval average — the same series the daily job publishes, so a backfill
// and the live feed can never disagree about what the index means.
//
// ⚠️ NOT for a live feed. Points already published are immutable and may have
// been consumed by funding and liquidations; this writes history under
// whatever the methodology is TODAY, so running it against a feed with open
// positions rewrites the basis those positions were priced against. It exists
// for standing up a NEW feed, and `insertOraclePrices` is on-conflict-do-
// nothing, so existing rows are left alone even if it is run by accident.
if (require.main === module)
  runScript(async ({ pg }) => {
    // Stamp each day's point from its own calendar date rather than adding a
    // day to a running instant: dayjs.tz(...).add(1,'day') adds 24 UTC hours,
    // so a loop started in PST drifts to 1 AM once PDT begins, and every
    // summer stamp lands an hour off midnight — colliding with the correctly
    // stamped rows the daily job writes.
    const series = readPublishedApprovalSeries(
      await fetchTrumpApprovalAverage()
    )
    const points = series.map((entry) => ({
      ts: dayjs.tz(entry.day, 'America/Los_Angeles').valueOf(),
      price: entry.price,
    }))
    const fromDay = series[0]?.day ?? 'n/a'
    const toDay = series[series.length - 1]?.day ?? 'n/a'
    log(
      `read ${points.length} published daily averages from ${fromDay} to ${toDay}`
    )
    if (points.length > 0) {
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
    }
    await insertOraclePrices(pg, TRUMP_APPROVAL_FEED_ID, points)
    log(`backfilled ${points.length} ${TRUMP_APPROVAL_FEED_ID} oracle points`)
  })
