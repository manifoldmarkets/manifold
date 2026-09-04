import {
  publishVoteHubPoint,
  voteHubDay,
} from 'shared/perps/publish-votehub-average'
import { log } from 'shared/utils'
import {
  ALL_VOTEHUB_FEED_SPECS,
  getVoteHubFeedSpec,
} from 'shared/votehub-feeds'
import { runScript } from './run-script'

// Manually publish today's point for a VoteHub average feed, for when the
// scheduled job's retries have all failed (e.g. a multi-hour VoteHub outage)
// and the feed is about to cross the market's maxOraclePriceAgeMs — which
// pauses the PERP engine, and with it liquidations and ADL.
//
//   npx ts-node publish-votehub-now.ts --feed=vance-favorability [--force]
//
// This runs exactly what the scheduled job runs: ONE point stamped at
// Date.now(), applied to live perps. So any liquidations and ADL the new
// price implies happen immediately, as they would on a normal publication.
//
// Without --force this respects the same gate the scheduled job uses, so it
// declines when VoteHub's value has not moved and the feed already carries a
// recent point — there is nothing to publish and saying so is more useful
// than appending a duplicate. Pass --force during an incident to stamp the
// current value regardless, which is the whole point of the escape hatch.
//
// It does NOT backfill missed days. A value is stamped when it became
// available to the market and is never backdated into a window where funding
// and liquidations have already run. backfill-votehub-oracle is for feeds
// with no live market.
//
// Exits nonzero unless a point was actually published — during an incident
// the one thing an operator must not be told is that the escape hatch worked
// when nothing landed.
if (require.main === module)
  runScript(async ({ pg }) => {
    const force = process.argv.includes('--force')
    const feedId = process.argv
      .find((arg) => arg.startsWith('--feed='))
      ?.slice('--feed='.length)
    const spec = feedId ? getVoteHubFeedSpec(feedId) : undefined
    if (!spec)
      throw new Error(
        `pass --feed=<feedId>; known VoteHub feeds: ${ALL_VOTEHUB_FEED_SPECS.map(
          (s) => s.feedId
        ).join(', ')}`
      )
    const today = voteHubDay(spec)

    const result = await publishVoteHubPoint(pg, spec, { force })
    if (result.status !== 'published')
      throw new Error(
        `nothing published for ${spec.feedId} on ${today} (${result.status}): ${result.reason}`
      )

    log(
      `published ${spec.feedId} ${result.price.toFixed(
        2
      )} for ${today} at ${new Date(result.ts).toISOString()} (as of ${
        result.asOfDay
      }, cross-check ${
        result.crossCheckGap == null
          ? 'unavailable'
          : `gap ${result.crossCheckGap.toFixed(2)}`
      })`
    )
  })
