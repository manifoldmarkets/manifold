import { notification_preferences } from './user-notification-preferences'
import { ENV_CONFIG } from './envs/constants'
import { MarketCreatorBadge, ProvenCorrectBadge, StreakerBadge } from './badge'

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

  fractionResolvedCorrectly: number

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

  achievements: {
    provenCorrect?: {
      badges: ProvenCorrectBadge[]
    }
    marketCreator?: {
      badges: MarketCreatorBadge[]
    }
    streaker?: {
      badges: StreakerBadge[]
    }
  }
}

export type PrivateUser = {
  id: string // same as User.id
  username: string // denormalized from User

  email?: string
  weeklyTrendingEmailSent?: boolean
  weeklyPortfolioUpdateEmailSent?: boolean
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

export const MANIFOLD_USER_USERNAME = 'ManifoldMarkets'
export const MANIFOLD_USER_NAME = 'ManifoldMarkets'
export const MANIFOLD_AVATAR_URL = 'https://manifold.markets/logo-bg-white.png'

// TODO: remove. Hardcoding the strings would be better.
// Different views require different language.
export const BETTOR = ENV_CONFIG.bettor ?? 'trader'
export const BETTORS = ENV_CONFIG.bettor + 's' ?? 'traders'
export const PRESENT_BET = ENV_CONFIG.presentBet ?? 'trade'
export const PRESENT_BETS = ENV_CONFIG.presentBet + 's' ?? 'trades'
export const PAST_BET = ENV_CONFIG.pastBet ?? 'trade'
export const PAST_BETS = ENV_CONFIG.pastBet + 's' ?? 'trades'
