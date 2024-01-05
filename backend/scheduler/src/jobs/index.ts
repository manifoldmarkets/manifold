import { createJob } from './helpers'
import { addTrendingFeedContracts } from './add-trending-feed-contracts'
import { updateContractMetricsCore } from 'shared/update-contract-metrics-core'
import { sendOnboardingNotificationsInternal } from 'shared/onboarding-helpers'
import { updateContractViews } from 'shared/update-contract-views'
import { updateUserMetricsCore } from 'shared/update-user-metrics-core'
import { truncateIncomingWrites } from './truncate-incoming-writes'

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
    createJob(
      'onboarding-notification',
      '0 0 11 * * *',
      sendOnboardingNotificationsInternal
    ),
    createJob('update-contract-views', '0 0 * * * *', updateContractViews),
    createJob(
      'update-user-metrics',
      '0 */10 * * * *', // every 10 minutes
      updateUserMetricsCore
    ),
    createJob(
      'truncate-incoming-writes',
      '0 0 4 * * *', // 4 AM daily
      truncateIncomingWrites
    ),
  ]
}
