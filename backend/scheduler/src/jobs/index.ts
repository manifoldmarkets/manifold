import { calculateUserTopicInterests } from 'shared/calculate-user-topic-interests'
import { checkPushNotificationReceipts } from 'shared/check-push-receipts'
import { calculateConversionScore } from 'shared/conversion-score'
import { downsamplePortfolioHistory } from 'shared/downsample-portfolio-history'
import { expireLimitOrders } from 'shared/expire-limit-orders'
import { calculateGroupImportanceScore } from 'shared/group-importance-score'
import { IMPORTANCE_MINUTE_INTERVAL } from 'shared/importance-score'
import { sendOnboardingNotificationsInternal } from 'shared/onboarding-helpers'
import { sendMarketMovementNotifications } from 'shared/send-market-movement-notifications'
import { sendUnseenMarketMovementNotifications } from 'shared/send-unseen-notifications'
import { updateContractMetricsCore } from 'shared/update-contract-metrics-core'
import {
  CREATOR_UPDATE_FREQUENCY,
  updateCreatorMetricsCore,
} from 'shared/update-creator-metrics-core'
import { updateUserMetricPeriods } from 'shared/update-user-metric-periods'
import { updateUserPortfolioHistoriesCore } from 'shared/update-user-portfolio-histories-core'
import { isProd } from 'shared/utils'
import { sendWeeklyMarketsEmails } from 'shared/weekly-markets-emails'
import { sendPortfolioUpdateEmailsToAllUsers } from 'shared/weekly-portfolio-emails'
import { applyPendingClarifications } from './apply-pending-clarifications'
import { autoAwardBounty } from './auto-award-bounty'
import { autoLeaguesCycle } from './auto-leagues-cycle'
import { cleanOldNotifications } from './clean-old-notifications'
import { denormalizeAnswers } from './denormalize-answers'
import { drizzleLiquidity } from './drizzle-liquidity'
import { createJob } from './helpers'
import { pollPollResolutions } from './poll-poll-resolutions'
import { processMembershipRenewals } from './process-membership-renewals'
import {
  refreshAchAccountAge,
  refreshAchComments,
  refreshAchCreatorContracts,
  refreshAchCreatorTraders,
  refreshAchLeagues,
  refreshAchPnl,
  refreshAchReferrals,
  refreshAchTxns,
  refreshAchVolume,
} from './refresh-achievement-mvs'
import { resetBettingStreaksInternal } from './reset-betting-streaks'
import { resetPgStats } from './reset-pg-stats'
import {
  resetDailyQuestStatsInternal,
  resetWeeklyQuestStatsInternal,
} from './reset-quests-stats'
import { resetWeeklyEmailsFlags } from './reset-weekly-emails-flags'
import { scoreContracts } from './score-contracts'
import { sendMarketCloseEmails } from './send-market-close-emails'
import { sendStreakExpirationNotification } from './streak-expiration-notice'
import { unbanUsers } from './unban-users'
import { updateLeague } from './update-league'
import { updateLeagueRanks } from './update-league-ranks'
import { updateStatsCore } from './update-stats'

export function createJobs() {
  return [
    createJob(
      'auto-leagues-cycle',
      '0 */10 * * * *', // every 10 minutes
      autoLeaguesCycle
    ),
    // Hourly jobs:
    createJob(
      'send-market-close-emails',
      '0 0 * * * *', // every hour
      sendMarketCloseEmails
    ),
    createJob(
      'update-contract-metrics',
      '0 */21 * * * *', // every 21 minutes - (on the 3rd minute of every hour)
      () => updateContractMetricsCore(false)
    ),
    createJob(
      'update-contract-metrics-full',
      '0 30 5 * * *', // every day at 5:30am
      () => updateContractMetricsCore(true)
    ),
    createJob(
      'update-creator-metrics',
      `0 */${CREATOR_UPDATE_FREQUENCY} * * * *`, // every 57 minutes - (on the 57th minute of every hour)
      updateCreatorMetricsCore
    ),
    createJob(
      'group-importance-score',
      '0 6 * * * *', // on the 6th minute of every hour
      () => calculateGroupImportanceScore()
    ),
    createJob(
      'update-league',
      '0 */15 * * * *', // every 15 minutes
      () => updateLeague()
    ),
    createJob(
      'check-push-receipts',
      '0 15 * * * *', // on the 15th minute of every hour
      checkPushNotificationReceipts
    ),
    createJob(
      'send-contract-movement-notifications',
      '0 12 * * * *', // on the 12th minute of every hour
      () => sendMarketMovementNotifications(false)
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
      'update-user-portfolio-histories',
      '30 * * * * *', // every minute
      () => updateUserPortfolioHistoriesCore()
    ),
    createJob(
      'drizzle-liquidity',
      '0 */7 * * * *', // every 7th minute
      drizzleLiquidity
    ),
    createJob(
      'expire-limit-orders',
      '0 */1 * * * *', // every minute
      expireLimitOrders
    ),
    createJob(
      'unban-users',
      '0 0 * * * *', // every hour
      unbanUsers
    ),
    createJob(
      'score-contracts',
      `0 */${isProd() ? IMPORTANCE_MINUTE_INTERVAL : 60} * * * *`, // every 2 minutes
      scoreContracts
    ),
    createJob(
      'denormalize-answers',
      '0 * * * * *', // every minute
      denormalizeAnswers
    ),
    createJob(
      'poll-poll-resolutions',
      '0 */1 * * * *', // every minute
      pollPollResolutions
    ),
    createJob(
      'apply-pending-clarifications',
      '0 */5 * * * *', // every 5 minutes
      applyPendingClarifications
    ),
    // Daily jobs:
    createJob(
      'process-membership-renewals',
      '0 0 8 * * *', // 8 AM UTC daily (midnight PT)
      processMembershipRenewals
    ),
    createJob(
      'send-unseen-notifications',
      '0 0 13 * * *', // 1 PM daily
      sendUnseenMarketMovementNotifications
    ),
    createJob(
      'clean-old-notifications',
      '0 30 2 * * *', // 230 AM daily
      cleanOldNotifications
    ),
    // // Achievement MV refreshes (nightly, staggered ~10 mins apart)
    // createJob(
    //   'update-ach-trades',
    //   '0 10 2 * * *', // 2:10 AM daily
    //   updateAchTrades
    // ),
    createJob(
      'refresh-ach-volume',
      '0 30 2 * * *', // 2:30 AM
      refreshAchVolume
    ),
    createJob(
      'refresh-ach-comments',
      '0 40 2 * * *', // 2:40 AM
      refreshAchComments
    ),
    createJob(
      'refresh-ach-creator-contracts',
      '0 50 2 * * *', // 2:50 AM
      refreshAchCreatorContracts
    ),
    createJob(
      'refresh-ach-referrals',
      '0 0 3 * * *', // 3:00 AM
      refreshAchReferrals
    ),
    createJob(
      'refresh-ach-creator-traders',
      '0 10 3 * * *', // 3:10 AM
      refreshAchCreatorTraders
    ),
    createJob(
      'refresh-ach-leagues',
      '0 20 3 * * *', // 3:20 AM
      refreshAchLeagues
    ),
    createJob(
      'refresh-ach-pnl',
      '0 30 3 * * *', // 3:30 AM
      refreshAchPnl
    ),
    createJob(
      'refresh-ach-txns',
      '0 40 3 * * *', // 3:40 AM
      refreshAchTxns
    ),
    createJob(
      'refresh-ach-account-age',
      '0 50 3 * * *', // 3:50 AM
      refreshAchAccountAge
    ),
    createJob(
      'update-user-metric-periods',
      '0 0 2 * * *', // 2 AM daily
      async () => {
        await updateUserMetricPeriods()
      }
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
      'update-stats',
      '0 20 4 * * *', // on 4:20am daily
      () => updateStatsCore(7)
    ),
    createJob(
      'onboarding-notification',
      '0 0 11 * * *', // 11 AM daily
      sendOnboardingNotificationsInternal
    ),
    createJob(
      'weekly-portfolio-emails',
      '0 * 12-14 * * 5', // every Friday from 12pm to 2pm
      sendPortfolioUpdateEmailsToAllUsers
    ),
    createJob(
      'weekly-markets-emails',
      '0 */2 10-17 * * 1', // every Monday
      sendWeeklyMarketsEmails
    ),
    createJob(
      'reset-weekly-email-flags',
      '0 0 0 * * 6', // every Saturday at midnight
      resetWeeklyEmailsFlags
    ),
    createJob(
      'send-streak-notifications',
      '0 30 18 * * *', // 6:30pm PST daily ( 9:30pm EST )
      sendStreakExpirationNotification
    ),
    createJob(
      'update-league-ranks',
      '0 0 0 * * *', // every day at midnight
      () => updateLeagueRanks()
    ),
    createJob(
      'reset-betting-streaks',
      '0 0 0 * * *', // every day at midnight
      resetBettingStreaksInternal
    ),
    createJob(
      'reset-quests-stats',
      '0 0 0 * * *', // every day at midnight
      resetDailyQuestStatsInternal
    ),
    createJob(
      'reset-weekly-quests-stats',
      '0 0 0 * * 1', // every Monday at midnight
      resetWeeklyQuestStatsInternal
    ),
    createJob(
      'downsample-portfolio-history',
      '0 50 4 * * *', // every day at 4:50am
      downsamplePortfolioHistory
    ),
  ]
}
