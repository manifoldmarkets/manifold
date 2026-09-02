import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
dayjs.extend(utc)
dayjs.extend(timezone)

import { log } from 'shared/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'

// Checks the OUTPUT of update-stats rather than whether the job threw.
//
// The distinction matters because a failed nightly run does not reliably page
// anyone. 'Query read timeout' — the error that killed this job every night
// from 2026-08-04 — is in the transient-error list in helpers.ts, so the first
// failure logs a warning and escalates to ERROR only on a second consecutive
// one, counted in a Map that lives in process memory. The scheduler container
// OOM-restarts most days, which resets that counter. A once-daily job can
// therefore fail indefinitely without ever reaching the alert policy, which is
// how the August outage ran for nine days before anyone noticed.
//
// Anything this finds is logged at ERROR, which is what the job-crash alert
// policy matches on, and is deliberately not thrown: throwing would route it
// back through the same damping that hid the original failure.
const GAP_WINDOW_DAYS = 30

export const checkStatsFreshness = async () => {
  const pg = createSupabaseDirectClient()
  const yesterday = dayjs()
    .tz('America/Los_Angeles')
    .subtract(1, 'day')
    .format('YYYY-MM-DD')

  const row = await pg.oneOrNone<{
    missing: string[] | null
  }>(
    `select array_remove(array[
      case when dau is null then 'dau' end,
      case when dav is null then 'dav' end,
      case when bet_count is null then 'bet_count' end,
      case when topic_daus is null then 'topic_daus' end
    ], null) as missing
    from daily_stats where start_date = $1::date`,
    [yesterday]
  )

  if (!row) {
    log.error(`[stats-freshness] no daily_stats row for ${yesterday}`)
  } else if (row.missing?.length) {
    log.error(
      `[stats-freshness] daily_stats for ${yesterday} is missing ${row.missing.join(
        ', '
      )}`
    )
  }

  const { gaps } = await pg.one<{ gaps: number }>(
    `with wanted as (
      select generate_series($1::date - $2::int, $1::date, interval '1 day')::date as day
    )
    select count(*)::int as gaps
    from wanted w
    left join daily_stats s on s.start_date = w.day
    where s.dau is null`,
    [yesterday, GAP_WINDOW_DAYS]
  )

  if (gaps > 0) {
    log.error(
      `[stats-freshness] ${gaps} of the last ${
        GAP_WINDOW_DAYS + 1
      } days have no dau`
    )
  } else if (row && !row.missing?.length) {
    log(`[stats-freshness] ok through ${yesterday}`)
  }
}
