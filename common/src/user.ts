import { notification_preferences } from './user-notification-preferences'
import { ENV_CONFIG } from './envs/constants'

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

  fractionResolvedCorrectly?: number // Deprecated as of 2023-01-05

  nextLoanCached: number
  followerCountCached: number

  homeSections?: string[]

  referredByUserId?: string
  referredByContractId?: string
  referredByGroupId?: string
  shouldShowWelcome?: boolean
  lastBetTime?: number

  currentBettingStreak?: number
  streakForgiveness: number

  hasSeenContractFollowModal?: boolean
  isBannedFromPosting?: boolean
  userDeleted?: boolean
  metricsLastUpdated?: number
  optOutBetWarnings?: boolean
}

export type PrivateUser = {
  id: string // same as User.id
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
  destinySub2Claimed?: boolean
  pushToken?: string
  rejectedPushNotificationsOn?: number
  interestedInPushNotifications?: boolean
  blockedUserIds: string[]
  blockedByUserIds: string[]
  blockedContractIds: string[]
  blockedGroupSlugs: string[]
  hasSeenAppBannerInNotificationsOn?: number
  installedAppPlatforms?: string[]
  discordId?: string
}

export const MANIFOLD_USER_USERNAME = 'ManifoldMarkets'
export const MANIFOLD_USER_NAME = 'ManifoldMarkets'
export const MANIFOLD_AVATAR_URL = 'https://manifold.markets/logo-bg-white.png'

// TODO: remove. Hardcoding the strings would be better.
// Different views require different language.
export const BETTOR = ENV_CONFIG.bettor ?? 'trader'
export const BETTORS = ENV_CONFIG.bettor + 's' ?? 'traders'
export const SINGULAR_BET = ENV_CONFIG.nounBet ?? 'trade' // prediction (noun)
export const PLURAL_BETS = ENV_CONFIG.nounBet + 's' ?? 'trades' // predictions (noun)
// export const PRESENT_BET = ENV_CONFIG.presentBet ?? 'trade' // predict (verb)
export const PAST_BET = ENV_CONFIG.verbPastBet ?? 'traded' // predicted (verb)

export type UserAndPrivateUser = { user: User; privateUser: PrivateUser }
