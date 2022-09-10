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
  notificationPreferences?: notification_subscribe_types
}

export type notification_subscribe_types = 'all' | 'less' | 'none'

export type PortfolioMetrics = {
  investmentValue: number
  balance: number
  totalDeposits: number
  timestamp: number
  userId: string
}

export const MANIFOLD_USERNAME = 'ManifoldMarkets'
export const MANIFOLD_AVATAR_URL = 'https://manifold.markets/logo-bg-white.png'
