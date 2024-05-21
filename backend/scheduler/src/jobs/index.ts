import { createJob } from './helpers'
import { updateContractMetricsCore } from 'shared/update-contract-metrics-core'
import { sendOnboardingNotificationsInternal } from 'shared/onboarding-helpers'
import { updateUserMetricsCore } from 'shared/update-user-metrics-core'
import { updateGroupMetricsCore } from 'shared/update-group-metrics-core'
import { cleanOldTombstones } from './clean-old-tombstones'
import { cleanOldNotifications } from './clean-old-notifications'
import { truncateIncomingWrites } from './truncate-incoming-writes'
import { updateStatsCore } from './update-stats'
import { calculateConversionScore } from 'shared/conversion-score'
import { autoAwardBounty } from './auto-award-bounty'
import { resetPgStats } from 'replicator/jobs/reset-pg-stats'
import { MINUTE_MS } from 'common/util/time'
import { calculateUserTopicInterests } from 'shared/calculate-user-topic-interests'
import {
  CREATOR_UPDATE_FREQUENCY,
  updateCreatorMetricsCore,
} from 'shared/update-creator-metrics-core'
import { sendPortfolioUpdateEmailsToAllUsers } from 'shared/weekly-portfolio-emails'
import { sendWeeklyMarketsEmails } from 'shared/weekly-markets-emails'
import { resetWeeklyEmailsFlags } from 'replicator/jobs/reset-weekly-emails-flags'
import { calculateGroupImportanceScore } from 'shared/group-importance-score'
import { checkPushNotificationReceipts } from 'shared/check-push-receipts'
import { sendStreakExpirationNotification } from 'replicator/jobs/streak-expiration-notice'

export function createJobs() {
  return [
    // Hourly jobs:
    createJob(
      'update-contract-metrics-multi',
      '0 */21 * * * *', // every 21 minutes - (on the 3rd minute of every hour)
      () => updateContractMetricsCore('multi'),
      30 * MINUTE_MS
    ),
    createJob(
      'update-creator-metrics',
      `0 */${CREATOR_UPDATE_FREQUENCY} * * * *`, // every 13 minutes - (on the 5th minute of every hour)
      updateCreatorMetricsCore
    ),
    createJob(
      'group-importance-score',
      '0 6 * * * *', // on the 6th minute of every hour
      () => calculateGroupImportanceScore()
    ),
    createJob(
      'update-group-metrics',
      '0 */17 * * * *', // every 17 minutes - (on the 8th minute of every hour)
      updateGroupMetricsCore
    ),
    createJob(
      'check-push-receipts',
      '0 15 * * * *', // on the 15th minute of every hour
      checkPushNotificationReceipts
    ),
    createJob(
      'update-contract-metrics-non-multi',
      '0 */19 * * * *', // every 19 minutes - (on the 16th minute of every hour)
      () => updateContractMetricsCore('non-multi'),
      30 * MINUTE_MS
    ),
    createJob(
      'update-stats',
      '0 20 * * * *', // on the 20th minute of every hour
      updateStatsCore
    ),
    createJob(
      'calculate-conversion-scores',
      '0 46 * * * *', // on the 46th minute of every hour
      calculateConversionScore
    ),
    createJob(
      'auto-award-bounty',
      '0 55 * * * *', // on the 55th minute of every hour
      autoAwardBounty
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
      '0 0 2 * * *', // 2am daily
      truncateIncomingWrites
    ),
    createJob(
      'clean-old-tombstones',
      '0 0 2 * * *', // 2am daily
      cleanOldTombstones
    ),
    createJob(
      'clean-old-notifications',
      '0 30 2 * * *', // 230 AM daily
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
    createJob(
      'weekly-portfolio-emails',
      '0 * 12-14 * * 5',
      sendPortfolioUpdateEmailsToAllUsers
    ),
    createJob(
      'weekly-markets-emails',
      '0 */3 11-17 * * 1',
      sendWeeklyMarketsEmails
    ),
    createJob(
      'reset-weekly-email-flags',
      '0 0 0 * * 6',
      resetWeeklyEmailsFlags
    ),
    createJob(
      'send-streak-notifications',
      '0 30 18 * * *', // 6:30pm PST daily ( 9:30pm EST )
      sendStreakExpirationNotification
    ),
  ]
}
