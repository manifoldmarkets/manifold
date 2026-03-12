// Trophy system — each trophy has named milestones with unique identities
// Data source: `get-user-achievements` API (no new backend needed)

// ---------------------------------------------------------------------------
// Tier colors (visual progression)
// ---------------------------------------------------------------------------

export type TrophyTier =
  | 'green'
  | 'blue'
  | 'purple'
  | 'crimson'
  | 'gold'
  | 'prismatic'

export const TROPHY_TIER_STYLES: Record<
  TrophyTier,
  { gradient: string; textColor: string; label: string; bgTint: string }
> = {
  green: {
    gradient: 'from-emerald-400 to-emerald-600',
    textColor: 'text-emerald-600',
    label: 'Green',
    bgTint: 'bg-emerald-50 dark:bg-emerald-950/20',
  },
  blue: {
    gradient: 'from-sky-400 to-blue-600',
    textColor: 'text-blue-600',
    label: 'Blue',
    bgTint: 'bg-blue-50 dark:bg-blue-950/20',
  },
  purple: {
    gradient: 'from-violet-400 to-purple-600',
    textColor: 'text-violet-600',
    label: 'Purple',
    bgTint: 'bg-violet-50 dark:bg-violet-950/20',
  },
  crimson: {
    gradient: 'from-red-500 to-rose-700',
    textColor: 'text-red-600',
    label: 'Crimson',
    bgTint: 'bg-red-50 dark:bg-red-950/20',
  },
  gold: {
    gradient: 'from-amber-400 to-yellow-600',
    textColor: 'text-amber-600',
    label: 'Gold',
    bgTint: 'bg-amber-50 dark:bg-amber-950/20',
  },
  prismatic: {
    gradient: 'from-pink-400 via-cyan-400 to-yellow-400',
    textColor: 'text-purple-600',
    label: 'Prismatic',
    bgTint: 'bg-gradient-to-br from-pink-50/50 via-cyan-50/50 to-yellow-50/50',
  },
}

// ---------------------------------------------------------------------------
// Trophy definition types
// ---------------------------------------------------------------------------

export type TrophyMilestone = {
  name: string // "Minnow", "Big Fish", "Shark", "Whale"
  emoji: string // unique per milestone
  threshold: number // stat value required
  tier: TrophyTier // controls gradient/colors
}

export type TrophyCategory = 'trading' | 'creating' | 'social' | 'prestige'

export const CATEGORY_LABELS: Record<TrophyCategory, string> = {
  trading: 'Trading',
  creating: 'Creating',
  social: 'Social',
  prestige: 'Prestige',
}

export const CATEGORY_ORDER: TrophyCategory[] = [
  'trading',
  'creating',
  'social',
  'prestige',
]

export type TrophyDefinition = {
  id: string
  label: string // short display name for the trophy line
  description: string // one-line explainer shown on the card
  category: TrophyCategory
  statKey: string // maps to get-user-achievements field
  unit: string // "mana", "days", "markets", etc.
  milestones: TrophyMilestone[] // ordered low→high
}

// ---------------------------------------------------------------------------
// Trophy definitions — each with uniquely named milestones
// ---------------------------------------------------------------------------

export const TROPHY_DEFINITIONS: TrophyDefinition[] = [
  // --- Trading ---
  {
    id: 'trading-volume',
    label: 'Trading Volume',
    description: 'Total mana wagered across all your trades',
    category: 'trading',
    statKey: 'totalVolumeMana',
    unit: 'mana',
    milestones: [
      { name: 'Minnow', emoji: '\u{1F41F}', threshold: 100_000, tier: 'green' },
      { name: 'Big Fish', emoji: '\u{1F420}', threshold: 500_000, tier: 'blue' },
      { name: 'Shark', emoji: '\u{1F988}', threshold: 2_000_000, tier: 'purple' },
      { name: 'Orca', emoji: '\u{1F42C}', threshold: 10_000_000, tier: 'crimson' },
      { name: 'Whale', emoji: '\u{1F433}', threshold: 50_000_000, tier: 'gold' },
      { name: 'Leviathan', emoji: '\u{1F30A}', threshold: 200_000_000, tier: 'prismatic' },
    ],
  },
  {
    id: 'total-trades',
    label: 'Trades Placed',
    description: 'Number of individual trades you\'ve made',
    category: 'trading',
    statKey: 'totalTradesCount',
    unit: 'trades',
    milestones: [
      { name: 'Dabbler', emoji: '\u{1F3B2}', threshold: 50, tier: 'green' },
      { name: 'Regular', emoji: '\u{1F4CA}', threshold: 250, tier: 'blue' },
      { name: 'Hustler', emoji: '\u{1F4B9}', threshold: 1_000, tier: 'purple' },
      { name: 'Machine', emoji: '\u{2699}', threshold: 5_000, tier: 'crimson' },
      { name: 'Terminator', emoji: '\u{1F916}', threshold: 25_000, tier: 'gold' },
      { name: 'Singularity', emoji: '\u{1F300}', threshold: 100_000, tier: 'prismatic' },
    ],
  },
  {
    id: 'prediction-streak',
    label: 'Prediction Streak',
    description: 'Longest streak of consecutive days placing a bet',
    category: 'trading',
    statKey: 'longestBettingStreak',
    unit: 'days',
    milestones: [
      { name: 'Spark', emoji: '\u{2728}', threshold: 14, tier: 'green' },
      { name: 'Ember', emoji: '\u{1F525}', threshold: 30, tier: 'blue' },
      { name: 'Blaze', emoji: '\u{1F525}', threshold: 60, tier: 'purple' },
      { name: 'Inferno', emoji: '\u{1F30B}', threshold: 100, tier: 'crimson' },
      { name: 'Phoenix', emoji: '\u{1F426}\u{200D}\u{1F525}', threshold: 200, tier: 'gold' },
      { name: 'Eternal Flame', emoji: '\u{2600}', threshold: 365, tier: 'prismatic' },
    ],
  },
  {
    id: 'profitable-markets',
    label: 'Profitable Markets',
    description: 'Markets where you walked away with a profit',
    category: 'trading',
    statKey: 'profitableMarketsCount',
    unit: 'markets',
    milestones: [
      { name: 'Lucky', emoji: '\u{1F340}', threshold: 10, tier: 'green' },
      { name: 'Sharp', emoji: '\u{1F52A}', threshold: 50, tier: 'blue' },
      { name: 'Oracle', emoji: '\u{1F52E}', threshold: 200, tier: 'purple' },
      { name: 'Clairvoyant', emoji: '\u{1F441}', threshold: 500, tier: 'gold' },
      { name: 'Omniscient', emoji: '\u{1F31F}', threshold: 1_000, tier: 'prismatic' },
    ],
  },

  // --- Creating ---
  {
    id: 'markets-created',
    label: 'Markets Created',
    description: 'Questions you\'ve created for the community to trade on',
    category: 'creating',
    statKey: 'totalMarketsCreated',
    unit: 'markets',
    milestones: [
      { name: 'Apprentice', emoji: '\u{1F528}', threshold: 5, tier: 'green' },
      { name: 'Builder', emoji: '\u{1F3D7}', threshold: 25, tier: 'blue' },
      { name: 'Architect', emoji: '\u{1F3DB}', threshold: 100, tier: 'purple' },
      { name: 'City Planner', emoji: '\u{1F306}', threshold: 500, tier: 'gold' },
      { name: 'World Builder', emoji: '\u{1F30D}', threshold: 1_000, tier: 'prismatic' },
    ],
  },
  {
    id: 'creator-traders',
    label: 'Creator Popularity',
    description: 'Unique traders who\'ve bet on your markets',
    category: 'creating',
    statKey: 'creatorTraders',
    unit: 'unique traders',
    milestones: [
      { name: 'Unknown', emoji: '\u{1F464}', threshold: 50, tier: 'green' },
      { name: 'Notable', emoji: '\u{1F465}', threshold: 250, tier: 'blue' },
      { name: 'Famous', emoji: '\u{2B50}', threshold: 1_000, tier: 'purple' },
      { name: 'Legendary', emoji: '\u{1F31F}', threshold: 5_000, tier: 'gold' },
      { name: 'Celebrity', emoji: '\u{1F451}', threshold: 10_000, tier: 'prismatic' },
    ],
  },

  // --- Social ---
  {
    id: 'comments',
    label: 'Comments',
    description: 'Comments you\'ve written that received likes',
    category: 'social',
    statKey: 'numberOfComments',
    unit: 'comments',
    milestones: [
      { name: 'Chatterbox', emoji: '\u{1F4AC}', threshold: 50, tier: 'green' },
      { name: 'Debater', emoji: '\u{1F5E3}', threshold: 250, tier: 'blue' },
      { name: 'Pundit', emoji: '\u{1F4E3}', threshold: 1_000, tier: 'purple' },
      { name: 'Influencer', emoji: '\u{1F4E2}', threshold: 5_000, tier: 'gold' },
      { name: 'Voice of the People', emoji: '\u{1F3A4}', threshold: 10_000, tier: 'prismatic' },
    ],
  },
  {
    id: 'referrals',
    label: 'Referrals',
    description: 'People who joined Manifold through your invite',
    category: 'social',
    statKey: 'totalReferrals',
    unit: 'referrals',
    milestones: [
      { name: 'Networker', emoji: '\u{1F91D}', threshold: 5, tier: 'green' },
      { name: 'Recruiter', emoji: '\u{1F4E8}', threshold: 25, tier: 'blue' },
      { name: 'Ambassador', emoji: '\u{1F3C5}', threshold: 100, tier: 'purple' },
      { name: 'Evangelist', emoji: '\u{1F4E1}', threshold: 250, tier: 'gold' },
    ],
  },
  {
    id: 'charity-donated',
    label: 'Charity Donations',
    description: 'Mana donated to charity through Manifold for Good',
    category: 'social',
    statKey: 'charityDonatedMana',
    unit: 'mana',
    milestones: [
      { name: 'Donor', emoji: '\u{1F49A}', threshold: 1_000, tier: 'green' },
      { name: 'Patron', emoji: '\u{1F49C}', threshold: 10_000, tier: 'blue' },
      { name: 'Philanthropist', emoji: '\u{2764}', threshold: 50_000, tier: 'purple' },
      { name: 'Benefactor', emoji: '\u{1F496}', threshold: 250_000, tier: 'gold' },
      { name: 'Saint', emoji: '\u{1F607}', threshold: 1_000_000, tier: 'prismatic' },
    ],
  },

  // --- Prestige ---
  {
    id: 'masters-seasons',
    label: 'Masters Seasons',
    description: 'League seasons where you reached the Masters division',
    category: 'prestige',
    statKey: 'seasonsMasters',
    unit: 'seasons',
    milestones: [
      { name: 'Contender', emoji: '\u{1F94A}', threshold: 1, tier: 'blue' },
      { name: 'Champion', emoji: '\u{1F3C6}', threshold: 3, tier: 'purple' },
      { name: 'Dynasty', emoji: '\u{1F451}', threshold: 5, tier: 'gold' },
      { name: 'GOAT', emoji: '\u{1F410}', threshold: 8, tier: 'prismatic' },
    ],
  },
  {
    id: 'account-age',
    label: 'Account Age',
    description: 'How long you\'ve been a member of Manifold',
    category: 'prestige',
    statKey: 'accountAgeYears',
    unit: 'years',
    milestones: [
      { name: 'Newcomer', emoji: '\u{1F331}', threshold: 0, tier: 'green' },
      { name: 'Established', emoji: '\u{1F333}', threshold: 2, tier: 'blue' },
      { name: 'Veteran', emoji: '\u{1F396}', threshold: 3, tier: 'purple' },
      { name: 'Elder', emoji: '\u{1F3DB}', threshold: 4, tier: 'gold' },
      { name: 'Founding Member', emoji: '\u{1F3DB}', threshold: 5, tier: 'prismatic' },
    ],
  },
]

// ---------------------------------------------------------------------------
// Computed progress (client-side from get-user-achievements data)
// ---------------------------------------------------------------------------

export type ComputedTrophyProgress = {
  trophyId: string
  currentValue: number
  highestMilestone: TrophyMilestone | null // null = no milestones reached
  nextMilestone: TrophyMilestone | null // null = max reached or no milestones
}

/** Returns the highest milestone reached for a given value */
export function getHighestMilestone(
  def: TrophyDefinition,
  value: number
): TrophyMilestone | null {
  let highest: TrophyMilestone | null = null
  for (const m of def.milestones) {
    if (value >= m.threshold) highest = m
    else break // milestones are ordered low→high
  }
  return highest
}

/** Returns the next milestone after the current highest */
export function getNextMilestone(
  def: TrophyDefinition,
  highestMilestone: TrophyMilestone | null
): TrophyMilestone | null {
  if (!highestMilestone) return def.milestones[0] ?? null
  const idx = def.milestones.indexOf(highestMilestone)
  return def.milestones[idx + 1] ?? null
}

/** Progress fraction toward the next milestone (0–1) */
export function getProgressFraction(
  def: TrophyDefinition,
  value: number,
  highestMilestone: TrophyMilestone | null
): number {
  const next = getNextMilestone(def, highestMilestone)
  if (!next) return 1 // max reached
  const prevThreshold = highestMilestone?.threshold ?? 0
  const range = next.threshold - prevThreshold
  if (range <= 0) return 1
  return Math.min((value - prevThreshold) / range, 1)
}

/** Compute trophy progress for all definitions from achievement stats */
export function computeAllTrophyProgress(
  stats: Record<string, unknown>
): ComputedTrophyProgress[] {
  return TROPHY_DEFINITIONS.map((def) => {
    const value = Number(stats[def.statKey]) || 0
    const highestMilestone = getHighestMilestone(def, value)
    const nextMilestone = getNextMilestone(def, highestMilestone)
    return {
      trophyId: def.id,
      currentValue: value,
      highestMilestone,
      nextMilestone,
    }
  })
}

/** Count total milestones reached across all trophies */
export function countReachedMilestones(
  progressList: ComputedTrophyProgress[]
): number {
  let count = 0
  for (const p of progressList) {
    if (!p.highestMilestone) continue
    const def = TROPHY_DEFINITIONS.find((d) => d.id === p.trophyId)
    if (!def) continue
    const idx = def.milestones.indexOf(p.highestMilestone)
    count += idx + 1
  }
  return count
}

/** Total possible milestones across all trophies */
export function getTotalPossibleMilestones(): number {
  return TROPHY_DEFINITIONS.reduce((sum, d) => sum + d.milestones.length, 0)
}

/** Format a value for display based on trophy unit */
export function formatTrophyValue(def: TrophyDefinition, value: number): string {
  if (def.unit === 'mana') {
    if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
    if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`
    return value.toLocaleString()
  }
  if (def.unit === 'years') {
    return `${value.toFixed(1)}yr`
  }
  return value.toLocaleString()
}
