import * as dayjs from 'dayjs'
import * as timezone from 'dayjs/plugin/timezone'
import * as utc from 'dayjs/plugin/utc'
dayjs.extend(utc)
dayjs.extend(timezone)

import {
  hasTrumpApprovalPointForDay,
  publishTrumpApprovalPoint,
  trumpApprovalDay,
  TRUMP_APPROVAL_TZ,
} from 'shared/perps/publish-trump-approval'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'

// The last Pacific hour the job is scheduled to fire. MUST match the end of
// the hour range in this job's cron expression in ./index.ts — it is how a
// run knows whether another attempt is coming today, which decides whether a
// failure is a blip to retry or a lost day worth paging on.
export const TRUMP_APPROVAL_LAST_ATTEMPT_HOUR = 23

// Publishes one point per Pacific day for the `trump-approval-rating` feed.
//
// Scheduled hourly rather than once, because a single daily firing made the
// feed only as reliable as VoteHub's worst minute of the day: on 2026-08-14
// the 5:30am attempt got an HTTP 500, and with no retry the feed sat frozen
// for over 26 hours, tripped its staleness alerts, and came within ~1.5h of
// the market's maxOraclePriceAgeMs — which pauses the engine, and with it
// liquidations and ADL, on a market carrying leveraged positions.
//
// The first attempt is still 5:30am Pacific, so the normal publication time
// is unchanged; later firings only do work when the day has no point yet.
export const updateTrumpApproval = async () => {
  const pg = createSupabaseDirectClient()
  const today = trumpApprovalDay()

  if (await hasTrumpApprovalPointForDay(pg, today)) return

  try {
    await publishTrumpApprovalPoint(pg)
  } catch (err) {
    // Feed staleness is already alerted on by update-perps and
    // update-oracle-feeds, so a retryable attempt logs at WARN to keep from
    // paging once an hour for the same outage. The final attempt of the day
    // is the one that means the day is lost, so that one is an ERROR.
    const hour = dayjs.tz(dayjs(), TRUMP_APPROVAL_TZ).hour()
    const lastAttempt = hour >= TRUMP_APPROVAL_LAST_ATTEMPT_HOUR
    const message = `[trump-approval] publish failed for ${today} — ${err}`
    if (lastAttempt)
      log.error(`${message}; no attempts left today, feed will go stale`)
    else log.warn(`${message}; retrying next hour`)
  }
}
