import { CRYPTO_FEAR_GREED_FEED_ID } from 'shared/oracle'
import {
  fearGreedDay,
  publishFearGreedPoint,
} from 'shared/perps/publish-fear-greed'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { reportDailyFeedFailure } from './daily-feed-failure'

// Publishes points for the `crypto-fear-greed` feed from Alternative.me.
//
// Runs EVERY 5 MINUTES and publishes whenever the value moves, plus a 12h
// heartbeat — see decideDailyFeedPublish. The index itself steps once a day
// around 00:00 UTC, so almost every firing is a silent `unchanged`; the
// cadence exists to bound the window in which the new daily value is public
// on alternative.me but not yet the market's mark. That window is at most
// one poll, which is the whole latency exposure of this feed.
//
// Failure reporting is the shared throttled-WARN / stale-ERROR rule in
// daily-feed-failure.ts, under the `[fear-greed]` prefix the GCP alert
// policy matches on. A thrown fetch/parse error and a returned rejection
// are reported the same way; neither is logged inside the publisher.
export const updateFearGreed = async () => {
  const pg = createSupabaseDirectClient()
  const today = fearGreedDay()
  const report = (reason: string) =>
    reportDailyFeedFailure(pg, {
      feedId: CRYPTO_FEAR_GREED_FEED_ID,
      label: '[fear-greed]',
      day: today,
      reason,
    })

  try {
    const result = await publishFearGreedPoint(pg)
    if (result.status === 'published' || result.status === 'unchanged') return
    await report(result.reason)
  } catch (err) {
    await report(`${err}`)
  }
}
