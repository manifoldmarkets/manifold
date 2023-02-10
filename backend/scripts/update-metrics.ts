import { initAdmin } from 'shared/init-admin'
initAdmin()

import { log } from 'shared/utils'
import { updateUserMetrics } from 'functions/update-user-metrics'
import { updateContractMetrics } from 'functions/update-contract-metrics'
import { updateGroupMetrics } from 'functions/update-group-metrics'

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
