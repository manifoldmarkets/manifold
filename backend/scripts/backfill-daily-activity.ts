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
//   yarn ts-node backend/scripts/backfill-daily-activity.ts 2026-04-20 2026-08-16
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
    // treats as computed.
    const today = new Date().toISOString().slice(0, 10)
    const cappedEnd = end > today ? today : end
    if (cappedEnd !== end) {
      log(`Capping end at ${cappedEnd}: only complete days can be built`)
    }

    const days = listDays(start, cappedEnd)
    log(
      `Backfilling ${days.length} day(s) of activity: ${start} to ${cappedEnd}`
    )

    // No budget: this is run by hand in a quiet window, and stopping halfway
    // through a deliberate backfill would just mean running it again.
    for (let i = 0; i < days.length; i++) {
      await materializeActivityDays(pg, [days[i]], Number.MAX_SAFE_INTEGER)
      if ((i + 1) % 10 === 0 || i === days.length - 1) {
        log(`  ${i + 1}/${days.length} days`)
      }
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
