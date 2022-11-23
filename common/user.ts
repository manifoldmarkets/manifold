import { notification_preferences } from './user-notification-preferences'
import { ENV_CONFIG } from './envs/constants'
import { MarketCreatorBadge, ProvenCorrectBadge, StreakerBadge } from './badge'

export type User = {
  id: string
  createdTime: number

  name: string
  username: string
  avatarUrl: string

  // For their user page
  bio?: string
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

  creatorTraders: {
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
  userDeleted?: boolean
}

export type PrivateUser = {
  id: string // same as User.id
  username: string // denormalized from User

  email?: string
  // TODO: move these to non-optional in a couple weeks so we can include them in a fb query
  weeklyTrendingEmailSent?: boolean
  weeklyPortfolioUpdateEmailSent?: boolean
  manaBonusSent?: boolean
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
  pushToken?: string
  rejectedPushNotificationsOn?: number
  interestedInPushNotifications?: boolean
  blockedUserIds: string[]
  blockedByUserIds: string[]
  blockedContractIds: string[]
  blockedGroupSlugs: string[]
  hasSignedEula?: boolean
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
export const PAST_BET = ENV_CONFIG.pastBet ?? 'traded'
export const PAST_BETS = ENV_CONFIG.pastBet + 's' ?? 'trades'

export type UserAndPrivateUser = { user: User; privateUser: PrivateUser }
