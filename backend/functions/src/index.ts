import * as admin from 'firebase-admin'

admin.initializeApp()

// scheduled functions
export {
  sendWeeklyPortfolioUpdate,
  saveWeeklyContractMetrics,
} from './scheduled/weekly-portfolio-updates'
export * from './scheduled/market-close-notifications'
export * from './scheduled/score-contracts'
export * from './scheduled/reset-betting-streaks'
export * from './scheduled/drizzle-liquidity'
export * from './scheduled/increment-streak-forgiveness'
export * from './scheduled/reset-quests-stats'
export * from './scheduled/update-view-embeddings'
export * from './scheduled/update-league'
export * from './scheduled/update-league-ranks'
export * from './scheduled/denormalize-answers'
export * from './scheduled/update-view-embeddings'
export * from './scheduled/poll-poll-resolutions'
