import { runScript } from './run-script'
import { log } from 'shared/utils'
import { updateStatsCore } from '../scheduler/src/jobs/update-stats'

if (require.main === module) {
  runScript(async () => {
    log('Updating stats...')
    await updateStatsCore()
  })
}
