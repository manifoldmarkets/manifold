import { updateOpenRouterShare } from '../scheduler/src/jobs/update-openrouter-share'
import { updateTrumpApproval } from '../scheduler/src/jobs/update-trump-approval'
import { log } from 'shared/utils'
import { runScript } from './run-script'

// Run the launch set's independently scheduled oracle jobs once, out of
// schedule. ECI is intentionally absent: it is a retained history/runtime
// feed, not a launch market. Use on dev when no perps-code scheduler is
// deployed, then run run-update-perps-once.ts.
runScript(async () => {
  log('refreshing trump-approval feed...')
  await updateTrumpApproval()
  log('refreshing OpenRouter open-weight feed...')
  await updateOpenRouterShare()
  log('scheduled launch oracle refresh complete')
})
