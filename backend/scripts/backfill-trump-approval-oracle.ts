import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
dayjs.extend(utc)
dayjs.extend(timezone)

import { log } from 'shared/utils'
import { TRUMP_APPROVAL_FEED_ID, upsertOraclePrices } from 'shared/oracle'
import {
  computeRollingAverages,
  fetchTrumpApprovalPolls,
  TRUMP_APPROVAL_WINDOW_DAYS,
  TRUMP_INAUGURATION_DATE,
} from 'shared/trump-approval'
import { runScript } from './run-script'

// Backfill `trump-approval-rating` oracle feed from the VoteHub API.
// Strategy:
//   1. Fetch every poll since inauguration (Jan 21, 2025) — the first day
//      Trump's approval as president is defined.
//   2. For each day from (inauguration + windowDays - 1) through today,
//      compute the unweighted 14-day trailing mean of Approve pct.
//   3. Upsert as one oracle_prices row per day (idempotent on (feed_id, ts)).
if (require.main === module)
  runScript(async ({ pg }) => {
    const polls = await fetchTrumpApprovalPolls(TRUMP_INAUGURATION_DATE)

    // First day with a full trailing window available.
    const fromDay = dayjs
      .tz(TRUMP_INAUGURATION_DATE, 'America/Los_Angeles')
      .add(TRUMP_APPROVAL_WINDOW_DAYS - 1, 'day')
      .format('YYYY-MM-DD')
    const toDay = dayjs
      .tz(dayjs(), 'America/Los_Angeles')
      .format('YYYY-MM-DD')

    const points = computeRollingAverages(polls, fromDay, toDay)
    log(
      `computed ${points.length} daily rolling averages from ${fromDay} to ${toDay}`
    )
    if (points.length > 0) {
      log(
        `first point: ${new Date(points[0].ts).toISOString()} = ${points[0].price.toFixed(2)}`
      )
      log(
        `last point: ${new Date(points[points.length - 1].ts).toISOString()} = ${points[points.length - 1].price.toFixed(2)}`
      )
    }
    await upsertOraclePrices(pg, TRUMP_APPROVAL_FEED_ID, points)
    log(`backfilled ${points.length} ${TRUMP_APPROVAL_FEED_ID} oracle points`)
  })
