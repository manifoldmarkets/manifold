import { updatePerps } from '../scheduler/src/jobs/update-perps'
import { log } from 'shared/utils'
import { runScript } from './run-script'

// One-shot manual run of the hourly update-perps scheduler job: oracle
// updates for daily-feed perps, funding for every live perp, and stale-feed
// alerting. Companion to run-oracle-tick-loop.ts, which only covers the 15s
// fast tick — funding is NOT part of that loop, so use this to exercise it
// on dev when no perps-code scheduler is deployed. Safe to re-run: the
// engine's once-per-FUNDING_PERIOD_MS gate (under the advisory lock) makes
// a second run within the hour a funding no-op by design.
runScript(async () => {
  log('running update-perps once')
  await updatePerps()
  log('update-perps complete')
})
