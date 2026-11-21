import { HOUR_MS } from 'common/util/time'

import { SupabaseDirectClient } from 'shared/supabase/init'
import { log } from 'shared/utils'

// Failure reporting shared by the slow-feed publisher jobs (Trump approval,
// the other VoteHub averages, Fear & Greed). Each of those polls its source
// every few minutes and publishes on change, so a source outage produces one
// failed attempt per firing; this module decides which of those attempts is
// worth a log line and at what severity.
//
// Two rules, both keyed per feed:
//
//   1. Retryable failures are WARN and throttled to one an hour. At a
//      5-minute cadence an outage that used to produce one line an hour would
//      produce 288 a day. The feed's own staleness alerting is the durable
//      signal; these lines exist to say why, so one an hour is plenty.
//   2. Once the feed has gone long enough without a point that the next
//      retry is no longer the fix, every failure is an ERROR and none are
//      throttled: a feed that has gone stale is the one thing here worth
//      paging on every time it is observed.
//   3. A feed that has NEVER published is also an ERROR — a wrong source key
//      on a freshly deployed feed is a real fault — but throttled to one an
//      hour: nothing is marking against an ageing price yet, and the hourly
//      `[oracle-feeds]` staleness probe already covers it, so twelve pages
//      an hour would only bury the one that says why.
//
// State is in-memory, so a scheduler restart re-logs immediately — which is
// the behaviour you want.

/** Retryable failures are logged at most this often per feed. */
export const DAILY_FEED_FAILURE_LOG_INTERVAL_MS = HOUR_MS

/**
 * How long a feed may go without a published point before a failed attempt
 * is an ERROR rather than a retryable blip.
 *
 * Replaces the old "is this the last firing of the day?" test, which only
 * made sense when the Trump job published once daily. With publication on
 * change the question that matters is not what time it is, it is how long
 * the market has been marking against an ageing price. Set below every daily
 * feed's 26h staleAfterMs so the page arrives before the staleness alert,
 * not after it.
 */
export const DAILY_FEED_STALE_ERROR_MS = 20 * HOUR_MS

const lastFailureLog: Record<string, number> = {}

/** How long since the feed last got a point, or null if it never has. */
export const getAgeOfLatestPoint = async (
  pg: SupabaseDirectClient,
  feedId: string
): Promise<number | null> => {
  const row = await pg.oneOrNone<{ ts: string }>(
    `select ts from oracle_prices where feed_id = $1 order by ts desc limit 1`,
    [feedId]
  )
  if (!row) return null
  const ts = new Date(row.ts).getTime()
  return Number.isFinite(ts) ? Date.now() - ts : null
}

export const reportDailyFeedFailure = async (
  pg: SupabaseDirectClient,
  args: {
    feedId: string
    /**
     * Everything before "publish failed" — the bracketed alert prefix, plus
     * the feed id where one prefix covers several feeds (`[votehub]
     * vance-favorability`). GCP alert policies match on the prefix.
     */
    label: string
    day: string
    reason: string
    staleErrorMs?: number
    retryHint?: string
  }
) => {
  const {
    feedId,
    label,
    day,
    reason,
    staleErrorMs = DAILY_FEED_STALE_ERROR_MS,
    retryHint = 'retrying in 5 minutes',
  } = args
  const message = `${label} publish failed for ${day} — ${reason}`
  // Feed staleness is alerted on separately by update-perps and
  // update-oracle-feeds, so a retryable attempt stays at WARN to avoid paging
  // once an hour for one outage. Escalate only once the feed itself has gone
  // long enough without a point that the next retry is no longer the fix.
  const ageMs = await getAgeOfLatestPoint(pg, feedId)
  const neverPublished = ageMs == null
  const stale = neverPublished || ageMs >= staleErrorMs
  // Throttle, but never throttle away the escalation: a feed that has gone
  // stale is the one thing here worth paging on every time it is observed.
  // The never-published case is the exception (rule 3 above): it pages, but
  // once an hour.
  const now = Date.now()
  const throttled =
    now - (lastFailureLog[feedId] ?? 0) < DAILY_FEED_FAILURE_LOG_INTERVAL_MS
  if ((!stale || neverPublished) && throttled) return
  lastFailureLog[feedId] = now
  if (stale)
    log.error(
      `${message}; last point ${
        neverPublished ? 'never' : `${Math.round(ageMs / HOUR_MS)}h ago`
      }, feed is going stale`
    )
  else log.warn(`${message}; ${retryHint}`)
}
