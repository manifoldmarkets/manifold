import { publishTrumpApprovalPoint } from 'shared/perps/publish-trump-approval'
import { log } from 'shared/utils'
import { runScript } from './run-script'

// Manually publish today's `trump-approval-rating` point, for when the daily
// job's retries have all failed (e.g. a multi-hour VoteHub outage) and the
// feed is about to cross the market's maxOraclePriceAgeMs — which pauses the
// PERP engine, and with it liquidations and ADL.
//
// This runs exactly what the scheduled job runs: ONE point for today's
// trailing window, stamped at Date.now(), applied to live markets. Two
// consequences worth knowing before you run it:
//
//   - It APPLIES the point to live perps, so any liquidations and ADL that
//     the new price implies happen immediately, as they would on a normal
//     publication.
//   - It does NOT backfill missed days. A value is stamped when it became
//     available to the market and is never backdated into a window where
//     funding and liquidations have already run. Use
//     backfill-trump-approval-oracle only for a feed with no live market.
//
// Running it twice in a day appends a second observation rather than
// replacing the first; that is legal but changes the feed's daily cadence,
// so prefer letting the scheduled retries take over once upstream recovers.
if (require.main === module)
  runScript(async ({ pg }) => {
    const result = await publishTrumpApprovalPoint(pg)
    log(`publish-trump-approval-now: ${JSON.stringify(result)}`)
  })
