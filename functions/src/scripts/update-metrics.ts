import { initAdmin } from './script-init'
initAdmin()

import { log, logMemory } from '../utils'
import { updateContractMetricsCore } from '../update-contract-metrics'
import { updateUserMetricsCore } from '../update-user-metrics'

async function updateMetrics() {
  logMemory()
  log('Updating contract metrics...')
  await updateContractMetricsCore()
  log('Updating user metrics...')
  await updateUserMetricsCore()
}

if (require.main === module) {
  updateMetrics().then(() => process.exit())
}
