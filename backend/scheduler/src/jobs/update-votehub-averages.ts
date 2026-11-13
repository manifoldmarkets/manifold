import {
  publishVoteHubPoint,
  voteHubDay,
} from 'shared/perps/publish-votehub-average'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { VOTEHUB_FEED_SPECS, VoteHubFeedSpec } from 'shared/votehub-feeds'
import { reportDailyFeedFailure } from './daily-feed-failure'

// Publishes points for the VoteHub average feeds OTHER than Trump approval —
// JD Vance favorability (`vance-favorability`) today, the 2028 generic-ballot
// pair once VoteHub publishes that series, see VOTEHUB_FEED_SPECS. A spec
// whose registry entry is retired (the 2026 generic ballot, settled
// 2026-11-05) or awaiting its source is skipped silently before any request:
// see OracleFeedDef.lifecycle.
//
// Same cadence and same reasoning as update-trump-approval: every 5 minutes,
// which is VoteHub's own freshness bound (`Cache-Control: max-age=300` on the
// averages endpoint), publishing only when the value moves plus a 12h
// heartbeat. Scheduled two minutes off the Trump job so the two never fire
// against VoteHub at the same instant.
//
// Why a separate job rather than more specs in the Trump loop: the Trump job's
// name and its `[trump-approval]` log prefix are what the GCP alert policies
// match on, and both are required to stay byte-for-byte unchanged. These
// feeds alert under `[votehub]` instead; every WARN/ERROR line below carries
// the feed id after the prefix so one policy covers all of them.
//
// Each spec is published independently: a thrown fetch error or a refused
// point on one feed reports for that feed and moves on to the next. Failure
// reporting is the shared throttled-WARN / stale-ERROR rule in
// daily-feed-failure.ts.
export const updateVoteHubAverages = async () => {
  const pg = createSupabaseDirectClient()
  for (const spec of VOTEHUB_FEED_SPECS) await publishOne(pg, spec)
}

const publishOne = async (
  pg: ReturnType<typeof createSupabaseDirectClient>,
  spec: VoteHubFeedSpec
) => {
  const today = voteHubDay(spec)
  const report = (reason: string) =>
    reportDailyFeedFailure(pg, {
      feedId: spec.feedId,
      label: `${spec.logPrefix} ${spec.feedId}`,
      day: today,
      reason,
    })
  try {
    const result = await publishVoteHubPoint(pg, spec)
    // `unchanged` is the ordinary outcome and is deliberately silent, as in
    // the Trump job: the sources move about once a day. `inactive` is silent
    // too: a retired series, or one the provider has not started, has nothing
    // to publish and is not an incident.
    if (
      result.status === 'published' ||
      result.status === 'unchanged' ||
      result.status === 'inactive'
    )
      return
    await report(result.reason)
  } catch (err) {
    await report(`${err}`)
  }
}
