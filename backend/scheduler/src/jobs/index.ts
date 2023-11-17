import { createJob } from './helpers'
import { addTrendingFeedContracts } from './add-trending-feed-contracts'

export function createJobs() {
  return [
    createJob(
      'add-trending-feed-contracts',
      '0 0 * * * *', // every hour
      addTrendingFeedContracts
    ),
  ]
}
