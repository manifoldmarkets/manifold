import { createJob } from './helpers'
import { updateContractMetricsCore } from 'shared/update-contract-metrics-core'
import { sendOnboardingNotificationsInternal } from 'shared/onboarding-helpers'
import { updateUserMetricPeriods } from 'shared/update-user-metric-periods'
import { cleanOldNotifications } from './clean-old-notifications'
import { updateCashStatsCore, updateStatsCore } from './update-stats'
import { calculateConversionScore } from 'shared/conversion-score'
import { autoAwardBounty } from './auto-award-bounty'
import { resetPgStats } from './reset-pg-stats'
import { calculateUserTopicInterests } from 'shared/calculate-user-topic-interests'
import {
  CREATOR_UPDATE_FREQUENCY,
  updateCreatorMetricsCore,
} from 'shared/update-creator-metrics-core'
import { sendPortfolioUpdateEmailsToAllUsers } from 'shared/weekly-portfolio-emails'
import { sendWeeklyMarketsEmails } from 'shared/weekly-markets-emails'
import { resetWeeklyEmailsFlags } from './reset-weekly-emails-flags'
import { calculateGroupImportanceScore } from 'shared/group-importance-score'
import { checkPushNotificationReceipts } from 'shared/check-push-receipts'
import { sendStreakExpirationNotification } from './streak-expiration-notice'
import { expireLimitOrders } from 'shared/expire-limit-orders'
import { denormalizeAnswers } from './denormalize-answers'
import { incrementStreakForgiveness } from './increment-streak-forgiveness'
import { sendMarketCloseEmails } from './send-market-close-emails'
import { pollPollResolutions } from './poll-poll-resolutions'
import { IMPORTANCE_MINUTE_INTERVAL } from 'shared/importance-score'
import { scoreContracts } from './score-contracts'
import { updateLeagueRanks } from './update-league-ranks'
import { updateLeague } from './update-league'
import { drizzleLiquidity } from './drizzle-liquidity'
import { resetBettingStreaksInternal } from './reset-betting-streaks'
import {
  resetDailyQuestStatsInternal,
  resetWeeklyQuestStatsInternal,
} from './reset-quests-stats'
import { updateUserPortfolioHistoriesCore } from 'shared/update-user-portfolio-histories-core'
import { isProd } from 'shared/utils'
import { sendMarketMovementNotifications } from 'shared/send-market-movement-notifications'
import { sendUnseenMarketMovementNotifications } from 'shared/send-unseen-notifications'

export function createJobs() {
  return [
    // Hourly jobs:
    createJob(
      'send-market-close-emails',
      '0 0 * * * *', // every hour
      sendMarketCloseEmails
    ),
    createJob(
      'update-contract-metrics',
      '0 */21 * * * *', // every 21 minutes - (on the 3rd minute of every hour)
      updateContractMetricsCore
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
      updateLeague
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
      '*/45 * * * * *', // every 45 seconds
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
    // Daily jobs:
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
      'update-cash-stats',
      '0 20 4 * * *', // on 4:20am daily
      () => updateCashStatsCore(7)
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
      updateLeagueRanks
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
    // Monthly jobs:
    createJob(
      'increment-streak-forgiveness',
      '0 0 3 1 * *', // 3am PST on the 1st day of the month
      incrementStreakForgiveness
    ),
  ]
}
