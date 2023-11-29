import { createJob } from './helpers'
import { addTrendingFeedContracts } from './add-trending-feed-contracts'
import { updateContractMetricsCore } from 'shared/update-contract-metrics-core'

export function createJobs() {
  return [
    createJob(
      'add-trending-feed-contracts',
      '0 0 * * * *', // every hour
      addTrendingFeedContracts
    ),
    createJob(
      'update-contract-metrics',
      '0 */15 * * * *', // every 15 minutes
      updateContractMetricsCore
    ),
  ]
}
