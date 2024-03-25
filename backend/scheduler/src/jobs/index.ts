import { createJob } from './helpers'
import { addTrendingFeedContracts } from './add-trending-feed-contracts'
import { updateContractMetricsCore } from 'shared/update-contract-metrics-core'
import { sendOnboardingNotificationsInternal } from 'shared/onboarding-helpers'
import { updateUserMetricsCore } from 'shared/update-user-metrics-core'
import { updateGroupMetricsCore } from 'shared/update-group-metrics-core'
import { cleanOldFeedRows } from './clean-old-feed-rows'
import { cleanOldTombstones } from './clean-old-tombstones'
import { cleanOldNotifications } from './clean-old-notifications'
import { truncateIncomingWrites } from './truncate-incoming-writes'
import { updateStatsCore } from './update-stats'
import { calculateConversionScore } from 'shared/conversion-score'
import { addConvertingContractsToFeed } from 'shared/add-converting-contracts-to-feed'

export function createJobs() {
  return [
    // Hourly jobs:
    createJob(
      'add-trending-feed-contracts',
      '0 10 * * * *', // on the 10th minute of every hour
      addTrendingFeedContracts
    ),
    createJob(
      'update-contract-metrics',
      '0 */13 * * * *', // every 13 minutes - (on the 5th minute of every hour)
      updateContractMetricsCore
    ),
    createJob(
      'update-stats',
      '0 20 * * * *', // on the 20th minute of every hour
      updateStatsCore
    ),
    createJob(
      'calculate-conversion-scores',
      '0 5 * * * *', // on the 5th minute of every hour
      calculateConversionScore
    ),
    createJob(
      'update-group-metrics',
      '0 */17 * * * *', // every 17 minutes - (on the 8th minute of every hour)
      updateGroupMetricsCore
    ),
    createJob(
      'add-converting-feed-contracts',
      '0 15 * * * *', // on the 15th minute of every hour
      addConvertingContractsToFeed
    ),
    createJob(
      'onboarding-notification',
      '0 0 11 * * *', // 11 AM daily
      sendOnboardingNotificationsInternal
    ),
    createJob(
      'update-user-metrics',
      '0 * * * * *', // every minute
      updateUserMetricsCore
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
