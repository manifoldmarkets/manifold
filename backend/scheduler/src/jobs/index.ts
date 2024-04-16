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
import { autoAwardBounty } from './auto-award-bounty'
import { resetPgStats } from 'replicator/jobs/reset-pg-stats'
import { MINUTE_MS } from 'common/util/time'
import { calculateUserTopicInterests } from 'shared/calculate-user-topic-interests'

export function createJobs() {
  return [
    // Hourly jobs:
    createJob(
      'add-trending-feed-contracts',
      '0 10 * * * *', // on the 10th minute of every hour
      addTrendingFeedContracts
    ),
    createJob(
      'update-contract-metrics-non-multi',
      '0 */19 * * * *', // every 19 minutes - (on the 16th minute of every hour)
      () => updateContractMetricsCore('non-multi'),
      30 * MINUTE_MS
    ),
    createJob(
      'update-contract-metrics-multi',
      '0 */21 * * * *', // every 21 minutes - (on the 3rd minute of every hour)
      () => updateContractMetricsCore('multi'),
      30 * MINUTE_MS
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
      'auto-award-bounty',
      '0 55 * * * *', // on the 55th minute of every hour
      autoAwardBounty
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
      'update-user-metrics',
      '0 * * * * *', // every minute
      updateUserMetricsCore,
      10 * MINUTE_MS // The caches take time to build
    ),
    // Daily jobs:
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
    createJob(
      'reset-pg-stats',
      '0 0 3 * * *', // 3 AM daily
      resetPgStats
    ),
    createJob(
      'calculate-user-topic-interests',
      '0 0 3 * * *', // 3 AM daily
      () => calculateUserTopicInterests()
    ),
    createJob(
      'onboarding-notification',
      '0 0 11 * * *', // 11 AM daily
      sendOnboardingNotificationsInternal
    ),
  ]
}
