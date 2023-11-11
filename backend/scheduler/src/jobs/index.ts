import { createJob } from './helpers'
import { addTrendingFeedContracts } from './add-trending-feed-contracts'

export function createJobs() {
  return [
    createJob(
      'add-trending-feed-contracts',
      '0 */30 * * * *', // every 30 minutes
      addTrendingFeedContracts
    ),
  ]
}
