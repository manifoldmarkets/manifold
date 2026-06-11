import { UserEntitlement } from './shop/types'
import { HOUR_MS } from './util/time'

// ============================================
// SUPPORTER TIER SYSTEM
// ============================================

// Grace period for auto-renewing memberships.
// The renewal scheduler runs daily, so memberships that expire between runs
// would briefly appear as lapsed. This grace period keeps auto-renewing
// memberships active until the scheduler processes them.
const RENEWAL_GRACE_PERIOD_MS = 25 * HOUR_MS

export type SupporterTier = 'basic' | 'plus' | 'premium'

export const SUPPORTER_TIERS: Record<
  SupporterTier,
  {
    id: string
    name: string
    displayName: string
    price: number
    color: string
    textColor: string
    bgColor: string
    borderColor: string
    order: number
  }
> = {
  basic: {
    id: 'supporter-basic',
    name: 'Plus',
    displayName: 'Manifold Plus',
    price: 500,
    color: 'gray',
    textColor: 'text-gray-500',
    bgColor: 'bg-gray-100 dark:bg-gray-800/50',
    borderColor: 'border-gray-400',
    order: 1,
  },
  plus: {
    id: 'supporter-plus',
    name: 'Pro',
    displayName: 'Manifold Pro',
    price: 2500,
    color: 'indigo',
    textColor: 'text-indigo-500',
    bgColor: 'bg-indigo-100 dark:bg-indigo-900/30',
    borderColor: 'border-indigo-400',
    order: 2,
  },
  premium: {
    id: 'supporter-premium',
    name: 'Premium',
    displayName: 'Manifold Premium',
    price: 10000,
    color: 'amber',
    textColor: 'text-amber-500',
    bgColor: 'bg-amber-100 dark:bg-amber-900/30',
    borderColor: 'border-amber-400',
    order: 3,
  },
}

// All supporter entitlement IDs for queries
export const SUPPORTER_ENTITLEMENT_IDS = [
  'supporter-basic',
  'supporter-plus',
  'supporter-premium',
] as const

// ============================================
// EFFECTIVE TIER (verification + subscription combined)
// ============================================
//
// A user's effective tier determines which benefits and bonus multipliers they
// receive. Subscribers always get their subscription tier regardless of
// verification. Verification (KYC) is required only for the prize drawing —
// not for receiving bonuses.
//
// Tier ladder (low → high): unverified < verified < basic (Plus) < plus (Pro) < premium

export type EffectiveTier =
  | 'restricted' // admin-flagged (requires_verification): earns NO bonuses
  | 'unverified'
  | 'verified'
  | SupporterTier // 'basic' | 'plus' | 'premium'

export const EFFECTIVE_TIER_ORDER: EffectiveTier[] = [
  'restricted',
  'unverified',
  'verified',
  'basic',
  'plus',
  'premium',
]

// ============================================
// CENTRAL BENEFITS CONFIG - MODIFY VALUES HERE
// ============================================
//
// Single source of truth for every per-tier benefit, keyed by effective tier.
// The bonus multipliers (quest/streak/referral/unique-trader) live here next to
// the subscription perks — there is no separate multiplier table. Read bonus
// multipliers via getEffectiveBonusMultiplier (verification-aware) and
// subscription perks via getBenefit (subscription-only). SUPPORTER_BENEFITS is
// just the subscriber subset of this, derived below so the two can't drift.

type TierBenefits = {
  // Bonus multipliers — verification-aware (unverified earns reduced amounts).
  questMultiplier: number
  streakMultiplier: number
  referralMultiplier: number
  uniqueTraderMultiplier: number
  // Subscription perks — same for all non-subscribers (unverified + verified).
  shopDiscount: number
  maxStreakFreezes: number // Max purchasable streak freezes (non-supporters: 1)
  badgeAnimation: boolean // Animated star badge on hovercard for Premium
  freeLoanRate: number // Daily free loan percentage (0.01 = 1%)
  marginLoanAccess: boolean // Whether user can request margin loans
  maxLoanNetWorthPercent: number // Max loan as % of net worth (1.0 = 100% = 2x leverage)
}

// Perks shared by every non-subscriber; subscriber tiers override these.
const NON_SUBSCRIBER_PERKS = {
  shopDiscount: 0,
  maxStreakFreezes: 1, // unverified baseline (verified overrides to 2 below)
  badgeAnimation: false,
  freeLoanRate: 0.01, // 1%
  marginLoanAccess: false,
  maxLoanNetWorthPercent: 1.0, // 100% = 2x leverage (if they had access)
}

export const TIER_BENEFITS: Record<EffectiveTier, TierBenefits> = {
  // Admin-flagged users (bonusEligibility = 'requires_verification'): earn ZERO
  // on the farmable bonuses (quest/streak/referral) until they verify — distinct
  // from 'unverified' (brand-new users), who still earn a reduced 0.2x. The
  // EXCEPTION is the unique-trader bonus, which still pays in full: it rewards a
  // creator for attracting *real* unique traders (who already passed bot/API/
  // redemption gates), so the abuse vector is narrow even for a flagged account.
  restricted: {
    ...NON_SUBSCRIBER_PERKS,
    questMultiplier: 0,
    streakMultiplier: 0,
    referralMultiplier: 0,
    uniqueTraderMultiplier: 1,
  },
  unverified: {
    ...NON_SUBSCRIBER_PERKS,
    questMultiplier: 0.2,
    streakMultiplier: 0.2,
    // Unverified users earn a reduced 0.2x referral bonus (matching quest/
    // streak) rather than zero — a genuine referral still rewards them.
    // Verifying or subscribing unlocks the full amount.
    referralMultiplier: 0.2,
    // Unverified creators get half the unique-trader bonus instead of zero.
    // 0.5 (vs 0.2 for quest/streak) because the unique-trader bonus is the
    // creator's payoff for attracting *real* unique users — those users
    // already passed bot/API/redemption gates, so the abuse vector is
    // narrower than self-driven streak/quest farming.
    uniqueTraderMultiplier: 0.5,
  },
  verified: {
    ...NON_SUBSCRIBER_PERKS,
    questMultiplier: 1,
    streakMultiplier: 1,
    referralMultiplier: 1,
    uniqueTraderMultiplier: 1,
    maxStreakFreezes: 2, // verified stores one more than unverified (1)
  },
  basic: {
    questMultiplier: 1.5,
    streakMultiplier: 1.5, // mirrors quest
    referralMultiplier: 1,
    uniqueTraderMultiplier: 1, // unique-trader doesn't scale with subscription
    shopDiscount: 0,
    maxStreakFreezes: 3, // Plus
    badgeAnimation: false,
    freeLoanRate: 0.01, // 1% (same as free users)
    marginLoanAccess: true,
    maxLoanNetWorthPercent: 1.0, // 100% = 2x leverage
  },
  plus: {
    questMultiplier: 2,
    streakMultiplier: 2,
    referralMultiplier: 1.5,
    uniqueTraderMultiplier: 1,
    shopDiscount: 0.05,
    maxStreakFreezes: 5, // Pro
    badgeAnimation: false,
    freeLoanRate: 0.02, // 2%
    marginLoanAccess: true,
    maxLoanNetWorthPercent: 2.0, // 200% = 3x leverage
  },
  premium: {
    questMultiplier: 3,
    streakMultiplier: 3,
    referralMultiplier: 2,
    uniqueTraderMultiplier: 1,
    shopDiscount: 0.1,
    maxStreakFreezes: 10, // Premium
    badgeAnimation: true,
    freeLoanRate: 0.03, // 3%
    marginLoanAccess: true,
    maxLoanNetWorthPercent: 3.0, // 300% = 4x leverage
  },
}

// Subscriber subset of TIER_BENEFITS. Kept as a named export because lots of
// UI / backend code reads it directly; derived so it can't drift from the
// source above.
export const SUPPORTER_BENEFITS: Record<SupporterTier, TierBenefits> = {
  basic: TIER_BENEFITS.basic,
  plus: TIER_BENEFITS.plus,
  premium: TIER_BENEFITS.premium,
}

// ============================================
// HELPER FUNCTIONS
// ============================================

// Get user's current supporter tier (null if not supporter)
export function getUserSupporterTier(
  entitlements: UserEntitlement[] | undefined
): SupporterTier | null {
  if (!entitlements) return null

  const now = Date.now()

  // Check tiers in reverse order (premium first) to get highest active tier
  for (const tier of ['premium', 'plus', 'basic'] as const) {
    const entitlement = entitlements.find(
      (e) => e.entitlementId === SUPPORTER_TIERS[tier].id
    )
    if (entitlement && entitlement.enabled) {
      if (!entitlement.expiresTime || entitlement.expiresTime > now) {
        return tier
      }
      // Auto-renewing memberships get a grace period so they don't lapse
      // between expiration and the next scheduler run
      if (
        entitlement.autoRenew &&
        entitlement.expiresTime > now - RENEWAL_GRACE_PERIOD_MS
      ) {
        return tier
      }
    }
  }

  return null
}

// Get specific benefit value for a user. Subscription-only / verification-
// agnostic: non-subscribers get the 'verified' baseline. For verification-aware
// bonus multipliers (unverified earns less) use getEffectiveBonusMultiplier.
export function getBenefit<K extends keyof TierBenefits>(
  entitlements: UserEntitlement[] | undefined,
  benefit: K,
  defaultValue?: TierBenefits[K]
): TierBenefits[K] {
  const tier = getUserSupporterTier(entitlements)
  if (!tier) {
    if (defaultValue !== undefined) return defaultValue
    return TIER_BENEFITS.verified[benefit]
  }
  return SUPPORTER_BENEFITS[tier][benefit]
}

// Check if user is any tier of supporter
export function isSupporter(
  entitlements: UserEntitlement[] | undefined
): boolean {
  return getUserSupporterTier(entitlements) !== null
}

// Check if user was ever a supporter (has any supporter entitlement, even expired)
export function wasEverSupporter(
  entitlements: UserEntitlement[] | undefined
): boolean {
  if (!entitlements) return false
  return entitlements.some((e) =>
    SUPPORTER_ENTITLEMENT_IDS.includes(e.entitlementId as any)
  )
}

// Check if user can upgrade from current tier to target tier
export function canUpgradeTo(
  current: SupporterTier | null,
  target: SupporterTier
): boolean {
  if (!current) return true // Non-supporter can subscribe to any tier
  return SUPPORTER_TIERS[target].order > SUPPORTER_TIERS[current].order
}

// Get the supporter entitlement for a user (if any)
export function getSupporterEntitlement(
  entitlements: UserEntitlement[] | undefined
): UserEntitlement | null {
  if (!entitlements) return null

  const now = Date.now()

  // Check tiers in reverse order to get highest active tier's entitlement
  for (const tier of ['premium', 'plus', 'basic'] as const) {
    const entitlement = entitlements.find(
      (e) => e.entitlementId === SUPPORTER_TIERS[tier].id
    )
    if (entitlement && entitlement.enabled) {
      if (!entitlement.expiresTime || entitlement.expiresTime > now) {
        return entitlement
      }
      if (
        entitlement.autoRenew &&
        entitlement.expiresTime > now - RENEWAL_GRACE_PERIOD_MS
      ) {
        return entitlement
      }
    }
  }

  return null
}

// Get tier info for display
export function getTierInfo(tier: SupporterTier) {
  return SUPPORTER_TIERS[tier]
}

// All tiers in order (for iteration)
export const TIER_ORDER: SupporterTier[] = ['basic', 'plus', 'premium']

// Resolve a user's effective tier from their subscription + verification state.
// Pure: callers pass in the bits we need so this file doesn't need to import User.
export function resolveEffectiveTier(args: {
  entitlements: UserEntitlement[] | undefined
  // Accepts the full User.bonusEligibility union (unless they have a
  // subscription, which always wins). 'eligible' (purchaser / admin-granted)
  // earns at the 'verified' tier alongside verified/grandfathered.
  // 'requires_verification' (admin-flagged) maps to the 'restricted' tier and
  // earns ZERO bonuses. 'ineligible' (KYC-failed) and undefined (brand-new)
  // both fall to 'unverified' (reduced 0.2x).
  bonusEligibility:
    | 'verified'
    | 'grandfathered'
    | 'eligible'
    | 'ineligible'
    | 'requires_verification'
    | undefined
}): EffectiveTier {
  const subTier = getUserSupporterTier(args.entitlements)
  if (subTier) return subTier
  if (
    args.bonusEligibility === 'verified' ||
    args.bonusEligibility === 'grandfathered' ||
    args.bonusEligibility === 'eligible'
  ) {
    return 'verified'
  }
  // Admin-flagged (suspected alt / manual review): earns NO bonuses until they
  // verify. 'ineligible' (KYC-failed) deliberately stays 'unverified' (0.2x).
  if (args.bonusEligibility === 'requires_verification') {
    return 'restricted'
  }
  return 'unverified'
}

export function getEffectiveBonusMultiplier(
  tier: EffectiveTier,
  kind: 'quest' | 'streak' | 'referral' | 'uniqueTrader'
): number {
  const b = TIER_BENEFITS[tier]
  if (kind === 'quest') return b.questMultiplier
  if (kind === 'streak') return b.streakMultiplier
  if (kind === 'uniqueTrader') return b.uniqueTraderMultiplier
  return b.referralMultiplier
}

// Round a tier-scaled bonus to the nearest 0.01 mana. Multipliers can be
// fractional (e.g. 0.2x, 0.5x, 1.5x), so flooring would silently round small
// bonuses down to zero (e.g. a future M$3 base × 0.2 = M$0.6 → floor 0). Use
// this everywhere a bonus is multiplied by an effective-tier multiplier.
export function roundTierBonus(amount: number): number {
  return Math.round(amount * 100) / 100
}

// Display labels for the membership page tier column headers and inline upsells.
export const EFFECTIVE_TIER_LABELS: Record<EffectiveTier, string> = {
  restricted: 'Flagged',
  unverified: 'Unverified',
  verified: 'Verified',
  basic: SUPPORTER_TIERS.basic.name, // 'Plus'
  plus: SUPPORTER_TIERS.plus.name, // 'Pro'
  premium: SUPPORTER_TIERS.premium.name, // 'Premium'
}

// Get max streak freezes for a user based on their effective tier.
// Unverified: 1, Verified: 2, Plus: 3, Pro: 5, Premium: 10.
// Pass bonusEligibility so the unverified/verified split is honored — without
// it, non-subscribers default to the unverified (lowest) cap.
export function getMaxStreakFreezes(
  entitlements: UserEntitlement[] | undefined,
  bonusEligibility?:
    | 'verified'
    | 'grandfathered'
    | 'eligible'
    | 'ineligible'
    | 'requires_verification'
): number {
  const tier = resolveEffectiveTier({ entitlements, bonusEligibility })
  return TIER_BENEFITS[tier].maxStreakFreezes
}

// Get free loan rate for a user based on their tier
// Free users: 1%, Plus: 1%, Pro: 2%, Premium: 3%
export function getFreeLoanRate(
  entitlements: UserEntitlement[] | undefined
): number {
  return getBenefit(entitlements, 'freeLoanRate')
}

// Check if user can access margin loans (all supporter tiers)
export function canAccessMarginLoans(
  entitlements: UserEntitlement[] | undefined
): boolean {
  return getBenefit(entitlements, 'marginLoanAccess')
}

// Get max loan as percentage of net worth based on tier
// Plus: 100% (2x leverage), Pro: 200% (3x), Premium: 300% (4x)
export function getMaxLoanNetWorthPercent(
  entitlements: UserEntitlement[] | undefined
): number {
  return getBenefit(entitlements, 'maxLoanNetWorthPercent')
}

// Check if user's subscription is cancelled (has entitlement but auto_renew is false)
export function isSubscriptionCancelled(
  entitlement: UserEntitlement | null
): boolean {
  return entitlement !== null && !entitlement.autoRenew
}

// ============================================
// BENEFIT DISPLAY DEFINITIONS (for UI)
// ============================================

export const BENEFIT_DEFINITIONS = [
  {
    id: 'quests',
    icon: '🎯',
    title: 'Quest Rewards',
    description: 'Multiplied mana from daily and weekly quests',
    getValueForTier: (tier: SupporterTier) =>
      `${SUPPORTER_BENEFITS[tier].questMultiplier}x`,
    baseValue: '1x',
    unverifiedValue: `${TIER_BENEFITS.unverified.questMultiplier}x`,
  },
  {
    id: 'referrals',
    icon: '👥',
    title: 'Referral Bonus',
    description: 'Multiplied mana when you refer new users',
    getValueForTier: (tier: SupporterTier) =>
      `${SUPPORTER_BENEFITS[tier].referralMultiplier}x`,
    baseValue: '1x',
    unverifiedValue: `${TIER_BENEFITS.unverified.referralMultiplier}x`,
  },
  {
    id: 'shop',
    icon: '💎',
    title: 'Shop Discount',
    description: 'Save on merch and cosmetics',
    getValueForTier: (tier: SupporterTier) => {
      const discount = SUPPORTER_BENEFITS[tier].shopDiscount
      return discount === 0 ? '-' : `${Math.round(discount * 100)}%`
    },
    baseValue: '-',
  },
  {
    id: 'streaks',
    icon: '❄️',
    title: 'Streak Freeze Storage',
    description: 'How many streak freezes you can hold',
    getValueForTier: (tier: SupporterTier) =>
      `${SUPPORTER_BENEFITS[tier].maxStreakFreezes}`,
    baseValue: `${TIER_BENEFITS.verified.maxStreakFreezes}`,
    unverifiedValue: `${TIER_BENEFITS.unverified.maxStreakFreezes}`,
  },
  {
    id: 'freeLoan',
    icon: '💰',
    title: 'Daily Free Loan',
    description: 'Interest-free daily loan percentage',
    getValueForTier: (tier: SupporterTier) =>
      `${Math.round(SUPPORTER_BENEFITS[tier].freeLoanRate * 100)}%`,
    baseValue: '1%',
  },
  {
    id: 'marginLoan',
    icon: '🏦',
    title: 'Margin Loans',
    description: 'Access to interest-bearing margin loans',
    getValueForTier: (tier: SupporterTier) =>
      SUPPORTER_BENEFITS[tier].marginLoanAccess ? '✓' : '-',
    baseValue: '-',
  },
  {
    id: 'maxLeverage',
    icon: '📈',
    title: 'Max Leverage',
    description: 'Maximum loan as percentage of net worth',
    getValueForTier: (tier: SupporterTier) => {
      const percent = SUPPORTER_BENEFITS[tier].maxLoanNetWorthPercent
      const leverage = percent + 1 // 100% loan = 2x leverage
      return `${leverage}x`
    },
    baseValue: '2x',
  },
  {
    id: 'badge',
    icon: '⭐',
    title: 'Member Badge',
    description: 'Star badge next to your name',
    getValueForTier: () => '✓',
    baseValue: '-',
    isUniform: true,
  },
]
