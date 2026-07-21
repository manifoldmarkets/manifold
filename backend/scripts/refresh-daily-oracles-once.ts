import { updateEci } from '../scheduler/src/jobs/update-eci'
import { updateTrumpApproval } from '../scheduler/src/jobs/update-trump-approval'
import { log } from 'shared/utils'
import { runScript } from './run-script'

// Run the two daily oracle jobs once, out of schedule. Use on dev when no
// perps-code scheduler is deployed: the daily feeds go stale within a day or
// two, and update-perps (correctly) refuses to touch a market whose feed is
// older than its maxOraclePriceAgeMs — so refresh here first, then run
// run-update-perps-once.ts.
runScript(async () => {
  log('refreshing trump-approval feed...')
  await updateTrumpApproval()
  log('refreshing eci feed...')
  await updateEci()
  log('daily oracle refresh complete')
})
