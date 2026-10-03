// The publish-on-change rule shared by every slow ("daily"-cadence) oracle
// feed that is polled far more often than its source actually moves: the
// VoteHub averages (Trump approval, the 2026 generic ballot, Vance
// favorability) and the Alternative.me Crypto Fear & Greed index.
//
// It lives in `common` for the same reason the rest of the methodology does:
// it decides WHEN a new oracle point exists, which is part of what a market is
// priced against, and it should be one auditable rule rather than a copy per
// feed that drifts.
//
// The rule: publish the first reading, publish whenever the value moves, and
// otherwise re-stamp the unchanged value once a heartbeat has elapsed so a
// genuinely flat stretch cannot be mistaken for a dead feed. Every point is
// stamped at the instant the value was OBSERVED (Date.now() in the
// publisher), never at a day boundary — a live job that stamped at midnight
// would be backdating a reading into a window where funding and liquidations
// have already run.

/**
 * How long a published point may stand before we re-publish an unchanged
 * value purely to prove the feed is alive.
 *
 * Publishing only on change is what closes the intraday arbitrage window, but
 * on its own it would starve the feed during a flat stretch — VoteHub's
 * Trump average genuinely held 38.4 for three straight days in August 2026 —
 * and staleness alerting keys on ROW age. So a value that has not moved is
 * re-stamped twice a day, comfortably inside every daily feed's 26h
 * staleAfterMs and the markets' 30h maxOraclePriceAgeMs.
 */
export const DAILY_FEED_HEARTBEAT_MS = 12 * 60 * 60 * 1000

export type DailyFeedPublishDecision =
  | { publish: true; reason: 'first' | 'changed' | 'heartbeat' }
  | { publish: false; reason: string }

/**
 * Should this reading be written as a new oracle point?
 *
 * The original Trump rule published the first usable value of each Pacific
 * day and then stopped, which left every later move by the source sitting in
 * public view as the exact next day's mark — the same shape of timing edge
 * the feed was changed to remove, just relocated from the window to the
 * schedule. So the jobs run every few minutes and publish whenever the value
 * actually moves.
 *
 * Prices are compared exactly rather than within an epsilon: the sources
 * publish to one decimal (VoteHub) or to an integer (Fear & Greed), so any
 * real move is at least the source's own resolution, and rounding slack here
 * would silently swallow the smallest genuine moves.
 */
export const decideDailyFeedPublish = (args: {
  price: number
  last: { price: number; ts: number } | null
  now: number
  heartbeatMs?: number
}): DailyFeedPublishDecision => {
  const { price, last, now, heartbeatMs = DAILY_FEED_HEARTBEAT_MS } = args

  if (!Number.isFinite(price))
    return { publish: false, reason: `invalid price ${price}` }
  if (!Number.isFinite(now))
    return { publish: false, reason: `invalid now ${now}` }
  if (!Number.isFinite(heartbeatMs) || heartbeatMs <= 0)
    return { publish: false, reason: `invalid heartbeatMs ${heartbeatMs}` }
  if (!last) return { publish: true, reason: 'first' }
  if (!Number.isFinite(last.price) || !Number.isFinite(last.ts))
    return { publish: true, reason: 'first' }

  if (price !== last.price) return { publish: true, reason: 'changed' }
  if (now - last.ts >= heartbeatMs)
    return { publish: true, reason: 'heartbeat' }
  return {
    publish: false,
    reason: `unchanged at ${price} since ${new Date(last.ts).toISOString()}`,
  }
}
