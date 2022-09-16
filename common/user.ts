import { notification_preferences } from './user-notification-preferences'
import { ENV_CONFIG } from 'common/envs/constants'

export type User = {
  id: string
  createdTime: number

  name: string
  username: string
  avatarUrl?: string

  // For their user page
  bio?: string
  bannerUrl?: string
  website?: string
  twitterHandle?: string
  discordHandle?: string

  balance: number
  totalDeposits: number

  profitCached: {
    daily: number
    weekly: number
    monthly: number
    allTime: number
  }

  creatorVolumeCached: {
    daily: number
    weekly: number
    monthly: number
    allTime: number
  }

  nextLoanCached: number
  followerCountCached: number

  followedCategories?: string[]
  homeSections?: string[]

  referredByUserId?: string
  referredByContractId?: string
  referredByGroupId?: string
  lastPingTime?: number
  shouldShowWelcome?: boolean
  lastBetTime?: number
  currentBettingStreak?: number
  hasSeenContractFollowModal?: boolean
  freeMarketsCreated?: number
  isBannedFromPosting?: boolean
}

export type PrivateUser = {
  id: string // same as User.id
  username: string // denormalized from User

  email?: string
  unsubscribedFromResolutionEmails?: boolean
  unsubscribedFromCommentEmails?: boolean
  unsubscribedFromAnswerEmails?: boolean
  unsubscribedFromGenericEmails?: boolean
  unsubscribedFromWeeklyTrendingEmails?: boolean
  weeklyTrendingEmailSent?: boolean
  manaBonusEmailSent?: boolean
  initialDeviceToken?: string
  initialIpAddress?: string
  apiKey?: string
  notificationPreferences: notification_preferences
  twitchInfo?: {
    twitchName: string
    controlToken: string
    botEnabled?: boolean
    needsRelinking?: boolean
  }
}

export type PortfolioMetrics = {
  investmentValue: number
  balance: number
  totalDeposits: number
  timestamp: number
  userId: string
}

export const MANIFOLD_USERNAME = 'ManifoldMarkets'
export const MANIFOLD_AVATAR_URL = 'https://manifold.markets/logo-bg-white.png'

export const BETTOR = ENV_CONFIG.bettor ?? 'bettor' // aka predictor
export const BETTORS = ENV_CONFIG.bettor + 's' ?? 'bettors'
export const PRESENT_BET = ENV_CONFIG.presentBet ?? 'bet' // aka predict
export const PRESENT_BETS = ENV_CONFIG.presentBet + 's' ?? 'bets'
export const PAST_BET = ENV_CONFIG.pastBet ?? 'bet' // aka prediction
export const PAST_BETS = ENV_CONFIG.pastBet + 's' ?? 'bets' // aka predictions
