import { TRUMP_APPROVAL_FEED_ID } from 'shared/oracle'
import {
  publishTrumpApprovalPoint,
  trumpApprovalDay,
} from 'shared/perps/publish-trump-approval'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  DAILY_FEED_STALE_ERROR_MS,
  reportDailyFeedFailure,
} from './daily-feed-failure'

/**
 * How long the feed may go without a published point before a failed attempt
 * is an ERROR rather than a retryable blip. The rationale and the number are
 * DAILY_FEED_STALE_ERROR_MS; this name is kept for the feed's own docs.
 */
export const TRUMP_APPROVAL_STALE_ERROR_MS = DAILY_FEED_STALE_ERROR_MS

// Publishes points for the `trump-approval-rating` feed from VoteHub's
// published average.
//
// Runs EVERY 5 MINUTES and publishes whenever the source value moves — see
// decideDailyFeedPublish. Publishing once a day, as this job did originally,
// left every intraday move by the source sitting in public view as the exact
// next morning's mark: the same timing edge the feed was rebuilt to remove,
// relocated from the averaging window to the publication schedule. Hourly
// shortened that window without closing it.
//
// 5 minutes is VoteHub's own bound, not a guess: their averages endpoint
// serves `Cache-Control: max-age=300`. Polling faster returns cached bytes
// rather than a fresher number, and it is the same cache any other observer
// reads through.
//
// The hourly cadence originally existed only as a retry: on 2026-08-14 a
// single 5:30am HTTP 500 froze the feed for over 26 hours, tripped its
// staleness alerts, and came within ~1.5h of the market's
// maxOraclePriceAgeMs, which pauses the engine and with it liquidations and
// ADL. That retry behaviour is preserved — a failed hour is simply followed
// by another hour — it is just no longer the only reason to run.
//
// The other VoteHub averages (generic ballot, Vance favorability) run in
// their own job, update-votehub-averages, offset by two minutes from this
// one. This job keeps its name and its `[trump-approval]` prefix because the
// GCP alert policies are keyed on both.
export const updateTrumpApproval = async () => {
  const pg = createSupabaseDirectClient()
  const today = trumpApprovalDay()

  try {
    const result = await publishTrumpApprovalPoint(pg)
    // `unchanged` is the ordinary outcome most hours and is deliberately
    // silent: the source moves roughly once every couple of days, so logging
    // every no-op would bury the hours that matter.
    if (result.status === 'published' || result.status === 'unchanged') return
    await reportFailure(pg, today, result.reason)
  } catch (err) {
    await reportFailure(pg, today, `${err}`)
  }
}

const reportFailure = (
  pg: ReturnType<typeof createSupabaseDirectClient>,
  day: string,
  reason: string
) =>
  reportDailyFeedFailure(pg, {
    feedId: TRUMP_APPROVAL_FEED_ID,
    label: '[trump-approval]',
    day,
    reason,
    staleErrorMs: TRUMP_APPROVAL_STALE_ERROR_MS,
  })
