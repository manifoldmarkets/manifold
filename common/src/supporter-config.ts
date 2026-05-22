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
// CENTRAL BENEFITS CONFIG - MODIFY VALUES HERE
// ============================================

export const SUPPORTER_BENEFITS: Record<
  SupporterTier,
  {
    questMultiplier: number
    referralMultiplier: number
    shopDiscount: number
    maxStreakFreezes: number // Max purchasable streak freezes (non-supporters: 1)
    badgeAnimation: boolean // Animated star badge on hovercard for Premium
    freeLoanRate: number // Daily free loan percentage (0.01 = 1%)
    marginLoanAccess: boolean // Whether user can request margin loans
    maxLoanNetWorthPercent: number // Max loan as % of net worth (1.0 = 100% = 2x leverage)
  }
> = {
  basic: {
    questMultiplier: 1.5,
    referralMultiplier: 1,
    shopDiscount: 0,
    maxStreakFreezes: 2, // +1 over non-supporter
    badgeAnimation: false,
    freeLoanRate: 0.01, // 1% (same as free users)
    marginLoanAccess: true,
    maxLoanNetWorthPercent: 1.0, // 100% = 2x leverage
  },
  plus: {
    questMultiplier: 2,
    referralMultiplier: 1.5,
    shopDiscount: 0.05,
    maxStreakFreezes: 3, // +2 over non-supporter
    badgeAnimation: false,
    freeLoanRate: 0.02, // 2%
    marginLoanAccess: true,
    maxLoanNetWorthPercent: 2.0, // 200% = 3x leverage
  },
  premium: {
    questMultiplier: 3,
    referralMultiplier: 2,
    shopDiscount: 0.1,
    maxStreakFreezes: 10, // +9 over non-supporter
    badgeAnimation: true,
    freeLoanRate: 0.03, // 3%
    marginLoanAccess: true,
    maxLoanNetWorthPercent: 3.0, // 300% = 4x leverage
  },
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

// Get specific benefit value for user
export function getBenefit<K extends keyof (typeof SUPPORTER_BENEFITS)['basic']>(
  entitlements: UserEntitlement[] | undefined,
  benefit: K,
  defaultValue?: (typeof SUPPORTER_BENEFITS)['basic'][K]
): (typeof SUPPORTER_BENEFITS)['basic'][K] {
  const tier = getUserSupporterTier(entitlements)
  if (!tier) {
    // Return default value or a sensible default
    if (defaultValue !== undefined) return defaultValue
    // Type-safe defaults based on benefit type (non-supporter defaults)
    const defaults: (typeof SUPPORTER_BENEFITS)['basic'] = {
      questMultiplier: 1,
      referralMultiplier: 1,
      shopDiscount: 0,
      maxStreakFreezes: 1, // Non-supporters can only store 1
      badgeAnimation: false,
      freeLoanRate: 0.01, // Free users get 1%
      marginLoanAccess: false,
      maxLoanNetWorthPercent: 1.0, // Non-supporters: 100% = 2x leverage (if they had access)
    }
    return defaults[benefit]
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

// ============================================
// EFFECTIVE TIER (verification + subscription combined)
// ============================================
//
// A user's effective tier determines which bonus multipliers they receive.
// Subscribers always get their subscription tier regardless of verification.
// Verification (KYC) is required only for the prize drawing — not for receiving bonuses.
//
// Tier ladder (low → high): unverified < verified < basic (Plus) < plus (Pro) < premium

export type EffectiveTier =
  | 'unverified'
  | 'verified'
  | SupporterTier // 'basic' | 'plus' | 'premium'

export const EFFECTIVE_TIER_ORDER: EffectiveTier[] = [
  'unverified',
  'verified',
  'basic',
  'plus',
  'premium',
]

// Bonus multipliers for quest/streak/referral/unique-trader rewards by
// effective tier. Subscriber rows for quest/referral MUST match
// SUPPORTER_BENEFITS above. Unique-trader does NOT scale with subscription
// per product decision — it's the same for verified/grandfathered/all subs.
export const EFFECTIVE_TIER_BONUS_MULTIPLIERS: Record<
  EffectiveTier,
  {
    questMultiplier: number
    streakMultiplier: number
    referralMultiplier: number
    uniqueTraderMultiplier: number
  }
> = {
  unverified: {
    questMultiplier: 0.2,
    streakMultiplier: 0.2,
    // Unverified users can't receive referral bonuses (anti-farming).
    // Verifying or subscribing unlocks referrals.
    referralMultiplier: 0,
    // Unverified creators get half the unique-trader bonus instead of zero.
    // 0.5 (vs 0.2 for quest/streak) because the unique-trader bonus is the
    // creator's payoff for attracting *real* unique users — those users
    // already passed bot/API/redemption gates, so the abuse vector is
    // narrower than self-driven streak/quest farming.
    uniqueTraderMultiplier: 0.5,
  },
  verified: {
    questMultiplier: 1,
    streakMultiplier: 1,
    referralMultiplier: 1,
    uniqueTraderMultiplier: 1,
  },
  basic: {
    questMultiplier: SUPPORTER_BENEFITS.basic.questMultiplier,
    streakMultiplier: SUPPORTER_BENEFITS.basic.questMultiplier,
    referralMultiplier: SUPPORTER_BENEFITS.basic.referralMultiplier,
    uniqueTraderMultiplier: 1,
  },
  plus: {
    questMultiplier: SUPPORTER_BENEFITS.plus.questMultiplier,
    streakMultiplier: SUPPORTER_BENEFITS.plus.questMultiplier,
    referralMultiplier: SUPPORTER_BENEFITS.plus.referralMultiplier,
    uniqueTraderMultiplier: 1,
  },
  premium: {
    questMultiplier: SUPPORTER_BENEFITS.premium.questMultiplier,
    streakMultiplier: SUPPORTER_BENEFITS.premium.questMultiplier,
    referralMultiplier: SUPPORTER_BENEFITS.premium.referralMultiplier,
    uniqueTraderMultiplier: 1,
  },
}

// Resolve a user's effective tier from their subscription + verification state.
// Pure: callers pass in the bits we need so this file doesn't need to import User.
export function resolveEffectiveTier(args: {
  entitlements: UserEntitlement[] | undefined
  bonusEligibility: 'verified' | 'grandfathered' | 'ineligible' | undefined
}): EffectiveTier {
  const subTier = getUserSupporterTier(args.entitlements)
  if (subTier) return subTier
  if (
    args.bonusEligibility === 'verified' ||
    args.bonusEligibility === 'grandfathered'
  ) {
    return 'verified'
  }
  return 'unverified'
}

export function getEffectiveBonusMultiplier(
  tier: EffectiveTier,
  kind: 'quest' | 'streak' | 'referral' | 'uniqueTrader'
): number {
  const m = EFFECTIVE_TIER_BONUS_MULTIPLIERS[tier]
  if (kind === 'quest') return m.questMultiplier
  if (kind === 'streak') return m.streakMultiplier
  if (kind === 'uniqueTrader') return m.uniqueTraderMultiplier
  return m.referralMultiplier
}

// Display labels for the membership page tier column headers and inline upsells.
export const EFFECTIVE_TIER_LABELS: Record<EffectiveTier, string> = {
  unverified: 'Unverified',
  verified: 'Verified',
  basic: SUPPORTER_TIERS.basic.name, // 'Plus'
  plus: SUPPORTER_TIERS.plus.name, // 'Pro'
  premium: SUPPORTER_TIERS.premium.name, // 'Premium'
}

// Get max streak freezes for a user based on their tier
// Non-supporters: 1, Plus: 2, Pro: 3, Premium: 5
export function getMaxStreakFreezes(
  entitlements: UserEntitlement[] | undefined
): number {
  return getBenefit(entitlements, 'maxStreakFreezes')
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
    unverifiedValue: `${EFFECTIVE_TIER_BONUS_MULTIPLIERS.unverified.questMultiplier}x`,
  },
  {
    id: 'referrals',
    icon: '👥',
    title: 'Referral Bonus',
    description: 'Multiplied mana when you refer new users',
    getValueForTier: (tier: SupporterTier) =>
      `${SUPPORTER_BENEFITS[tier].referralMultiplier}x`,
    baseValue: '1x',
    unverifiedValue: '—',
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
    baseValue: '1',
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
