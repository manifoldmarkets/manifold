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
  homeSections?: { visible: string[]; hidden: string[] }

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
  notificationSubscriptionTypes: exhaustive_notification_subscribe_types
}

export type notification_receive_types = 'email' | 'browser'

export type exhaustive_notification_subscribe_types = {
  // Watched Markets
  all_comments: notification_receive_types[] // Email currently - seems bad
  all_answers: notification_receive_types[] // Email currently - seems bad

  // Comments
  tipped_comments: notification_receive_types[] // Email
  comments_by_followed_users: notification_receive_types[]
  all_replies_to_my_comments: notification_receive_types[] // Email
  all_replies_to_my_answers: notification_receive_types[] // Email

  // Answers
  answers_by_followed_users: notification_receive_types[]
  answers_by_market_creator: notification_receive_types[]

  // On users' markets
  my_markets_closed: notification_receive_types[] // Email, Recommended
  all_comments_on_my_markets: notification_receive_types[] // Email
  all_answers_on_my_markets: notification_receive_types[] // Email

  // Market updates
  resolutions: notification_receive_types[] // Email
  market_updates: notification_receive_types[]
  probability_updates: notification_receive_types[] // Email - would want persistent changes only though

  // Balance Changes
  loans: notification_receive_types[]
  betting_streaks: notification_receive_types[]
  referral_bonuses: notification_receive_types[]
  unique_bettor_bonuses: notification_receive_types[]

  // General
  user_tagged_you: notification_receive_types[] // Email
  new_markets_by_followed_users: notification_receive_types[] // Email
  trending_markets: notification_receive_types[] // Email
  profit_loss_updates: notification_receive_types[] // Email
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
