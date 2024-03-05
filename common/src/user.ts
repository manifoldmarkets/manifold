import { notification_preferences } from './user-notification-preferences'
import { ENV_CONFIG } from './envs/constants'
import { DAY_MS, HOUR_MS } from 'common/util/time'
import { run, SupabaseClient } from 'common/supabase/utils'

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

  /**@deprecated 2023-01-015 */
  fractionResolvedCorrectly?: number

  nextLoanCached: number
  /** @deprecated */
  followerCountCached?: number

  homeSections?: string[]

  referredByUserId?: string
  referredByContractId?: string
  referredByGroupId?: string
  shouldShowWelcome?: boolean
  lastBetTime?: number

  currentBettingStreak?: number
  streakForgiveness: number

  hasSeenLoanModal?: boolean
  hasSeenContractFollowModal?: boolean
  isBannedFromPosting?: boolean
  userDeleted?: boolean
  metricsLastUpdated?: number
  optOutBetWarnings?: boolean
  freeQuestionsCreated?: number
  fromLove?: boolean
  fromPolitics?: boolean
  signupBonusPaid?: number
  isAdvancedTrader?: boolean
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
  // Set when the user rejects push notifications on the system modal (ie they said yes to our modal, no to the system modal)
  rejectedPushNotificationsOn?: number
  // Set when the user dismisses our own modal asking if they're interested
  interestedInPushNotifications?: boolean
  lastPromptedToEnablePushNotifications?: number
  blockedUserIds: string[]
  blockedByUserIds: string[]
  blockedContractIds: string[]
  blockedGroupSlugs: string[]
  hasSeenAppBannerInNotificationsOn?: number
  installedAppPlatforms?: string[]
  discordId?: string
  paymentInfo?: string
}

// TODO: remove. Hardcoding the strings would be better.
// Different views require different language.
export const BETTOR = ENV_CONFIG.bettor ?? 'trader'
export const BETTORS = ENV_CONFIG.bettor + 's' ?? 'traders'
export const SINGULAR_BET = ENV_CONFIG.nounBet ?? 'trade' // prediction (noun)
export const PLURAL_BETS = ENV_CONFIG.nounBet + 's' ?? 'trades' // predictions (noun)
// export const PRESENT_BET = ENV_CONFIG.presentBet ?? 'trade' // predict (verb)
export const PAST_BET = ENV_CONFIG.verbPastBet ?? 'traded' // predicted (verb)

export type UserAndPrivateUser = { user: User; privateUser: PrivateUser }
export const MANIFOLD_USER_USERNAME = 'Manifold'
export const MANIFOLD_USER_NAME = 'Manifold'
export const MANIFOLD_AVATAR_URL = 'https://manifold.markets/logo.png'
export const MANIFOLD_LOVE_LOGO =
  'https://manifold.markets/manifold_love_logo.svg'

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

export const marketCreationCosts = (
  user: User,
  ante: number,
  allSuppliedByUser?: boolean
) => {
  if (allSuppliedByUser) {
    return {
      amountSuppliedByUser: ante,
      amountSuppliedByHouse: 0,
    }
  }

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
  // hide if account less than one hour old
  if (createdTime > Date.now() - HOUR_MS) return 0

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

export const MINUTES_ALLOWED_TO_REFER = 60

export const isUserLikelySpammer = (
  user: Pick<User, 'bio' | 'freeQuestionsCreated'>,
  hasBet: boolean,
  hasCreatedDashboard?: boolean
) => {
  return (
    !hasBet &&
    ((user.bio ?? '').length > 10 ||
      (user.freeQuestionsCreated ?? 0) > 0 ||
      (hasCreatedDashboard ?? false))
  )
}

export const shouldIgnoreUserPage = async (user: User, db: SupabaseClient) => {
  // lastBetTime isn't always reliable, so use the contract_bets table to be sure
  const { data: bet } = await run(
    db.from('contract_bets').select('bet_id').eq('user_id', user.id).limit(1)
  )
  return (
    user.userDeleted ||
    user.isBannedFromPosting ||
    isUserLikelySpammer(user, bet.length > 0)
  )
}
