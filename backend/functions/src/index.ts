import * as admin from 'firebase-admin'

admin.initializeApp()

// triggers
export * from './triggers/log-writes' // Running the emulator? Comment this line out
export * from './triggers/on-create-user'
export * from './triggers/on-create-bet'
export * from './triggers/on-create-comment-on-contract'
export * from './triggers/on-create-answer'
export * from './triggers/on-update-contract'
export * from './triggers/on-create-contract'
export * from './triggers/on-create-liquidity-provision'
export * from './triggers/on-update-reaction'

// scheduled functions
export * from './scheduled/update-loans'
export {
  sendWeeklyPortfolioUpdate,
  saveWeeklyContractMetrics,
} from './scheduled/weekly-portfolio-updates'
export * from './scheduled/update-group-metrics'
export * from './scheduled/update-stats'
export * from './scheduled/backup-db'
export * from './scheduled/market-close-notifications'
export * from './scheduled/score-contracts'
export * from './scheduled/weekly-markets-emails'
export * from './scheduled/reset-betting-streaks'
export * from './scheduled/reset-weekly-emails-flags'
export * from './scheduled/weekly-portfolio-emails'
export * from './scheduled/drizzle-liquidity'
export * from './scheduled/check-push-notification-receipts'
export * from './scheduled/increment-streak-forgiveness'
export * from './scheduled/reset-quests-stats'
export * from './scheduled/expire-limit-orders'
export * from './scheduled/update-view-embeddings'
export * from './scheduled/update-league'
export * from './scheduled/update-league-ranks'
export * from './scheduled/streak-expiration-notification'
export * from './scheduled/clean-old-rows'
export * from './scheduled/denormalize-answers'
export * from './scheduled/score-groups'
export * from './scheduled/update-view-embeddings'
export * from './scheduled/poll-poll-resolutions'
