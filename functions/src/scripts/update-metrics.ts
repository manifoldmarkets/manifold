import { initAdmin } from './script-init'
initAdmin()

import { updateContractMetricsCore } from '../update-contract-metrics'
import { updateUserMetricsCore } from '../update-user-metrics'

async function updateMetrics() {
  console.log('Updating contract metrics...')
  await updateContractMetricsCore()
  console.log('Updating user metrics...')
  await updateUserMetricsCore()
}

if (require.main === module) {
  updateMetrics().then(() => process.exit())
}
