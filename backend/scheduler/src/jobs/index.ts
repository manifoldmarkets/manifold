import { createJob } from './helpers'
import { addTrendingFeedContracts } from './add-trending-feed-contracts'
import { updateContractMetricsCore } from 'shared/update-contract-metrics-core'
import { sendOnboardingNotificationsInternal } from 'shared/onboarding-helpers'
import { updateContractViews } from 'shared/update-contract-views'
import { updateUserMetricsCore } from 'shared/update-user-metrics-core'
import { updateGroupMetricsCore } from 'shared/update-group-metrics-core'
import { cleanOldFeedRows } from './clean-old-feed-rows'
import { cleanOldTombstones } from './clean-old-tombstones'
import { cleanOldNotifications } from './clean-old-notifications'
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
      '0 * * * * *', // every minute
      updateUserMetricsCore
    ),
    createJob(
      'update-group-metrics',
      '0 */15 * * * *', // every 15 minutes
      updateGroupMetricsCore
    ),
    createJob(
      'truncate-incoming-writes',
      '0 0 0 * * *', // midnight daily
      truncateIncomingWrites
    ),
    createJob(
      'clean-old-tombstones',
      '0 0 0 * * *', // midnight daily
      cleanOldTombstones
    ),
    createJob(
      'clean-old-feed-rows',
      '0 0 1 * * *', // 1 AM daily
      cleanOldFeedRows
    ),
    createJob(
      'clean-old-notifications',
      '0 0 2 * * *', // 2 AM daily
      cleanOldNotifications
    ),
  ]
}
