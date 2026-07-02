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
// Autoresolve temporarily disabled — uncomment to continue with $100/day.
// import { autoGenerateAndResolvePrizeDrawings } from './auto-generate-and-resolve-prize-drawings'
import { autobanUsers } from './autoban-users'
import { autoLeaguesCycle } from './auto-leagues-cycle'
import { cleanOldNotifications } from './clean-old-notifications'
import { denormalizeAnswers } from './denormalize-answers'
import { drizzleLiquidity } from './drizzle-liquidity'
import { createJob } from './helpers'
import { pollPollResolutions } from './poll-poll-resolutions'
import { processMembershipRenewals } from './process-membership-renewals'
import { checkSubscriptionExpiry } from './check-subscription-expiry'
import { expirePersonalizedManaOffers } from './expire-personalized-mana-offers'
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
import { sendPrizeEndingSoonNotifications } from './send-prize-ending-soon-notifications'
import { sendStreakExpirationNotification } from './streak-expiration-notice'
import { unbanUsers } from './unban-users'
import { updateLeague } from './update-league'
import { updateLeagueRanks } from './update-league-ranks'
import { updateStatsCore } from './update-stats'
import { updatePerps } from './update-perps'
import { updateTrumpApproval } from './update-trump-approval'
import { resolveSportsMarkets } from './sports-resolve'
import { createUpcomingSportsMarkets } from './sports-create-markets'
import { pollSportsLiveScores } from './sports-live'

export function createJobs() {
  // Schedules are 6-field croner expressions (seconds first) evaluated in
  // America/Los_Angeles (DEFAULT_OPTS in ./helpers.ts) — NOT UTC. A run that
  // is still going when its next firing comes due is skipped ("protect").
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
      '0 */21 * * * *', // at :00, :21, and :42 of every hour
      () => updateContractMetricsCore(false)
    ),
    createJob(
      'update-contract-metrics-full',
      '0 30 5 * * *', // daily at 5:30 AM LA
      () => updateContractMetricsCore(true)
    ),
    createJob(
      'update-creator-metrics',
      `0 ${CREATOR_UPDATE_FREQUENCY} * * * *`, // hourly at :57
      updateCreatorMetricsCore
    ),
    createJob(
      'group-importance-score',
      '0 6 * * * *', // hourly at :06
      () => calculateGroupImportanceScore()
    ),
    createJob(
      'update-league',
      '0 */15 * * * *', // every 15 minutes
      () => updateLeague()
    ),
    createJob(
      'check-push-receipts',
      '0 15 * * * *', // hourly at :15
      checkPushNotificationReceipts
    ),
    createJob(
      'send-contract-movement-notifications',
      '0 12 * * * *', // hourly at :12
      () => sendMarketMovementNotifications(false)
    ),
    createJob(
      'calculate-conversion-scores',
      '0 46 * * * *', // hourly at :46
      calculateConversionScore
    ),
    createJob(
      'send-prize-ending-soon-notifications',
      '0 */5 * * * *', // every 5 minutes
      sendPrizeEndingSoonNotifications
    ),
    createJob(
      'auto-award-bounty',
      '0 55 * * * *', // hourly at :55
      autoAwardBounty
    ),
    createJob(
      'autoban-users',
      '0 */15 * * * *', // every 15 minutes
      autobanUsers
    ),
    createJob(
      'update-user-portfolio-histories',
      '30 * * * * *', // every minute, at :30s
      () => updateUserPortfolioHistoriesCore()
    ),
    createJob(
      'drizzle-liquidity',
      '0 */7 * * * *', // at :00, :07, ... :56 of every hour
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
      // every IMPORTANCE_MINUTE_INTERVAL (2) minutes in prod; hourly in dev
      `0 */${isProd() ? IMPORTANCE_MINUTE_INTERVAL : 60} * * * *`,
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
    createJob(
      'update-perps',
      '0 0 * * * *', // every hour on the hour
      updatePerps
    ),
    // Daily jobs:
    createJob(
      'process-membership-renewals',
      '0 0 8 * * *', // daily at 8:00 AM LA
      processMembershipRenewals
    ),
    createJob(
      'check-subscription-expiry',
      '0 0 10 * * *', // daily at 10:00 AM LA - warns users 2-3 days before expiry
      checkSubscriptionExpiry
    ),
    createJob(
      'expire-personalized-mana-offers',
      // Hourly. Interval is not load-bearing for correctness — the redemption
      // path in stripe-endpoints.ts and daimo-webhook.ts accepts a 5-minute
      // grace past expires_at and the cron itself only flips rows that are
      // ALREADY past that grace window. Changing this to a finer cadence is
      // fine; just don't widen the redemption-side grace above the cron lag
      // or accidentally-expired offers will redeem at the offer rate again.
      '0 17 * * * *',
      expirePersonalizedManaOffers
    ),
    createJob(
      'send-unseen-notifications',
      '0 0 13 * * *', // daily at 1:00 PM LA
      sendUnseenMarketMovementNotifications
    ),
    createJob(
      'clean-old-notifications',
      '0 30 1 * * *', // daily at 1:30 AM LA - heavy disk user
      cleanOldNotifications
    ),
    // Autoresolve temporarily disabled — uncomment to continue with $100/day.
    // createJob(
    //   'auto-generate-and-resolve-prize-drawings',
    //   '0 0 13 * * *', // 1 PM PT daily
    //   autoGenerateAndResolvePrizeDrawings
    // ),
    // // Achievement MV refreshes (nightly, staggered ~10 mins apart)
    // createJob(
    //   'update-ach-trades',
    //   '0 10 2 * * *', // 2:10 AM daily
    //   updateAchTrades
    // ),
    createJob(
      'refresh-ach-volume',
      '0 30 2 * * *', // daily at 2:30 AM LA
      refreshAchVolume
    ),
    createJob(
      'refresh-ach-comments',
      '0 40 2 * * *', // daily at 2:40 AM LA
      refreshAchComments
    ),
    createJob(
      'refresh-ach-creator-contracts',
      '0 50 2 * * *', // daily at 2:50 AM LA
      refreshAchCreatorContracts
    ),
    createJob(
      'refresh-ach-referrals',
      '0 0 3 * * *', // daily at 3:00 AM LA
      refreshAchReferrals
    ),
    createJob(
      'refresh-ach-creator-traders',
      '0 10 3 * * *', // daily at 3:10 AM LA
      refreshAchCreatorTraders
    ),
    createJob(
      'refresh-ach-leagues',
      '0 20 3 * * *', // daily at 3:20 AM LA
      refreshAchLeagues
    ),
    createJob(
      'refresh-ach-pnl',
      '0 30 3 * * *', // daily at 3:30 AM LA
      refreshAchPnl
    ),
    createJob(
      'refresh-ach-txns',
      '0 40 3 * * *', // daily at 3:40 AM LA
      refreshAchTxns
    ),
    createJob(
      'refresh-ach-account-age',
      '0 50 3 * * *', // daily at 3:50 AM LA
      refreshAchAccountAge
    ),
    createJob(
      'update-user-metric-periods',
      '0 0 2 * * *', // daily at 2:00 AM LA
      async () => {
        await updateUserMetricPeriods()
      }
    ),
    createJob(
      'reset-pg-stats',
      '0 0 3 * * *', // daily at 3:00 AM LA
      resetPgStats
    ),
    createJob(
      'calculate-user-topic-interests',
      '0 0 4 * * *', // daily at 4:00 AM LA
      () => calculateUserTopicInterests()
    ),
    createJob(
      'update-stats',
      '0 20 4 * * *', // daily at 4:20 AM LA
      () => updateStatsCore(7)
    ),
    createJob(
      'update-trump-approval',
      '0 30 5 * * *', // 5:30am daily
      updateTrumpApproval
    ),
    createJob(
      'onboarding-notification',
      '0 0 11 * * *', // daily at 11:00 AM LA
      sendOnboardingNotificationsInternal
    ),
    createJob(
      'weekly-portfolio-emails',
      '0 * 12-14 * * 5', // every minute from 12:00 to 2:59 PM LA on Fridays
      sendPortfolioUpdateEmailsToAllUsers
    ),
    createJob(
      'weekly-markets-emails',
      '0 */2 10-17 * * 1', // every 2 minutes from 10 AM to 5:58 PM LA on Mondays
      sendWeeklyMarketsEmails
    ),
    createJob(
      'reset-weekly-email-flags',
      '0 0 0 * * 6', // Saturdays at midnight LA
      resetWeeklyEmailsFlags
    ),
    createJob(
      'send-streak-notifications',
      '0 30 18 * * *', // daily at 6:30 PM LA
      sendStreakExpirationNotification
    ),
    createJob(
      'update-league-ranks',
      '0 0 0 * * *', // daily at midnight LA
      () => updateLeagueRanks()
    ),
    createJob(
      'reset-betting-streaks',
      '0 0 0 * * *', // daily at midnight LA
      resetBettingStreaksInternal
    ),
    createJob(
      'reset-quests-stats',
      '0 0 0 * * *', // daily at midnight LA
      resetDailyQuestStatsInternal
    ),
    createJob(
      'reset-weekly-quests-stats',
      '0 0 0 * * 1', // Mondays at midnight LA
      resetWeeklyQuestStatsInternal
    ),
    createJob(
      'downsample-portfolio-history',
      '0 50 4 * * *', // daily at 4:50 AM LA
      downsamplePortfolioHistory
    ),
    // All football-data.org tournaments: check for finished matches and auto-resolve every 15 minutes
    createJob(
      'sports-resolve',
      '0 */15 * * * *', // every 15 minutes
      resolveSportsMarkets
    ),
    // Create markets for upcoming matches in the next 7 days
    createJob(
      'sports-create-markets',
      '0 0 7 * * *', // daily at 7:00 AM LA
      createUpcomingSportsMarkets
    ),
    // Poll in-play scores every 10s and broadcast them over websockets. No-op
    // (no football-data call, just a cheap DB count) outside a tournament's
    // active match window. During a window it's ~6 calls/min per tournament,
    // well under the 20/min football-data budget; the throttled client backs
    // off if a burst ever approaches the limit.
    createJob(
      'sports-live',
      '*/10 * * * * *', // every 10 seconds
      pollSportsLiveScores
    ),
  ]
}
