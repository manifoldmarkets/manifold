import { ENV_CONFIG } from './envs/constants'
import { notification_preferences } from './user-notification-preferences'
import { UserEntitlement } from './shop/types'
import { DAY_MS, HOUR_MS } from './util/time'

// New normalized user_bans table schema
// modAlert is stored in user_bans for audit history but doesn't block any actions
export type BanType = 'posting' | 'marketControl' | 'trading' | 'modAlert'

export type UserBan = {
  id: number
  user_id: string
  ban_type: BanType
  reason: string | null
  created_at: string // ISO timestamp
  created_by: string | null // mod user ID
  // Scheduled expiry for temp bans (null = permanent)
  end_time: string | null
  ended_by: string | null // mod user ID who ended the ban
  // When manually lifted by mod (null = still active or expired naturally)
  ended_at: string | null
}

// Helper type for active bans (not ended)
export type ActiveBan = UserBan & {
  ended_at: null
  ended_by: null
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
  /** @deprecated Use user_bans table instead */
  isBannedFromPosting?: boolean
  /** @deprecated Use user_bans table instead */
  unbanTime?: number

  // USERNAME CHANGE RESTRICTION
  // When false, user cannot change their @username
  // Automatically set to false when any ban is applied (unless mod opts out)
  // Must be manually re-enabled by a mod
  canChangeUsername?: boolean  // undefined = allowed, false = restricted

  userDeleted?: boolean
  optOutBetWarnings?: boolean
  signupBonusPaid?: number
  isAdvancedTrader?: boolean
  purchasedMana?: boolean
  verifiedPhone?: boolean

  // Bonus eligibility for receiving site bonuses and participating in cash raffles
  // 'verified' = passed identity verification (iDenfy)
  // 'grandfathered' = existing user before cash raffles launched
  // 'ineligible' = not eligible for bonuses
  bonusEligibility?: 'verified' | 'grandfathered' | 'ineligible'

  // Entitlements - digital goods owned by this user (from user_entitlements table)
  entitlements?: UserEntitlement[]
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

/**
 * @deprecated Use canReceiveBonuses() instead. Phone verification has been replaced by iDenfy identity verification.
 */
export const humanish = (user: User) => user.verifiedPhone !== false

// Check if user can receive site bonuses (verified via iDenfy or grandfathered)
export const canReceiveBonuses = (user: User) =>
  user.bonusEligibility === 'verified' ||
  user.bonusEligibility === 'grandfathered'

// expires: sep 26th, ~530pm PT
const LIMITED_TIME_DEAL_END = 1727311753233 + DAY_MS
export const introductoryTimeWindow = (user: User) =>
  Math.max(
    LIMITED_TIME_DEAL_END,
    (user.sweepstakesVerifiedTime ?? user.createdTime) + 8 * HOUR_MS
  )
