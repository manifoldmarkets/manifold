import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
dayjs.extend(utc)
dayjs.extend(timezone)

import { runScript } from './run-script'
import { log } from 'shared/utils'
import { materializeActivityDays } from '../scheduler/src/jobs/update-stats'

// Populates the daily activity rollup for a date range, one committed day at a
// time. Run this once over the buffer window before deploying the scheduler
// change, so the first nightly run has a full window to read and does not try
// to build 100+ cold days inside the morning batch train.
//
// Safe to interrupt and rerun: each day is its own transaction and rebuilding a
// day that already exists replaces it with the same values.
//
// Expect roughly 15–150s a day, serially: bot limit-order churn puts up to
// ~360k bet rows in a day since mid-September 2026, and cold pages dominate.
// 91 days is therefore an hour or two, not minutes. Run it outside the
// 10:00–15:00 UTC batch window.
//
//   yarn ts-node backend/scripts/backfill-daily-activity.ts 2026-07-04 2026-10-03
//
// The range is [start, end) — the end day is not built.
if (require.main === module)
  runScript(async ({ pg }) => {
    if (process.argv.length < 4) {
      log('Usage: backfill-daily-activity <start> <end>')
      process.exit(1)
    }

    const start = process.argv[2]
    const end = process.argv[3]

    if (!dateregex.test(start) || !dateregex.test(end)) {
      log.error('Invalid date format, should be YYYY-MM-DD')
      process.exit(1)
    }

    // Never build today or later. A partial day would be stored as if it were
    // complete, and a future day would be an all-zero row that gap-filling then
    // treats as computed. "Today" is the America/Los_Angeles day the rollup is
    // keyed on: the UTC date runs a day ahead from 5pm Pacific, which would let
    // an evening run build the Pacific day still in progress.
    const today = dayjs().tz('America/Los_Angeles').format('YYYY-MM-DD')
    const cappedEnd = end > today ? today : end
    if (cappedEnd !== end) {
      log(`Capping end at ${cappedEnd}: only complete days can be built`)
    }

    const days = listDays(start, cappedEnd)
    log(
      `Backfilling ${days.length} day(s) of activity: ${start} to ${cappedEnd}`
    )

    // No budget: this is run by hand in a quiet window, and stopping halfway
    // through a deliberate backfill would just mean running it again. A day
    // that fails (after its retry) is reported and skipped rather than ending
    // the run; rerunning over the same range rebuilds it.
    const failedDays: string[] = []
    for (let i = 0; i < days.length; i++) {
      const { failed } = await materializeActivityDays(
        pg,
        [days[i]],
        Number.MAX_SAFE_INTEGER
      )
      failedDays.push(...failed)
      if ((i + 1) % 10 === 0 || i === days.length - 1) {
        log(`  ${i + 1}/${days.length} days`)
      }
    }

    if (failedDays.length) {
      log.error(
        `Done, but ${failedDays.length} day(s) failed — rerun over them: ${failedDays.join(', ')}`
      )
      process.exit(1)
    }
    log('Done')
  })

const dateregex = /^\d{4}-\d{2}-\d{2}$/

const listDays = (start: string, end: string) => {
  const days: string[] = []
  for (
    let day = new Date(`${start}T00:00:00Z`);
    day.toISOString().slice(0, 10) < end;
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    days.push(day.toISOString().slice(0, 10))
  }
  return days
}
