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
  isBannedFromMana?: boolean
  isBannedFromSweepcash?: boolean
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

  // KYC related fields:
  kycLastAttemptTime?: number
  kycDocumentStatus?: 'fail' | 'pending' | 'await-documents' | 'verified'
  sweepstakesVerified?: boolean
  idVerified?: boolean
  sweepstakes5kLimit?: boolean
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

// This grandfathers in older users who have not yet verified their phone
export const humanish = (user: User) => user.verifiedPhone !== false

const verifiedAndBlocked = (user: User | undefined | null) =>
  user && user.idVerified && !user.sweepstakesVerified

export const identityPending = (user: User | undefined | null) =>
  user && !user.idVerified && user.kycDocumentStatus === 'pending'

export const blockFromSweepstakes = (user: User | undefined | null) =>
  user && (!user.idVerified || verifiedAndBlocked(user))

export const locationBlocked = (
  user: User | undefined | null,
  privateUser: PrivateUser | undefined | null
) =>
  privateUser &&
  verifiedAndBlocked(user) &&
  intersection(privateUser.kycFlags, locationTemporarilyBlockedCodes).length > 0

export const ageBlocked = (
  user: User | undefined | null,
  privateUser: PrivateUser | undefined | null
) =>
  privateUser &&
  verifiedAndBlocked(user) &&
  intersection(privateUser.kycFlags, underageErrorCodes).length > 0

export const identityBlocked = (
  user: User | undefined | null,
  privateUser: PrivateUser | undefined | null
) =>
  privateUser &&
  verifiedAndBlocked(user) &&
  intersection(privateUser.kycFlags, identityBlockedCodes).length > 0

export const GIDX_DISABLED_MESSAGE = 'GIDX registration is disabled'
export const PHONE_NOT_VERIFIED_MESSAGE = 'User must verify phone'
export const IDENTIFICATION_FAILED_MESSAGE = 'User identification failed'
export const LOCATION_BLOCKED_MESSAGE = 'User location is blocked'
export const USER_BLOCKED_MESSAGE = 'User is blocked'
export const USER_NOT_REGISTERED_MESSAGE = 'User must register'
export const USER_VERIFIED_MESSSAGE = 'User is verified'

export const PROMPT_VERIFICATION_MESSAGES = [
  USER_NOT_REGISTERED_MESSAGE,
  PHONE_NOT_VERIFIED_MESSAGE,
  IDENTIFICATION_FAILED_MESSAGE,
]

export const getVerificationStatus = (
  user: User
): {
  status: 'success' | 'error'
  message: string
} => {
  if (!TWOMBA_ENABLED) {
    return { status: 'error', message: GIDX_DISABLED_MESSAGE }
  } else if (!humanish(user)) {
    return { status: 'error', message: PHONE_NOT_VERIFIED_MESSAGE }
  } else if (!user.idVerified) {
    return { status: 'error', message: IDENTIFICATION_FAILED_MESSAGE }
  } else if (!user.sweepstakesVerified) {
    return { status: 'error', message: USER_BLOCKED_MESSAGE }
  } else if (user.sweepstakesVerified) {
    return { status: 'success', message: USER_VERIFIED_MESSSAGE }
  } else {
    return { status: 'error', message: USER_NOT_REGISTERED_MESSAGE }
  }
}
