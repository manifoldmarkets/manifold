import { notification_preferences } from './user-notification-preferences'
import { ENV_CONFIG } from './envs/constants'
import { DAY_MS } from 'common/util/time'

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
  freeQuestionsCreated?: number
}

export type PrivateUser = {
  id: string // same as User.id
  email?: string
  weeklyTrendingEmailSent: boolean
  weeklyPortfolioUpdateEmailSent: boolean
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

const MAX_FREE_QUESTIONS = 3
export const DAYS_TO_USE_FREE_QUESTIONS = 3
export const MAX_FREE_QUESTION_VALUE = 250

export const getAvailableBalancePerQuestion = (user: User): number => {
  return (
    user.balance +
    (freeQuestionRemaining(user.freeQuestionsCreated, user.createdTime) > 0
      ? MAX_FREE_QUESTION_VALUE
      : 0)
  )
}

export const marketCreationCosts = (user: User, ante: number) => {
  let amountSuppliedByUser = ante
  let amountSuppliedByHouse = 0
  if (freeQuestionRemaining(user.freeQuestionsCreated, user.createdTime) > 0) {
    amountSuppliedByUser = Math.max(ante - MAX_FREE_QUESTION_VALUE, 0)
    amountSuppliedByHouse = Math.min(ante, MAX_FREE_QUESTION_VALUE)
  }
  return { amountSuppliedByUser, amountSuppliedByHouse }
}

export const freeQuestionRemaining = (
  freeQuestionsCreated: number | undefined = 0,
  createdTime: number | undefined
) => {
  if (!createdTime) return 0
  const now = getCurrentUtcTime()
  if (freeQuestionsCreated >= MAX_FREE_QUESTIONS) {
    return 0
  }
  const daysSinceCreation =
    (now.getTime() - createdTime) / (DAYS_TO_USE_FREE_QUESTIONS * DAY_MS)
  if (daysSinceCreation >= 1) return 0
  return MAX_FREE_QUESTIONS - freeQuestionsCreated
}

export function getCurrentUtcTime(): Date {
  const currentDate = new Date()
  const utcDate = currentDate.toISOString()
  return new Date(utcDate)
}
