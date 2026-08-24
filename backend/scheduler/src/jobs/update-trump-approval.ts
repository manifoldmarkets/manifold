import { HOUR_MS } from 'common/util/time'

import { TRUMP_APPROVAL_FEED_ID } from 'shared/oracle'
import {
  publishTrumpApprovalPoint,
  trumpApprovalDay,
} from 'shared/perps/publish-trump-approval'
import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { log } from 'shared/utils'

/**
 * Failures are logged at most this often.
 *
 * At a 5-minute cadence an outage that used to produce one line an hour would
 * produce 288 a day. The feed's own staleness alerting is the durable signal;
 * these lines exist to say why, so one an hour is plenty. In-memory, so a
 * scheduler restart re-logs immediately — which is the behaviour you want.
 */
const FAILURE_LOG_INTERVAL_MS = HOUR_MS
let lastFailureLog = 0

/**
 * How long the feed may go without a published point before a failed attempt
 * is an ERROR rather than a retryable blip.
 *
 * Replaces the old "is this the last firing of the day?" test, which only
 * made sense when the job published once daily. With hourly publication the
 * question that matters is not what time it is, it is how long the market has
 * been marking against an ageing price. Set below the feed's 26h staleAfterMs
 * so the page arrives before the staleness alert, not after it.
 */
export const TRUMP_APPROVAL_STALE_ERROR_MS = 20 * HOUR_MS

// Publishes points for the `trump-approval-rating` feed from VoteHub's
// published average.
//
// Runs EVERY 5 MINUTES and publishes whenever the source value moves — see
// decideApprovalPublish. Publishing once a day, as this job did originally,
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

/** How long since the feed last got a point, or null if it never has. */
const getAgeOfLatestPoint = async (
  pg: SupabaseDirectClient
): Promise<number | null> => {
  const row = await pg.oneOrNone<{ ts: string }>(
    `select ts from oracle_prices where feed_id = $1 order by ts desc limit 1`,
    [TRUMP_APPROVAL_FEED_ID]
  )
  if (!row) return null
  const ts = new Date(row.ts).getTime()
  return Number.isFinite(ts) ? Date.now() - ts : null
}

const reportFailure = async (
  pg: SupabaseDirectClient,
  day: string,
  reason: string
) => {
  const message = `[trump-approval] publish failed for ${day} — ${reason}`
  // Feed staleness is alerted on separately by update-perps and
  // update-oracle-feeds, so a retryable attempt stays at WARN to avoid paging
  // once an hour for one outage. Escalate only once the feed itself has gone
  // long enough without a point that the next retry is no longer the fix.
  const ageMs = await getAgeOfLatestPoint(pg)
  const stale = ageMs == null || ageMs >= TRUMP_APPROVAL_STALE_ERROR_MS
  // Throttle, but never throttle away the escalation: a feed that has gone
  // stale is the one thing here worth paging on every time it is observed.
  if (!stale && Date.now() - lastFailureLog < FAILURE_LOG_INTERVAL_MS) return
  lastFailureLog = Date.now()
  if (stale)
    log.error(
      `${message}; last point ${
        ageMs == null ? 'never' : `${Math.round(ageMs / HOUR_MS)}h ago`
      }, feed is going stale`
    )
  else log.warn(`${message}; retrying in 5 minutes`)
}
