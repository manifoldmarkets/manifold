import { runScript } from './run-script'

import { log } from 'shared/utils'
import { updateUserMetricsCore } from 'shared/update-user-metrics-core'
import { updateGroupMetricsCore } from 'functions/scheduled/update-group-metrics'
import { updateContractMetricsCore } from 'shared/update-contract-metrics-core'

if (require.main === module) {
  runScript(async () => {
    log('Updating user metrics...')
    await updateUserMetricsCore()
    log('Updating contract metrics...')
    await updateContractMetricsCore()
    log('Updating group metrics...')
    await updateGroupMetricsCore()
  })
}
