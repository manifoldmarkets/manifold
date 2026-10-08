import { ENV_CONFIG } from './envs/constants'
import { notification_preferences } from './user-notification-preferences'
import { UserEntitlement } from './shop/types'
import { DAY_MS, HOUR_MS } from './util/time'
import {
  EffectiveTier,
  isSupporter,
  resolveEffectiveTier,
} from './supporter-config'

// New normalized user_bans table schema
// modAlert is stored in user_bans for audit history but doesn't block any actions
export type BanType =
  | 'posting'
  | 'marketControl'
  | 'trading'
  | 'purchase'
  | 'modAlert'

export type UserBan = {
  id: number
  user_id: string
  ban_type: BanType
  reason: string | null
  created_at: string // ISO timestamp
  created_by: string | null // mod user ID
  // Scheduled expiry for temp bans (null = permanent)
  end_time: string | null
  // Mod user ID, the user themself (modAlert dismissal), or 'system' (auto-expired temp ban)
  ended_by: string | null
  // When the ban was lifted, by a mod or by auto-expiry (null = still active)
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
  lastStreakFreezeTime?: number // timestamp when a streak freeze was last used
  hasSeenLoanModal?: boolean
  hasSeenContractFollowModal?: boolean
  // Set when a reader closes the /perps explainer. Until then the page opens
  // it for them on arrival unless they hold a perp position — the one signal
  // the hub already has for "has done this before" — so a newcomer meets the
  // mechanism and nobody else is nagged.
  hasSeenPerpsExplainer?: boolean
  seenStreakModal?: boolean
  lastShopVisitTime?: number // timestamp of user's most recent /shop visit; drives the NEW badge dismissal
  /** @deprecated Use user_bans table instead */
  isBannedFromPosting?: boolean
  /** @deprecated Use user_bans table instead */
  unbanTime?: number

  // USERNAME CHANGE RESTRICTION
  // When false, user cannot change their @username
  // Automatically set to false when any ban is applied (unless mod opts out)
  // Must be manually re-enabled by a mod
  canChangeUsername?: boolean // undefined = allowed, false = restricted

  userDeleted?: boolean
  optOutBetWarnings?: boolean
  // Last state of the "Hide API trades" toggle on trade lists, saved so it
  // sticks across markets and devices (see useHideApiTrades).
  hideApiTrades?: boolean
  signupBonusPaid?: number
  isBot?: boolean
  isAdvancedTrader?: boolean
  purchasedMana?: boolean
  verifiedPhone?: boolean

  // Bonus eligibility / account standing for site bonuses (referral, quests,
  // leagues, streaks, loans, etc.). Identity verification is optional: every
  // state except the two explicit deny states earns full bonuses.
  // undefined = default — full bonuses, never identity-verified
  // 'verified' = passed identity verification (iDenfy); also unlocks prizes
  // 'grandfathered' = existing user before cash raffles launched; also prizes
  // 'eligible' = made a mana purchase (any rail) or hand-granted by an admin
  //   ("people we know"). Same bonuses as default, and counts as an account
  //   trust signal (skips the new-account social gate). Does NOT unlock prize
  //   drawings: those still require KYC (see isIdentityVerified /
  //   canEnterPrizeDrawings).
  // 'ineligible' = bonus-blocked (super-ban, admin) — reduced bonuses
  // 'requires_verification' = admin/system has flagged this user; they earn
  //   no farmable bonuses until they complete identity verification (e.g.
  //   suspected alt, suspicious signup, manual review).
  bonusEligibility?:
    | 'verified'
    | 'grandfathered'
    | 'eligible'
    | 'ineligible'
    | 'requires_verification'

  // Free-text note set when an admin (or iDenfy) flags this user — e.g.
  // "suspected alt of @other-user", "iDenfy: underage", "manual review
  // requested". Surfaced in admin UI for audit/context only; never shown
  // to the user themselves.
  verificationFlagReason?: string

  // Snapshot of the restorable bonusEligibility a user had immediately before
  // an admin flagged them 'requires_verification'. Lets clearing the flag
  // restore prior KYC ('verified'/'grandfathered') or purchase/admin-granted
  // ('eligible') status instead of silently dropping them to undefined. Only
  // set while a flag is active; cleared when the flag is cleared.
  previousBonusEligibility?: 'verified' | 'grandfathered' | 'eligible'

  // Prize-drawing (cash raffle) eligibility — independent of bonusEligibility so
  // a user can be eligible for one but not the other (e.g. eligible for bonuses
  // but barred from prize drawings, or vice versa).
  // 'eligible' = may enter prize drawings
  // 'ineligible' = barred from prize drawings
  // undefined = derive from identity verification (default; preserves prior behavior
  //   where entering a drawing required verification)
  prizeEligibility?: 'eligible' | 'ineligible'

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
  // If true, suppress all in-app store-review prompts.
  optOutAppReviewPrompts?: boolean

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
 * @deprecated Phone verification is no longer the primary identity/trust gate.
 * Use isIdentityVerified(), hasFullBonusAccess(), or hasAccountTrustSignal()
 * depending on the product capability being checked.
 */
export const humanish = (user: User) => user.verifiedPhone !== false

// Identity-verified (KYC via iDenfy) or grandfathered. This is the
// prize-worthy set: only these users may enter cash raffles.
export const isIdentityVerified = (user: User) =>
  user.bonusEligibility === 'verified' ||
  user.bonusEligibility === 'grandfathered'

// Admin/system flag requiring identity verification before bonuses are
// restored.
export const isBonusVerificationRequired = (user: User) =>
  user.bonusEligibility === 'requires_verification'

// Explicitly blocked from full bonus access. Use getEffectiveTier() for scaled
// bonus payouts, because the blocked states still receive a reduced or zero
// tier-specific amount depending on bonus type.
export const isBonusBlocked = (user: User) =>
  user.bonusEligibility === 'ineligible' || isBonusVerificationRequired(user)

// Full bonus/perk access: every account that hasn't been explicitly flagged or
// bonus-blocked — verification is not required. This is for binary bonus/perk
// gates (push bonus, league prizes, perp bonuses), not prize drawings and not
// social anti-spam gates.
export const hasFullBonusAccess = (user: User) => !isBonusBlocked(user)

// Explicit account trust signal: identity-verified/grandfathered, purchase- or
// admin-granted ('eligible'), purchased mana, or an active subscription. Lets a
// new account skip the new-account social gate (canPostSocially). Not a bonus
// gate and not a prize gate.
export const hasAccountTrustSignal = (user: User) =>
  isIdentityVerified(user) ||
  user.bonusEligibility === 'eligible' ||
  user.purchasedMana === true ||
  isSupporter(user.entitlements)

/**
 * @deprecated Use hasFullBonusAccess(), isIdentityVerified(),
 * canEnterPrizeDrawings(), getEffectiveTier(), or hasAccountTrustSignal()
 * depending on the capability being checked.
 */
export const canReceiveBonuses = hasFullBonusAccess

// Check if user can enter prize drawings (cash raffles) — the one surface that
// still requires identity verification. Independent of bonus eligibility: an
// explicit prizeEligibility overrides, otherwise it derives from IDENTITY
// VERIFICATION (not full bonus access, which every account has by default).
export const canEnterPrizeDrawings = (user: User) =>
  user.prizeEligibility === 'eligible'
    ? true
    : user.prizeEligibility === 'ineligible'
    ? false
    : isIdentityVerified(user)

// Resolve a user's effective tier (restricted | reduced | free | basic | plus | premium).
// Subscribers always get their subscription tier regardless of KYC status.
export const getEffectiveTier = (user: User): EffectiveTier =>
  resolveEffectiveTier({
    entitlements: user.entitlements,
    bonusEligibility: user.bonusEligibility,
  })

// New-account social gate: how long after signup before an account without a
// trust signal can comment on other people's markets and posts, create posts,
// send DMs, or create unlisted markets. Verifying, buying mana, or subscribing
// unlocks these early — besides prize drawings, the only thing verification
// still unlocks.
export const NEW_USER_COMMENT_GATE_MS = 7 * DAY_MS

// Users past the new-account social gate. Pass-through for:
//   - users with a trust signal (identity/grandfathered, bonus-granted,
//     purchased mana, or active subscription)
//   - accounts ≥ NEW_USER_COMMENT_GATE_MS old
// Market creators commenting on their own markets bypass this check (handled at call site).
export const canPostSocially = (user: User) =>
  hasAccountTrustSignal(user) ||
  Date.now() - user.createdTime >= NEW_USER_COMMENT_GATE_MS

// expires: sep 26th, ~530pm PT
const LIMITED_TIME_DEAL_END = 1727311753233 + DAY_MS
export const introductoryTimeWindow = (user: User) =>
  Math.max(
    LIMITED_TIME_DEAL_END,
    (user.sweepstakesVerifiedTime ?? user.createdTime) + 8 * HOUR_MS
  )
