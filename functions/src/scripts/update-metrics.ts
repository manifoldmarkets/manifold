import { initAdmin } from './script-init'
initAdmin()

import { log, logMemory } from '../utils'
import { updateMetricsCore } from '../update-metrics'

async function updateMetrics() {
  logMemory()
  log('Updating metrics...')
  await updateMetricsCore()
}

if (require.main === module) {
  updateMetrics().then(() => process.exit())
}
