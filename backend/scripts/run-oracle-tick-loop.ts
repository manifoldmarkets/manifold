import { updateOracleFeeds } from '../scheduler/src/jobs/update-oracle-feeds'
import { log } from 'shared/utils'
import { runScript } from './run-script'

// Local stand-in for the deployed scheduler's 15s update-oracle-feeds job.
// Use while QA-testing perps on dev without a perps-code scheduler deployed:
// fetches fast feeds, writes oracle_prices, and runs liquidation/ADL for
// live perps on those feeds. Ctrl+C to stop (markets freeze once their
// feeds pass maxOraclePriceAgeMs — that's the freshness gate, not a bug).
const TICK_MS = 15_000

runScript(async () => {
  log('oracle tick loop starting (15s cadence). Ctrl+C to stop.')
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const start = Date.now()
    try {
      await updateOracleFeeds()
    } catch (err) {
      log.error('tick failed (continuing):', { err })
    }
    const elapsed = Date.now() - start
    await new Promise((r) => setTimeout(r, Math.max(0, TICK_MS - elapsed)))
  }
})
