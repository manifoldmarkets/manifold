import {
  fearGreedDay,
  publishFearGreedPoint,
} from 'shared/perps/publish-fear-greed'
import { log } from 'shared/utils'
import { runScript } from './run-script'

// Manually publish the current `crypto-fear-greed` reading, for when the
// scheduled job's retries have all failed and the feed is about to cross the
// market's maxOraclePriceAgeMs — which pauses the PERP engine, and with it
// liquidations and ADL.
//
//   npx ts-node publish-fear-greed-now.ts [--force]
//
// Runs exactly what the scheduled job runs: ONE point stamped at Date.now(),
// applied to live perps. Without --force it respects the same unchanged gate
// the job uses; pass --force during an incident to re-stamp the current value
// regardless. Never backfills: backfill-fear-greed-oracle is for feeds with
// no live market. Exits nonzero unless a point actually landed.
if (require.main === module)
  runScript(async ({ pg }) => {
    const force = process.argv.includes('--force')
    const today = fearGreedDay()
    const result = await publishFearGreedPoint(pg, { force })
    if (result.status !== 'published')
      throw new Error(
        `nothing published for ${today} (${result.status}): ${result.reason}`
      )
    log(
      `published ${result.price}${
        result.classification ? ` (${result.classification})` : ''
      } for ${today} at ${new Date(result.ts).toISOString()} (source ${new Date(
        result.sourceTs
      ).toISOString()})`
    )
  })
