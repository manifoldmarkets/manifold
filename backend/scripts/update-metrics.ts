import { initAdmin } from 'shared/init-admin'
initAdmin()

import { log } from 'shared/utils'
import { updateUserMetricsCore } from 'functions/scheduled/update-user-metrics'
import { updateContractMetricsCore } from 'functions/scheduled/update-contract-metrics'
import { updateGroupMetricsCore } from 'functions/scheduled/update-group-metrics'

async function updateMetrics() {
  log('Updating user metrics...')
  await updateUserMetricsCore()
  log('Updating contract metrics...')
  await updateContractMetricsCore()
  log('Updating group metrics...')
  await updateGroupMetricsCore()
}

if (require.main === module) {
  updateMetrics().then(() => process.exit())
}
