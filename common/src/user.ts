import { notification_preferences } from './user-notification-preferences'
import { ENV_CONFIG } from './envs/constants'
import { DAY_MS, HOUR_MS } from './util/time'

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

  balance: number // M$
  cashBalance: number // prize points
  spiceBalance: number
  totalDeposits: number
  totalCashDeposits: number

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

  /** @deprecated */
  homeSections?: string[]

  referredByUserId?: string
  usedReferralCode?: boolean
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
  optOutBetWarnings?: boolean
  freeQuestionsCreated?: number
  fromLove?: boolean
  /**  @deprecated - users created from manifoldpolitics.com site*/
  fromPolitics?: boolean
  signupBonusPaid?: number
  isAdvancedTrader?: boolean
  purchasedMana?: boolean
  purchasedSweepcash?: boolean
  verifiedPhone?: boolean

  // KYC related fields:
  kycLastAttemptTime?: number
  kycDocumentStatus?: 'fail' | 'pending' | 'await-documents' | 'verified'
  sweepstakesVerified?: boolean
  idVerified?: boolean
  sweepstakes5kLimit?: boolean
  sweepstakesVerifiedTime?: number
}

export type PrivateUser = {
  id: string // same as User.id
  email?: string
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

  // KYC related fields:
  kycFlags?: string[]
  sessionFraudScore?: number
}

// TODO: remove. Hardcoding the strings would be better.
// Different views require different language.
export const BETTOR = ENV_CONFIG.bettor
export const BETTORS = ENV_CONFIG.bettor + 's'
export const SINGULAR_BET = ENV_CONFIG.nounBet // prediction (noun)
export const PLURAL_BETS = ENV_CONFIG.nounBet + 's' // predictions (noun)
// export const PRESENT_BET = ENV_CONFIG.presentBet ?? 'trade' // predict (verb)
export const PAST_BET = ENV_CONFIG.verbPastBet // predicted (verb)

export type UserAndPrivateUser = { user: User; privateUser: PrivateUser }
export const MANIFOLD_USER_USERNAME = 'Manifold'
export const MANIFOLD_USER_NAME = 'Manifold'
export const MANIFOLD_AVATAR_URL = 'https://manifold.markets/logo.png'
export const MANIFOLD_LOVE_LOGO =
  'https://manifold.markets/manifold_love_logo.svg'

export function getCurrentUtcTime(): Date {
  const currentDate = new Date()
  const utcDate = currentDate.toISOString()
  return new Date(utcDate)
}

export const MINUTES_ALLOWED_TO_REFER = 60

// note this is not exactly same as the function for stats page
export const isUserLikelySpammer = (
  user: Pick<User, 'bio' | 'freeQuestionsCreated'>,
  hasBet: boolean
) => {
  return (
    !hasBet &&
    ((user.bio ?? '').length > 10 || (user.freeQuestionsCreated ?? 0) > 0)
  )
}

// This grandfathers in older users who have not yet verified their phone
export const humanish = (user: User) => user.verifiedPhone !== false

// expires: sep 26th, ~530pm PT
const LIMITED_TIME_DEAL_END = 1727311753233 + DAY_MS
export const introductoryTimeWindow = (user: User) =>
  Math.max(
    LIMITED_TIME_DEAL_END,
    (user.sweepstakesVerifiedTime ?? user.createdTime) + 8 * HOUR_MS
  )
