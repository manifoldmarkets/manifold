import { initAdmin } from './script-init'
initAdmin()

import { log } from 'shared/utils'
import { updateUserMetrics } from '../update-user-metrics'
import { updateContractMetrics } from '../update-contract-metrics'
import { updateGroupMetrics } from '../update-group-metrics'

async function updateMetrics() {
  log('Updating user metrics...')
  await updateUserMetrics()
  log('Updating contract metrics...')
  await updateContractMetrics()
  log('Updating group metrics...')
  await updateGroupMetrics()
}

if (require.main === module) {
  updateMetrics().then(() => process.exit())
}
