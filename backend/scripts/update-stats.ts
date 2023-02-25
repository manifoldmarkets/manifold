import { initAdmin } from 'shared/init-admin'
initAdmin()

import { log, logMemory } from 'shared/utils'
import { updateStatsCore } from 'functions/scheduled/update-stats'

async function updateStats() {
  logMemory()
  log('Updating stats...')
  await updateStatsCore()
}

if (require.main === module) {
  updateStats().then(() => process.exit())
}
