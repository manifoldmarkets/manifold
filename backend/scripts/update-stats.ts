import { runScript } from './run-script'
import { log } from 'shared/utils'
import { updateStatsCore } from 'functions/scheduled/update-stats'

if (require.main === module) {
  runScript(async () => {
    log('Updating stats...')
    await updateStatsCore()
  })
}
