import { ENV_CONFIG } from './envs/constants'
import { notification_preferences } from './user-notification-preferences'
import { DAY_MS, HOUR_MS } from './util/time'

export type BanDetails = {
  bannedAt: number
  bannedBy: string     // mod user ID
  reason: string       // displayed to user
  unbanTime?: number   // undefined = permanent, number = temp ban expiry
}

export type UnbanRecord = {
  banType: 'posting' | 'marketControl' | 'trading'
  // Original ban info
  bannedAt: number
  bannedBy: string
  banReason: string
  wasTemporary: boolean
  originalUnbanTime?: number
  // Unban info
  unbannedAt: number
  unbannedBy: string  // mod user ID who removed the ban, or 'system' for auto-expiry
  unbanNote?: string  // mod notes, not shown to user
}

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
  totalDeposits: number
  creatorTraders: {
    daily: number
    weekly: number
    monthly: number
    allTime: number
  }

  /**  @deprecated */
  cashBalance: number // prize points
  /**  @deprecated */
  spiceBalance: number
  /** @deprecated */
  totalCashDeposits: number
  /**@deprecated 2023-01-015 */
  fractionResolvedCorrectly?: number
  /** @deprecated */
  followerCountCached?: number
  /** @deprecated */
  homeSections?: string[]
  /** @deprecated */
  usedReferralCode?: boolean
  /** @deprecated */
  freeQuestionsCreated?: number
  /**  @deprecated - users created from manifoldpolitics.com site*/
  fromPolitics?: boolean
  /** @deprecated */
  purchasedSweepcash?: boolean
  /** @deprecated */
  origin?: 'mani'
  /** @deprecated */
  kycLastAttemptTime?: number
  /** @deprecated */
  kycDocumentStatus?: 'fail' | 'pending' | 'await-documents' | 'verified'
  /** @deprecated */
  sweepstakesVerified?: boolean
  /** @deprecated */
  idVerified?: boolean
  /** @deprecated */
  sweepstakes5kLimit?: boolean
  /** @deprecated */
  sweepstakesVerifiedTime?: number
  /** @deprecated */
  fromLove?: boolean

  referredByUserId?: string
  referredByContractId?: string
  referredByGroupId?: string
  shouldShowWelcome?: boolean
  lastBetTime?: number
  currentBettingStreak?: number
  streakForgiveness: number
  hasSeenLoanModal?: boolean
  hasSeenContractFollowModal?: boolean
  seenStreakModal?: boolean
  isBannedFromPosting?: boolean
  /** @deprecated Not deprecated, only updated in native column though */
  unbanTime?: number

  // NEW GRANULAR BAN SYSTEM
  bans?: {
    posting?: BanDetails
    marketControl?: BanDetails
    trading?: BanDetails
  }

  // MOD ALERTS (can exist without bans)
  modAlert?: {
    message: string
    createdAt: number
    createdBy: string  // mod user ID
    dismissed?: boolean
  }

  // BAN HISTORY (tracks past bans that were removed or expired)
  banHistory?: UnbanRecord[]

  userDeleted?: boolean
  optOutBetWarnings?: boolean
  signupBonusPaid?: number
  isAdvancedTrader?: boolean
  purchasedMana?: boolean
  verifiedPhone?: boolean
}

export type PrivateUser = {
  id: string // same as User.id
  email?: string
  old_e_mail?: string // saved from deleted users
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
  // Timestamp of the last time the user was prompted for an app review or successfully reviewed.
  lastAppReviewTime?: number

  /** @deprecated */
  kycFlags?: string[]
  /** @deprecated */
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
  user: Pick<User, 'bio' | 'isBannedFromPosting'>,
  hasBet: boolean,
  hasCreatedQuestion: boolean
) => {
  return (
    (!hasBet && ((user.bio ?? '').length > 10 || hasCreatedQuestion)) ||
    user.isBannedFromPosting
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
