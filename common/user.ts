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

  followerCountCached: number

  followedCategories?: string[]
}

export const STARTING_BALANCE = 1000
export const SUS_STARTING_BALANCE = 10 // for sus users, i.e. multiple sign ups for same person

export type PrivateUser = {
  id: string // same as User.id
  username: string // denormalized from User

  email?: string
  unsubscribedFromResolutionEmails?: boolean
  unsubscribedFromCommentEmails?: boolean
  unsubscribedFromAnswerEmails?: boolean
  unsubscribedFromGenericEmails?: boolean
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
