import { notification_preferences } from './user-notification-preferences'
import { ENV_CONFIG, TWOMBA_ENABLED } from './envs/constants'
import { intersection } from 'lodash'
import {
  identityBlockedCodes,
  locationTemporarilyBlockedCodes,
  underageErrorCodes,
} from 'common/reason-codes'

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
  resolvedProfitAdjustment?: number
  profitCached: {
    daily: number
    weekly: number
    monthly: number // Currently not updated bc it's not used
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

  /** @deprecated */
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
  optOutBetWarnings?: boolean
  freeQuestionsCreated?: number
  fromLove?: boolean
  /**  @deprecated - users created from manifoldpolitics.com site*/
  fromPolitics?: boolean
  signupBonusPaid?: number
  isAdvancedTrader?: boolean
  purchasedMana?: boolean
  verifiedPhone?: boolean
  kycFlags?: string[]
  kycLastAttempt?: number
  kycDocumentStatus?: 'fail' | 'pending' | 'await-documents' | 'verified'
  sweepstakesVerified?: boolean
  idVerified?: boolean
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

// TODO: this can be decommissioned
export const isVerified = (user: User) =>
  user.verifiedPhone !== false || !!user.purchasedMana

export const verifiedPhone = (user: User) => user.verifiedPhone !== false

const verifiedAndBlocked = (user: User | undefined | null) =>
  user && user.idVerified && !user.sweepstakesVerified

export const identityPending = (user: User | undefined | null) =>
  user && !user.idVerified && user.kycDocumentStatus === 'pending'

export const blockFromSweepstakes = (user: User | undefined | null) =>
  user && (!user.idVerified || verifiedAndBlocked(user))

export const locationBlocked = (user: User | undefined | null) =>
  user &&
  verifiedAndBlocked(user) &&
  intersection(user.kycFlags, locationTemporarilyBlockedCodes).length > 0

export const ageBlocked = (user: User | undefined | null) =>
  user &&
  verifiedAndBlocked(user) &&
  intersection(user.kycFlags, underageErrorCodes).length > 0

export const identityBlocked = (user: User | undefined | null) =>
  user && intersection(user.kycFlags, identityBlockedCodes).length > 0

export const getVerificationStatus = (
  user: User
): {
  status: 'success' | 'error'
  message: string
} => {
  if (!TWOMBA_ENABLED) {
    return { status: 'error', message: 'GIDX registration is disabled' }
  } else if (!verifiedPhone(user)) {
    return { status: 'error', message: 'User must verify phone' }
  } else if (!user.idVerified) {
    return { status: 'error', message: 'User identification failed' }
  } else if (!user.sweepstakesVerified && locationBlocked(user)) {
    return { status: 'error', message: 'User location is blocked' }
  } else if (!user.sweepstakesVerified) {
    return { status: 'error', message: 'User is blocked' }
  } else if (user.sweepstakesVerified) {
    return { status: 'success', message: 'User is verified' }
  } else {
    return { status: 'error', message: 'User must register' }
  }
}
