// Trophy system — milestone-based achievements with 7 progressive tiers.
// Definitions follow the SHOP_ITEMS pattern: in-code array as single source of truth.

export const TROPHY_TIERS = [
  'gray',
  'green',
  'blue',
  'purple',
  'crimson',
  'gold',
  'prismatic',
] as const
export type TrophyTier = (typeof TROPHY_TIERS)[number]

export const TROPHY_TIER_INDEX: Record<TrophyTier, number> = {
  gray: 0,
  green: 1,
  blue: 2,
  purple: 3,
  crimson: 4,
  gold: 5,
  prismatic: 6,
}

export const TROPHY_TIER_STYLES: Record<
  TrophyTier,
  { gradient: string; label: string; textColor: string }
> = {
  gray: {
    gradient: 'from-zinc-400 to-zinc-500',
    label: 'Gray',
    textColor: 'text-zinc-500',
  },
  green: {
    gradient: 'from-emerald-400 to-emerald-600',
    label: 'Green',
    textColor: 'text-emerald-500',
  },
  blue: {
    gradient: 'from-sky-400 to-blue-600',
    label: 'Blue',
    textColor: 'text-blue-500',
  },
  purple: {
    gradient: 'from-violet-400 to-purple-600',
    label: 'Purple',
    textColor: 'text-violet-500',
  },
  crimson: {
    gradient: 'from-red-500 to-rose-700',
    label: 'Crimson',
    textColor: 'text-red-500',
  },
  gold: {
    gradient: 'from-amber-400 to-yellow-600',
    label: 'Gold',
    textColor: 'text-amber-500',
  },
  prismatic: {
    gradient: 'from-pink-400 via-cyan-400 to-yellow-400',
    label: 'Prismatic',
    textColor: 'text-transparent bg-clip-text bg-gradient-to-r from-pink-400 via-cyan-400 to-yellow-400',
  },
}

export type TrophyCategory =
  | 'trading'
  | 'creating'
  | 'social'
  | 'community'
  | 'prestige'

// Maps to the return fields of the get-user-achievements endpoint.
export type TrophyStatKey =
  | 'longestBettingStreak'
  | 'totalMarketsCreated'
  | 'creatorTraders'
  | 'totalVolumeMana'
  | 'totalTradesCount'
  | 'totalReferrals'
  | 'numberOfComments'
  | 'profitableMarketsCount'
  | 'seasonsPlatinumOrHigher'
  | 'seasonsDiamondOrHigher'
  | 'seasonsMasters'
  | 'accountAgeYears'
  | 'charityDonatedMana'
  | 'modTicketsResolved'

// Maps TrophyStatKey to the rank key in RanksType (for percentile display).
export const STAT_KEY_TO_RANK_KEY: Record<TrophyStatKey, string> = {
  longestBettingStreak: 'longestBettingStreak',
  totalMarketsCreated: 'marketsCreated',
  creatorTraders: 'creatorTraders',
  totalVolumeMana: 'volume',
  totalTradesCount: 'trades',
  totalReferrals: 'totalReferrals',
  numberOfComments: 'comments',
  profitableMarketsCount: 'profitableMarkets',
  seasonsPlatinumOrHigher: 'seasonsPlatinumOrHigher',
  seasonsDiamondOrHigher: 'seasonsDiamondOrHigher',
  seasonsMasters: 'seasonsMasters',
  accountAgeYears: 'accountAge',
  charityDonatedMana: 'charityDonated',
  modTicketsResolved: 'modTickets',
}

export type TrophyTierConfig = {
  tier: TrophyTier
  threshold: number
  // Reward fields — Phase 2, not used yet:
  manaReward?: number
  streakFreezes?: number
  shopUnlocks?: string[]
}

export type TrophyDefinition = {
  id: string
  name: string
  description: string
  statKey: TrophyStatKey
  category: TrophyCategory
  tiers: TrophyTierConfig[]
  /** Format string for displaying the stat value. Supports {value}. */
  valueFormat?: string
}

export type UserTrophyProgress = {
  trophyId: string
  currentValue: number
  highestClaimedTier: TrophyTier | null
  lastClaimedTime: number | null
}

// ---------------------------------------------------------------------------
// Trophy definitions
// ---------------------------------------------------------------------------

export const TROPHY_DEFINITIONS: TrophyDefinition[] = [
  // ── Trading ──
  {
    id: 'trophy-prediction-streak',
    name: 'Prediction Streak',
    description: 'Maintain a daily prediction streak',
    statKey: 'longestBettingStreak',
    category: 'trading',
    valueFormat: '{value} days',
    tiers: [
      { tier: 'gray', threshold: 7 },
      { tier: 'green', threshold: 14 },
      { tier: 'blue', threshold: 30 },
      { tier: 'purple', threshold: 60 },
      { tier: 'crimson', threshold: 100 },
      { tier: 'gold', threshold: 200 },
      { tier: 'prismatic', threshold: 365 },
    ],
  },
  {
    id: 'trophy-whale',
    name: 'Whale',
    description: 'Accumulate trading volume',
    statKey: 'totalVolumeMana',
    category: 'trading',
    tiers: [
      { tier: 'gray', threshold: 500 },
      { tier: 'green', threshold: 2_000 },
      { tier: 'blue', threshold: 10_000 },
      { tier: 'purple', threshold: 50_000 },
      { tier: 'crimson', threshold: 100_000 },
      { tier: 'gold', threshold: 500_000 },
      { tier: 'prismatic', threshold: 1_000_000 },
    ],
  },
  {
    id: 'trophy-high-frequency',
    name: 'High Frequency',
    description: 'Place predictions across markets',
    statKey: 'totalTradesCount',
    category: 'trading',
    valueFormat: '{value} trades',
    tiers: [
      { tier: 'gray', threshold: 25 },
      { tier: 'green', threshold: 100 },
      { tier: 'blue', threshold: 500 },
      { tier: 'purple', threshold: 1_000 },
      { tier: 'crimson', threshold: 5_000 },
      { tier: 'gold', threshold: 10_000 },
      { tier: 'prismatic', threshold: 50_000 },
    ],
  },
  {
    id: 'trophy-sharp-trader',
    name: 'Sharp Trader',
    description: 'Profit on resolved markets',
    statKey: 'profitableMarketsCount',
    category: 'trading',
    valueFormat: '{value} markets',
    tiers: [
      { tier: 'gray', threshold: 5 },
      { tier: 'green', threshold: 10 },
      { tier: 'blue', threshold: 25 },
      { tier: 'purple', threshold: 50 },
      { tier: 'crimson', threshold: 100 },
      { tier: 'gold', threshold: 250 },
      { tier: 'prismatic', threshold: 500 },
    ],
  },

  // ── Creating ──
  {
    id: 'trophy-market-maker',
    name: 'Market Maker',
    description: 'Create prediction markets',
    statKey: 'totalMarketsCreated',
    category: 'creating',
    valueFormat: '{value} markets',
    tiers: [
      { tier: 'gray', threshold: 5 },
      { tier: 'green', threshold: 10 },
      { tier: 'blue', threshold: 25 },
      { tier: 'purple', threshold: 50 },
      { tier: 'crimson', threshold: 100 },
      { tier: 'gold', threshold: 250 },
      { tier: 'prismatic', threshold: 500 },
    ],
  },
  {
    id: 'trophy-fan-favorite',
    name: 'Fan Favorite',
    description: 'Attract unique traders to your markets',
    statKey: 'creatorTraders',
    category: 'creating',
    valueFormat: '{value} traders',
    tiers: [
      { tier: 'gray', threshold: 10 },
      { tier: 'green', threshold: 50 },
      { tier: 'blue', threshold: 100 },
      { tier: 'purple', threshold: 500 },
      { tier: 'crimson', threshold: 1_000 },
      { tier: 'gold', threshold: 5_000 },
      { tier: 'prismatic', threshold: 10_000 },
    ],
  },

  // ── Social ──
  {
    id: 'trophy-recruiter',
    name: 'Recruiter',
    description: 'Refer new users to Manifold',
    statKey: 'totalReferrals',
    category: 'social',
    valueFormat: '{value} referrals',
    tiers: [
      { tier: 'gray', threshold: 3 },
      { tier: 'green', threshold: 10 },
      { tier: 'blue', threshold: 25 },
      { tier: 'purple', threshold: 50 },
      { tier: 'crimson', threshold: 100 },
      { tier: 'gold', threshold: 250 },
      { tier: 'prismatic', threshold: 500 },
    ],
  },
  {
    id: 'trophy-chatterbox',
    name: 'Chatterbox',
    description: 'Post comments across the platform',
    statKey: 'numberOfComments',
    category: 'social',
    valueFormat: '{value} comments',
    tiers: [
      { tier: 'gray', threshold: 5 },
      { tier: 'green', threshold: 25 },
      { tier: 'blue', threshold: 50 },
      { tier: 'purple', threshold: 100 },
      { tier: 'crimson', threshold: 500 },
      { tier: 'gold', threshold: 1_000 },
      { tier: 'prismatic', threshold: 5_000 },
    ],
  },

  // ── Community ──
  {
    id: 'trophy-philanthropist',
    name: 'Philanthropist',
    description: 'Donate to charity through Manifold',
    statKey: 'charityDonatedMana',
    category: 'community',
    tiers: [
      { tier: 'gray', threshold: 500 },
      { tier: 'green', threshold: 2_000 },
      { tier: 'blue', threshold: 10_000 },
      { tier: 'purple', threshold: 25_000 },
      { tier: 'crimson', threshold: 50_000 },
      { tier: 'gold', threshold: 100_000 },
      { tier: 'prismatic', threshold: 250_000 },
    ],
  },
  {
    id: 'trophy-sheriff',
    name: 'Sheriff',
    description: 'Help moderate the community',
    statKey: 'modTicketsResolved',
    category: 'community',
    valueFormat: '{value} tickets',
    tiers: [
      { tier: 'gray', threshold: 5 },
      { tier: 'green', threshold: 10 },
      { tier: 'blue', threshold: 25 },
      { tier: 'purple', threshold: 50 },
      { tier: 'crimson', threshold: 100 },
      { tier: 'gold', threshold: 250 },
      { tier: 'prismatic', threshold: 500 },
    ],
  },

  // ── Prestige ──
  {
    id: 'trophy-platinum-plus',
    name: 'Platinum+',
    description: 'Finish league seasons at Platinum or higher',
    statKey: 'seasonsPlatinumOrHigher',
    category: 'prestige',
    valueFormat: '{value} seasons',
    tiers: [
      { tier: 'gray', threshold: 1 },
      { tier: 'green', threshold: 2 },
      { tier: 'blue', threshold: 3 },
      { tier: 'purple', threshold: 5 },
      { tier: 'crimson', threshold: 7 },
      { tier: 'gold', threshold: 10 },
      { tier: 'prismatic', threshold: 15 },
    ],
  },
  {
    id: 'trophy-diamond-plus',
    name: 'Diamond+',
    description: 'Finish league seasons at Diamond or higher',
    statKey: 'seasonsDiamondOrHigher',
    category: 'prestige',
    valueFormat: '{value} seasons',
    tiers: [
      { tier: 'gray', threshold: 1 },
      { tier: 'green', threshold: 2 },
      { tier: 'blue', threshold: 3 },
      { tier: 'purple', threshold: 5 },
      { tier: 'crimson', threshold: 7 },
      { tier: 'gold', threshold: 10 },
      { tier: 'prismatic', threshold: 15 },
    ],
  },
  {
    id: 'trophy-masters',
    name: 'Masters',
    description: 'Finish league seasons at Masters',
    statKey: 'seasonsMasters',
    category: 'prestige',
    valueFormat: '{value} seasons',
    tiers: [
      { tier: 'gray', threshold: 1 },
      { tier: 'green', threshold: 2 },
      { tier: 'blue', threshold: 3 },
      { tier: 'purple', threshold: 5 },
      { tier: 'crimson', threshold: 7 },
      { tier: 'gold', threshold: 10 },
    ],
  },
  {
    id: 'trophy-veteran',
    name: 'Veteran',
    description: 'Be a member of the Manifold community',
    statKey: 'accountAgeYears',
    category: 'prestige',
    tiers: [
      { tier: 'gray', threshold: 0.5 },
      { tier: 'green', threshold: 1 },
      { tier: 'blue', threshold: 2 },
      { tier: 'purple', threshold: 3 },
      { tier: 'crimson', threshold: 4 },
      { tier: 'gold', threshold: 5 },
      { tier: 'prismatic', threshold: 7 },
    ],
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const getTrophyDefinition = (id: string): TrophyDefinition | undefined =>
  TROPHY_DEFINITIONS.find((t) => t.id === id)

export const getTrophyTierConfig = (
  trophyId: string,
  tier: TrophyTier
): TrophyTierConfig | undefined => {
  const def = getTrophyDefinition(trophyId)
  return def?.tiers.find((t) => t.tier === tier)
}

/** Get the next unclaimed tier for a trophy, given the highest claimed tier (or null). */
export const getNextUnclaimedTier = (
  trophyId: string,
  highestClaimedTier: TrophyTier | null
): TrophyTierConfig | null => {
  const def = getTrophyDefinition(trophyId)
  if (!def) return null
  if (highestClaimedTier === null) return def.tiers[0] ?? null
  const claimedIdx = TROPHY_TIER_INDEX[highestClaimedTier]
  const nextIdx = claimedIdx + 1
  return def.tiers.find((t) => TROPHY_TIER_INDEX[t.tier] === nextIdx) ?? null
}

/** Check if a specific tier is claimable given the current value and claimed state. */
export const isTierClaimable = (
  tier: TrophyTierConfig,
  currentValue: number,
  highestClaimedTier: TrophyTier | null
): boolean => {
  const claimedIdx = highestClaimedTier
    ? TROPHY_TIER_INDEX[highestClaimedTier]
    : -1
  const tierIdx = TROPHY_TIER_INDEX[tier.tier]
  return tierIdx === claimedIdx + 1 && currentValue >= tier.threshold
}

/** Get all claimable tiers (not just the next one — user may have skipped claiming). */
export const getClaimableTiers = (
  trophyId: string,
  currentValue: number,
  highestClaimedTier: TrophyTier | null
): TrophyTierConfig[] => {
  const def = getTrophyDefinition(trophyId)
  if (!def) return []
  const claimedIdx = highestClaimedTier
    ? TROPHY_TIER_INDEX[highestClaimedTier]
    : -1
  // Only the immediately next tier is claimable (sequential claiming)
  const nextTier = def.tiers.find(
    (t) => TROPHY_TIER_INDEX[t.tier] === claimedIdx + 1
  )
  if (nextTier && currentValue >= nextTier.threshold) return [nextTier]
  return []
}

/** Count total claimable tiers across all trophies for a user. */
export const countClaimableTiers = (
  progressList: UserTrophyProgress[]
): number => {
  let count = 0
  for (const p of progressList) {
    count += getClaimableTiers(
      p.trophyId,
      p.currentValue,
      p.highestClaimedTier
    ).length
  }
  return count
}

/** Format a trophy stat value for display. */
export const formatTrophyValue = (
  def: TrophyDefinition,
  value: number
): string => {
  if (def.statKey === 'totalVolumeMana' || def.statKey === 'charityDonatedMana') {
    if (value >= 1_000_000) return `M$${(value / 1_000_000).toFixed(1)}M`
    if (value >= 1_000) return `M$${(value / 1_000).toFixed(1)}K`
    return `M$${Math.floor(value)}`
  }
  if (def.statKey === 'accountAgeYears') {
    const years = Math.floor(value)
    const months = Math.round((value - years) * 12)
    if (years === 0) return `${months}mo`
    if (months === 0) return `${years}yr`
    return `${years}yr ${months}mo`
  }
  if (def.valueFormat) {
    return def.valueFormat.replace('{value}', formatNumber(value))
  }
  return formatNumber(value)
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(Math.floor(n))
}

/** Compute progress fraction toward the next tier (0-1). Returns 1 if all tiers claimed. */
export const getProgressFraction = (
  def: TrophyDefinition,
  currentValue: number,
  highestClaimedTier: TrophyTier | null
): number => {
  const nextTier = getNextUnclaimedTier(def.id, highestClaimedTier)
  if (!nextTier) return highestClaimedTier ? 1 : 0
  const prevThreshold = highestClaimedTier
    ? def.tiers.find((t) => t.tier === highestClaimedTier)?.threshold ?? 0
    : 0
  const range = nextTier.threshold - prevThreshold
  if (range <= 0) return 0
  return Math.min((currentValue - prevThreshold) / range, 1)
}

/** Count total claimed tiers across all trophies. */
export const countClaimedTiers = (
  progressList: UserTrophyProgress[]
): number => {
  let count = 0
  for (const p of progressList) {
    if (!p.highestClaimedTier) continue
    count += TROPHY_TIER_INDEX[p.highestClaimedTier] + 1
  }
  return count
}

/** Total possible tiers across all trophy definitions. */
export const getTotalPossibleTiers = (): number =>
  TROPHY_DEFINITIONS.reduce((sum, d) => sum + d.tiers.length, 0)

/** Category emoji for display. */
export const CATEGORY_EMOJI: Record<TrophyCategory, string> = {
  trading: '\u{1F4C8}',   // 📈
  creating: '\u{1F3D7}',  // 🏗️ (close: construction)
  social: '\u{1F91D}',    // 🤝
  community: '\u{2764}',  // ❤️
  prestige: '\u{2B50}',   // ⭐
}
