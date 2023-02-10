import { initAdmin } from './script-init'
initAdmin()

import { log, logMemory } from 'shared/utils'
import { updateStatsCore } from '../update-stats'

async function updateStats() {
  logMemory()
  log('Updating stats...')
  await updateStatsCore()
}

if (require.main === module) {
  updateStats().then(() => process.exit())
}
