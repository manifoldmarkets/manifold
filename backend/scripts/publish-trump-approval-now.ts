import {
  hasTrumpApprovalPointForDay,
  publishTrumpApprovalPoint,
  trumpApprovalDay,
} from 'shared/perps/publish-trump-approval'
import { log } from 'shared/utils'
import { runScript } from './run-script'

// Manually publish today's `trump-approval-rating` point, for when the daily
// job's retries have all failed (e.g. a multi-hour VoteHub outage) and the
// feed is about to cross the market's maxOraclePriceAgeMs — which pauses the
// PERP engine, and with it liquidations and ADL.
//
// This runs exactly what the scheduled job runs: ONE point for today's
// trailing window, stamped at Date.now(), applied to live perps. So any
// liquidations and ADL the new price implies happen immediately, as they
// would on a normal publication.
//
// Refuses to run when the Pacific day already has a point, because the
// scheduled job is hourly: without the guard, an operator running this while
// the cron fires appends two points for one day and breaks the daily cadence
// that the market's funding period is anchored to. Pass --force to append a
// correction deliberately.
//
// It does NOT backfill missed days. A value is stamped when it became
// available to the market and is never backdated into a window where funding
// and liquidations have already run. backfill-trump-approval-oracle is for
// feeds with no live market: it stamps every day at midnight PT while the
// job stamps at publication time, so on a live feed it adds a second point
// to every day rather than filling a hole.
//
// Exits nonzero unless a point was actually published — during an incident
// the one thing an operator must not be told is that the escape hatch worked
// when nothing landed.
if (require.main === module)
  runScript(async ({ pg }) => {
    const force = process.argv.includes('--force')
    const today = trumpApprovalDay()

    if (!force && (await hasTrumpApprovalPointForDay(pg, today)))
      throw new Error(
        `${today} already has a published point; pass --force to append another`
      )

    const result = await publishTrumpApprovalPoint(pg)
    if (result.status !== 'published')
      throw new Error(
        `nothing published for ${today} (${result.status}): ${result.reason}`
      )

    log(
      `published ${result.price.toFixed(2)} for ${today} at ${new Date(
        result.ts
      ).toISOString()}`
    )
  })
