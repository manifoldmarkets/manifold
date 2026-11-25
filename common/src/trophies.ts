// Trophies: named milestones on a user's long-running stats (net worth, trades,
// streaks, markets created...). Users claim a milestone once they reach it,
// keep it forever, and can pin trophies to their profile.
//
// The stats come from `get-user-achievements`, apart from the "Getting
// started" trophies, whose stats `get-user-trophies` counts live. Claims live
// in `user_trophy_milestones`, one row per claimed milestone. The server is
// the authority on what can be claimed (claim-trophy recomputes the stat); the
// helpers here are shared so the web shows the same answer.
//
// Starter accounts can collect a one-time reward for Newcomer and each
// "Getting started" milestone. All accounts can claim Newcomer.

import { minBy, sortBy } from 'lodash'
import { ENV } from 'common/envs/constants'
import {
  EffectiveTier,
  getEffectiveBonusMultiplier,
  roundTierBonus,
} from 'common/supporter-config'

export type TrophyTier =
  | 'green'
  | 'blue'
  | 'purple'
  | 'crimson'
  | 'gold'
  | 'prismatic'

// Best first.
export const TROPHY_TIER_ORDER: TrophyTier[] = [
  'prismatic',
  'gold',
  'crimson',
  'purple',
  'blue',
  'green',
]

export type TrophyMilestone = {
  // Stored in user_trophy_milestones.milestone_id. Never change an id once
  // shipped; rename `name` instead.
  id: string
  name: string
  emoji: string
  threshold: number
  tier: TrophyTier
  // One-time base reward before any reduction for account standing.
  // Only onboarding milestones pay, and only to starter accounts.
  rewardMana?: number
}

export type TrophyCategory =
  | 'starter'
  | 'trading'
  | 'creating'
  | 'social'
  | 'prestige'

export const CATEGORY_LABELS: Record<TrophyCategory, string> = {
  starter: 'Getting started',
  trading: 'Trading',
  creating: 'Creating',
  social: 'Social',
  prestige: 'Prestige',
}

export const CATEGORY_ORDER: TrophyCategory[] = [
  'starter',
  'trading',
  'creating',
  'social',
  'prestige',
]

// Stats of the "Getting started" trophies, counted live by get-user-trophies
// from the account's first bets (see getStarterStats in backend/api). The
// unit is a market-day: a market and Pacific day in which the account's buys,
// not via the API and in a mana market, add up to M10 or more.
// - starterTrades: market-days, so buying and selling the same market again
//   the same day does not count again
// - starterMarkets: distinct markets among them
// - starterDays: distinct days among them
export const STARTER_STAT_KEYS = [
  'starterTrades',
  'starterMarkets',
  'starterDays',
] as const
export type StarterStatKey = (typeof STARTER_STAT_KEYS)[number]
export type StarterStats = Record<StarterStatKey, number>
export const STARTER_MIN_TRADE_AMOUNT = 10

// Accounts created at or after this time get the "Getting started" trophies.
// null switches them off: they are hidden, and claim-trophy refuses them.
// The reward amounts below are placeholders until this is set for prod.
const STARTER_TROPHIES_START_TIMES: Record<typeof ENV, number | null> = {
  PROD: null,
  DEV: Date.UTC(2026, 10, 1),
}
export const STARTER_TROPHIES_START_TIME: number | null =
  STARTER_TROPHIES_START_TIMES[ENV] ?? null

export function isStarterTrophyAccount(
  accountCreatedTime: number,
  startTime: number | null = STARTER_TROPHIES_START_TIME
): boolean {
  return (
    startTime !== null &&
    Number.isFinite(accountCreatedTime) &&
    accountCreatedTime >= startTime
  )
}

export const MARKET_CREATED_MIN_TRADERS = 10
export const REFERRAL_MIN_TRADES = 10
export const NET_WORTH_RANK_ACTIVE_DAYS = 90
export const NET_WORTH_SNAPSHOT_MAX_AGE_HOURS = 72

// Live achievement fields and starter stats used by the trophy ladders.
export const TROPHY_STAT_KEYS = [
  ...STARTER_STAT_KEYS,
  'peakNetWorth',
  'totalTradesCount',
  'longestBettingStreak',
  'resolvedProfitableMarkets',
  'marketsCreatedWithTraders',
  'creatorTraders',
  'likedComments',
  'referredTraders',
  'charityDonatedMana',
  'leagueLevel',
  'accountAgeYears',
] as const
export type TrophyStatKey = (typeof TROPHY_STAT_KEYS)[number]
export type TrophyStats = Partial<Record<TrophyStatKey, number>>

export type TrophyDefinition = {
  // Stored in user_trophy_milestones.trophy_id. Never change once shipped.
  id: string
  label: string
  description: string
  category: TrophyCategory
  statKey: TrophyStatKey
  unit: string
  formatPrefix?: string // e.g. "$", shown before the value instead of the unit
  milestones: TrophyMilestone[] // ascending thresholds
} & ({ ranked: true; rankNote: string } | { ranked?: false; rankNote?: string })

// Compact milestone constructor so each milestone fits on one line.
const m = (
  id: string,
  name: string,
  emoji: string,
  threshold: number,
  tier: TrophyTier,
  rewardMana?: number
): TrophyMilestone =>
  rewardMana === undefined
    ? { id, name, emoji, threshold, tier }
    : { id, name, emoji, threshold, tier, rewardMana }

export const TROPHY_DEFINITIONS: TrophyDefinition[] = [
  // --- Getting started (new accounts only; each milestone pays once) ---
  {
    id: 'starter-trades',
    label: 'First Trades',
    description:
      'Trades of M10 or more, counting each market once a day. Each milestone pays mana once',
    category: 'starter',
    statKey: 'starterTrades',
    unit: 'trades',
    milestones: [
      m('first-trade', 'First Trade', '\u{1F423}', 1, 'green', 50),
      m('hat-trick', 'Hat Trick', '\u{1F3A9}', 3, 'green', 50),
      m('getting-going', 'Getting Going', '\u{1F6B2}', 10, 'blue', 100),
      m('in-the-groove', 'In the Groove', '\u{1F3B6}', 25, 'purple', 150),
    ],
  },
  {
    id: 'starter-markets',
    label: 'Markets Explored',
    description:
      'Different markets you have traded M10 or more in on a day. Each milestone pays mana once',
    category: 'starter',
    statKey: 'starterMarkets',
    unit: 'markets',
    milestones: [
      m('curious', 'Curious', '\u{1F9ED}', 3, 'green', 50),
      m('explorer', 'Explorer', '\u{1F5FA}', 10, 'blue', 100),
    ],
  },
  {
    id: 'starter-days',
    label: 'Days Active',
    description:
      'Days you traded M10 or more in a market. Each milestone pays mana once',
    category: 'starter',
    statKey: 'starterDays',
    unit: 'days',
    milestones: [
      m('back-again', 'Back Again', '\u{1F44B}', 2, 'green', 100),
      m('three-days', 'Three Days', '\u{1F4C5}', 3, 'green', 100),
      m('full-week', 'Full Week', '\u{1F5D3}', 7, 'blue', 150),
    ],
  },

  {
    id: 'net-worth',
    label: 'Net Worth',
    description:
      'Your highest portfolio snapshot value (mana balance plus open positions), checked nightly',
    category: 'trading',
    statKey: 'peakNetWorth',
    unit: 'mana',
    ranked: true,
    rankNote: `Ranked nightly by net worth from a snapshot at most ${NET_WORTH_SNAPSHOT_MAX_AGE_HOURS} hours old. You must have placed a trade in the last ${NET_WORTH_RANK_ACTIVE_DAYS} days or have an open limit order on a market that is still trading`,
    milestones: [
      m('minnow', 'Minnow', '\u{1F41F}', 2_500, 'green'),
      m('goldfish', 'Goldfish', '\u{1F421}', 10_000, 'blue'),
      m('swordfish', 'Swordfish', '\u{1F420}', 25_000, 'purple'),
      m('shark', 'Shark', '\u{1F988}', 100_000, 'crimson'),
      m('orca', 'Orca', '\u{1F42C}', 250_000, 'gold'),
      m('whale', 'Whale', '\u{1F433}', 500_000, 'prismatic'),
    ],
  },
  {
    id: 'total-trades',
    label: 'Trades Placed',
    description:
      "Trades you've placed. A limit order counts once, when it first fills; API trades don't count",
    category: 'trading',
    statKey: 'totalTradesCount',
    unit: 'trades',
    milestones: [
      m('rookie', 'Rookie', '\u{1F3AF}', 10, 'green'),
      m('regular', 'Regular', '\u{1F4CA}', 100, 'blue'),
      m('hustler', 'Hustler', '\u{1F4B9}', 500, 'purple'),
      m('grinder', 'Grinder', '\u{26CF}', 2_500, 'crimson'),
      m('machine', 'Machine', '\u{2699}', 10_000, 'gold'),
      m('terminator', 'Terminator', '\u{1F916}', 25_000, 'prismatic'),
    ],
  },
  {
    id: 'prediction-streak',
    label: 'Prediction Streak',
    description: 'Longest streak of consecutive days placing a bet',
    category: 'trading',
    statKey: 'longestBettingStreak',
    unit: 'days',
    ranked: true,
    rankNote: 'Ranked nightly by longest prediction streak',
    milestones: [
      m('spark', 'Spark', '\u{2728}', 7, 'green'),
      m('ember', 'Ember', '\u{1F525}', 30, 'blue'),
      m('blaze', 'Blaze', '\u{1F4A5}', 100, 'purple'),
      m('inferno', 'Inferno', '\u{1F30B}', 365, 'crimson'),
      m('eternal-flame', 'Eternal Flame', '\u{2600}', 730, 'gold'),
      m('phoenix', 'Phoenix', '\u{1F426}\u{200D}\u{1F525}', 1_000, 'prismatic'),
    ],
  },
  {
    id: 'profitable-markets',
    label: 'Profitable Markets',
    description:
      "Resolved markets where you made a profit. Cancelled markets don't count",
    category: 'trading',
    statKey: 'resolvedProfitableMarkets',
    unit: 'markets',
    ranked: true,
    rankNote:
      'Ranked nightly by profitable resolved markets, excluding cancellations',
    milestones: [
      m('lucky', 'Lucky', '\u{1F340}', 10, 'green'),
      m('savvy', 'Savvy', '\u{1F9E0}', 50, 'blue'),
      m('sharp', 'Sharp', '\u{1F52A}', 250, 'purple'),
      m('sage', 'Sage', '\u{1F9D9}', 500, 'crimson'),
      m('clairvoyant', 'Clairvoyant', '\u{1F441}', 1_000, 'gold'),
      m('oracle', 'Oracle', '\u{1F52E}', 2_000, 'prismatic'),
    ],
  },
  {
    id: 'markets-created',
    label: 'Markets Created',
    description:
      "Public markets you created with at least 10 traders (polls and bounties don't count)",
    category: 'creating',
    statKey: 'marketsCreatedWithTraders',
    unit: 'markets',
    ranked: true,
    rankNote:
      'Ranked nightly by public mana markets created with at least 10 traders',
    milestones: [
      m('apprentice', 'Apprentice', '\u{1F528}', 1, 'green'),
      m('journeyman', 'Journeyman', '\u{1F6E0}', 3, 'blue'),
      m('builder', 'Builder', '\u{1F3D7}', 10, 'purple'),
      m('architect', 'Architect', '\u{1F4D0}', 25, 'crimson'),
      m('city-planner', 'City Planner', '\u{1F306}', 100, 'gold'),
      m('titan', 'Titan', '\u{1F3D4}', 250, 'prismatic'),
    ],
  },
  {
    id: 'creator-traders',
    label: 'Creator Popularity',
    // creatorTraders adds up each market's unique bettors, so someone who
    // trades on three of your markets counts three times.
    description: 'Traders on your markets, counted once per market',
    category: 'creating',
    statKey: 'creatorTraders',
    unit: 'traders',
    ranked: true,
    rankNote:
      'Ranked nightly by traders on your markets, counted once per market',
    milestones: [
      m('noticed', 'Noticed', '\u{1F440}', 10, 'green'),
      m('recognized', 'Recognized', '\u{1F44B}', 150, 'blue'),
      m('notable', 'Notable', '\u{1F465}', 500, 'purple'),
      m('popular', 'Popular', '\u{1F4E2}', 1_500, 'crimson'),
      m('famous', 'Famous', '\u{2B50}', 3_000, 'gold'),
      m('icon', 'Icon', '\u{1F3AC}', 12_000, 'prismatic'),
    ],
  },
  {
    id: 'liked-comments',
    label: 'Liked Comments',
    description: 'Your comments that someone else liked',
    category: 'social',
    statKey: 'likedComments',
    unit: 'comments',
    ranked: true,
    rankNote: 'Ranked nightly by distinct comments liked by other people',
    milestones: [
      m('well-said', 'Well Said', '\u{1F44D}', 1, 'green'),
      m('conversationalist', 'Conversationalist', '\u{1F4AD}', 10, 'blue'),
      m('debater', 'Debater', '\u{1F5E3}', 50, 'purple'),
      m('commentator', 'Commentator', '\u{1F4DD}', 150, 'crimson'),
      m('influencer', 'Influencer', '\u{1F4F0}', 400, 'gold'),
      m('pundit', 'Pundit', '\u{1F4E3}', 1_000, 'prismatic'),
    ],
  },
  {
    id: 'leagues',
    label: 'Leagues',
    description:
      'Your best league seasons: Gold, Platinum and Diamond, then seasons in Masters',
    category: 'prestige',
    statKey: 'leagueLevel',
    unit: 'league',
    ranked: true,
    rankNote: 'Ranked nightly by best division and number of Masters seasons',
    milestones: [
      m('gold-season', 'Gold Season', '\u{1F947}', 1, 'green'),
      m('platinum-season', 'Platinum Season', '\u{2B50}', 2, 'blue'),
      m('diamond-season', 'Diamond Season', '\u{1F48E}', 3, 'purple'),
      m('contender', 'Contender', '\u{1F94A}', 4, 'crimson'),
      m('champion', 'Champion', '\u{1F3C6}', 6, 'gold'),
      m('goat', 'GOAT', '\u{1F410}', 11, 'prismatic'),
    ],
  },
  {
    id: 'referrals',
    label: 'Referrals',
    description: 'People you invited who went on to make 10 or more trades',
    category: 'social',
    statKey: 'referredTraders',
    unit: 'referrals',
    ranked: false,
    rankNote: 'Ranked nightly by invited people who made at least 10 trades',
    milestones: [
      m('networker', 'Networker', '\u{1F91D}', 1, 'green'),
      m('connector', 'Connector', '\u{1F517}', 3, 'blue'),
      m('recruiter', 'Recruiter', '\u{1F4E8}', 5, 'purple'),
      m('evangelist', 'Evangelist', '\u{1F4E1}', 10, 'crimson'),
      m('pied-piper', 'Pied Piper', '\u{1F3B5}', 25, 'gold'),
      m('ambassador', 'Ambassador', '\u{1F3C7}', 50, 'prismatic'),
    ],
  },
  {
    id: 'account-age',
    label: 'Account Age',
    description: "How long you've been a member of Manifold",
    category: 'prestige',
    statKey: 'accountAgeYears',
    unit: 'years',
    milestones: [
      m('newcomer', 'Newcomer', '\u{1F331}', 0, 'green', 25),
      m('established', 'Established', '\u{1F333}', 1, 'blue'),
      m('veteran', 'Veteran', '\u{1F396}', 2, 'purple'),
      m('elder', 'Elder', '\u{1F474}', 3, 'crimson'),
      m('old-guard', 'Old Guard', '\u{1F6E1}', 4, 'gold'),
      m(
        'founding-member',
        'Founding Member',
        '\u{1F3DB}\u{FE0F}',
        5,
        'prismatic'
      ),
    ],
  },
  {
    id: 'charity-donated',
    label: 'Legacy Charity',
    description:
      'Dollars donated through the original Manifold for Charity program',
    category: 'social',
    statKey: 'charityDonatedMana',
    unit: 'donated',
    formatPrefix: '$',
    milestones: [
      m('donor', 'Donor', '\u{1F49A}', 10, 'green'),
      m('supporter', 'Supporter', '\u{1F499}', 50, 'blue'),
      m('patron', 'Patron', '\u{1F49C}', 100, 'purple'),
      m('philanthropist', 'Philanthropist', '\u{2764}', 250, 'crimson'),
      m('humanitarian', 'Humanitarian', '\u{1F49B}', 500, 'gold'),
      m('benefactor', 'Benefactor', '\u{1F496}', 1_000, 'prismatic'),
    ],
  },
]

const DEFINITIONS_BY_ID = new Map(TROPHY_DEFINITIONS.map((d) => [d.id, d]))

export const RANKED_TROPHY_DEFINITIONS = TROPHY_DEFINITIONS.filter(
  (def) => def.ranked
)

export type TrophyRankTier = 'super' | 'mega' | 'crown'
export const MAX_TROPHY_RANK = 25
export const TROPHY_RANK_TIERS = [
  { tier: 'crown', maxRank: 1, prefix: '#1' },
  { tier: 'mega', maxRank: 5, prefix: 'Mega' },
  { tier: 'super', maxRank: MAX_TROPHY_RANK, prefix: 'Super' },
] as const

export type TrophyRank = { trophyId: string; rank: number; value: number }
export type TrophyRankPeak = { trophyId: string; bestRank: number }

export function getTrophyRankTier(
  rank: number | null | undefined
): TrophyRankTier | null {
  if (rank == null || !Number.isInteger(rank) || rank < 1) return null
  return TROPHY_RANK_TIERS.find((tier) => rank <= tier.maxRank)?.tier ?? null
}

export const getTopMilestone = (def: TrophyDefinition) =>
  def.milestones[def.milestones.length - 1]

export function getTrophyRankTitle(
  def: TrophyDefinition,
  tier: TrophyRankTier
) {
  const { prefix } = TROPHY_RANK_TIERS.find((t) => t.tier === tier)!
  return `${prefix} ${getTopMilestone(def).name}`
}

export function getHeldTrophyTitles(ranks: TrophyRank[]) {
  // Start in trophy order. A stable sort by rank groups the tiers and retains ties.
  const titles = RANKED_TROPHY_DEFINITIONS.flatMap((definition) => {
    const held = ranks.find((r) => r.trophyId === definition.id)
    const tier = getTrophyRankTier(held?.rank)
    return held && tier
      ? [
          {
            definition,
            tier,
            rank: held.rank,
            value: held.value,
            title: getTrophyRankTitle(definition, tier),
          },
        ]
      : []
  })
  return sortBy(titles, 'rank')
}

export const getPeakRankTier = (peaks: TrophyRankPeak[], trophyId: string) =>
  getTrophyRankTier(peaks.find((p) => p.trophyId === trophyId)?.bestRank)

// Keep this mapping identical to the leagues query in update-trophy-ranks.ts.
export function getLeagueLevel(counts: {
  seasonsGoldOrHigher: number
  seasonsPlatinumOrHigher: number
  seasonsDiamondOrHigher: number
  seasonsMasters: number
}) {
  const hasSeason = (n: number) => Number.isFinite(n) && n >= 1
  if (hasSeason(counts.seasonsMasters))
    return 3 + Math.floor(counts.seasonsMasters)
  if (hasSeason(counts.seasonsDiamondOrHigher)) return 3
  if (hasSeason(counts.seasonsPlatinumOrHigher)) return 2
  return hasSeason(counts.seasonsGoldOrHigher) ? 1 : 0
}

const leagueNames = ['No Gold season yet', 'Gold', 'Platinum', 'Diamond']
const mastersUnit = (n: number) => `Masters season${n === 1 ? '' : 's'}`

export function formatLeagueRemaining(current: number, target: number) {
  if (target <= 3) return `a ${leagueNames[target]} season`
  const remaining = Math.max(0, target - Math.max(3, current))
  return `${remaining} more ${mastersUnit(remaining)}`
}

export const isStarterTrophy = (def: TrophyDefinition) =>
  def.category === 'starter'

/** The trophies an account can earn: starter ones only for new accounts. */
export function getTrophyDefinitionsFor(
  isStarterAccount: boolean
): TrophyDefinition[] {
  return isStarterAccount
    ? TROPHY_DEFINITIONS
    : TROPHY_DEFINITIONS.filter((d) => !isStarterTrophy(d))
}

// One-time welcome rewards keep the quest reductions. Capping them at face
// value lets future members claim now without missing out on mana.
export function getTrophyRewardMultiplier(tier: EffectiveTier): number {
  const multiplier = getEffectiveBonusMultiplier(tier, 'quest')
  return Number.isFinite(multiplier) && multiplier > 0
    ? Math.min(multiplier, 1)
    : 0
}

/** Total base mana for the given milestones, before any standing reduction. */
export function getRewardManaTotal(milestones: TrophyMilestone[]): number {
  return milestones.reduce((sum, m) => {
    const reward = m.rewardMana ?? 0
    return Number.isFinite(reward) && reward > 0 ? sum + reward : sum
  }, 0)
}

/** What claiming this milestone would collect, including unpaid lower ones. */
export function getTrophyClaimReward(
  definition: TrophyDefinition,
  milestone: TrophyMilestone,
  rewarded: TrophyMilestoneRef[],
  multiplier: number
) {
  if (!Number.isFinite(multiplier) || multiplier <= 0) return 0
  const paid = getClaimedMilestoneIds(rewarded, definition.id)
  const unpaid = definition.milestones.filter(
    (m) => m.threshold <= milestone.threshold && !paid.has(m.id)
  )
  return roundTierBonus(getRewardManaTotal(unpaid) * multiplier)
}

export function getTrophyDefinition(
  trophyId: string
): TrophyDefinition | undefined {
  return DEFINITIONS_BY_ID.get(trophyId)
}

export function getMilestone(
  def: TrophyDefinition,
  milestoneId: string
): TrophyMilestone | undefined {
  return def.milestones.find((m) => m.id === milestoneId)
}

// The stat a trophy measures, from achievement stats. Missing or non-finite
// values count as zero.
export function getTrophyStatValue(
  def: TrophyDefinition,
  stats: TrophyStats
): number {
  const value = Number(stats[def.statKey])
  return Number.isFinite(value) ? value : 0
}

export function isMilestoneReached(milestone: TrophyMilestone, value: number) {
  return value >= milestone.threshold
}

/** The highest milestone reached at this stat value, or null. */
export function getHighestMilestone(
  def: TrophyDefinition,
  value: number
): TrophyMilestone | null {
  let highest: TrophyMilestone | null = null
  for (const m of def.milestones) {
    if (isMilestoneReached(m, value)) highest = m
    else break
  }
  return highest
}

/** The first milestone not yet reached at this stat value, or null at the top. */
export function getNextMilestone(
  def: TrophyDefinition,
  value: number
): TrophyMilestone | null {
  return def.milestones.find((m) => !isMilestoneReached(m, value)) ?? null
}

export type ComputedTrophyProgress = {
  trophyId: string
  currentValue: number
  highestMilestone: TrophyMilestone | null
  nextMilestone: TrophyMilestone | null
}

export function computeTrophyProgress(
  def: TrophyDefinition,
  stats: TrophyStats
): ComputedTrophyProgress {
  const currentValue = getTrophyStatValue(def, stats)
  return {
    trophyId: def.id,
    currentValue,
    highestMilestone: getHighestMilestone(def, currentValue),
    nextMilestone: getNextMilestone(def, currentValue),
  }
}

export function computeAllTrophyProgress(
  stats: TrophyStats,
  defs: TrophyDefinition[] = TROPHY_DEFINITIONS
): ComputedTrophyProgress[] {
  return defs.map((def) => computeTrophyProgress(def, stats))
}

/** Milestones reached across the given trophies. */
export function countReachedMilestones(
  stats: TrophyStats,
  defs: TrophyDefinition[] = TROPHY_DEFINITIONS
): number {
  let count = 0
  for (const def of defs) {
    const value = getTrophyStatValue(def, stats)
    count += def.milestones.filter((m) => isMilestoneReached(m, value)).length
  }
  return count
}

export function getTotalPossibleMilestones(
  defs: TrophyDefinition[] = TROPHY_DEFINITIONS
): number {
  return defs.reduce((sum, d) => sum + d.milestones.length, 0)
}

// ---------------------------------------------------------------------------
// Claims
// ---------------------------------------------------------------------------

export type TrophyClaim = {
  trophyId: string
  milestoneId: string
  claimedTime: number
}

export type TrophyMilestoneRef = { trophyId: string; milestoneId: string }

type TrophyMilestonePair = {
  definition: TrophyDefinition
  milestone: TrophyMilestone
}

export type OnboardingMilestone = TrophyMilestonePair

const starterDefinitions = TROPHY_DEFINITIONS.filter(isStarterTrophy)
const accountAge = DEFINITIONS_BY_ID.get('account-age')!
export const ONBOARDING_MILESTONES: OnboardingMilestone[] = [
  { definition: accountAge, milestone: getMilestone(accountAge, 'newcomer')! },
  ...starterDefinitions.flatMap((definition) =>
    definition.milestones.map((milestone) => ({ definition, milestone }))
  ),
]

export function getClaimableOnboardingMilestones(
  starterStats: StarterStats | null,
  claims: TrophyClaim[]
) {
  if (!starterStats) return []
  return ONBOARDING_MILESTONES.filter(
    ({ definition, milestone }) =>
      isMilestoneReached(
        milestone,
        getTrophyStatValue(definition, starterStats)
      ) &&
      !claims.some(
        (c) => c.trophyId === definition.id && c.milestoneId === milestone.id
      )
  )
}

export function getNextOnboardingMilestone(
  starterStats: StarterStats | null,
  claims: TrophyClaim[]
) {
  if (!starterStats) return null
  const candidates = starterDefinitions.flatMap((definition) => {
    const value = getTrophyStatValue(definition, starterStats)
    const claimed = getClaimedMilestoneIds(claims, definition.id)
    const milestone = definition.milestones.find(
      (m) => !isMilestoneReached(m, value) && !claimed.has(m.id)
    )
    return milestone ? [{ definition, milestone, value }] : []
  })
  return (
    minBy(candidates, ({ milestone, value }) => milestone.threshold - value) ??
    null
  )
}

const isKnownClaim = (claim: TrophyClaim) => {
  const def = getTrophyDefinition(claim.trophyId)
  return !!def && !!getMilestone(def, claim.milestoneId)
}

export function getClaimedMilestoneIds(
  claims: TrophyMilestoneRef[],
  trophyId: string
): Set<string> {
  return new Set(
    claims.filter((c) => c.trophyId === trophyId).map((c) => c.milestoneId)
  )
}

/** Highest claimed milestone of a trophy, ignoring ids no longer defined. */
export function getHighestClaimedMilestone(
  def: TrophyDefinition,
  claims: TrophyClaim[]
): TrophyMilestone | null {
  const claimed = getClaimedMilestoneIds(claims, def.id)
  let highest: TrophyMilestone | null = null
  for (const m of def.milestones) {
    if (claimed.has(m.id)) highest = m
  }
  return highest
}

/** Claimed milestones across all trophies, ignoring ids no longer defined. */
export function countClaimedMilestones(claims: TrophyClaim[]): number {
  const seen = new Set<string>()
  for (const c of claims) {
    if (isKnownClaim(c)) seen.add(`${c.trophyId}/${c.milestoneId}`)
  }
  return seen.size
}

/**
 * What claiming `milestoneId` records: that milestone and every lower one, as
 * long as the stat has reached it. Returns null if it has not been reached.
 * Already-claimed milestones are included; the insert skips them.
 */
export function getMilestonesToClaim(
  def: TrophyDefinition,
  milestoneId: string,
  value: number
): TrophyMilestone[] | null {
  const target = getMilestone(def, milestoneId)
  if (!target || !isMilestoneReached(target, value)) return null
  return def.milestones.filter((m) => m.threshold <= target.threshold)
}

/** Reached milestones not yet claimed, across the given trophies. */
export function getClaimableMilestones(
  stats: TrophyStats,
  claims: TrophyClaim[],
  defs: TrophyDefinition[] = TROPHY_DEFINITIONS
): TrophyMilestonePair[] {
  return defs.flatMap((definition) => {
    const value = getTrophyStatValue(definition, stats)
    const claimed = getClaimedMilestoneIds(claims, definition.id)
    return definition.milestones
      .filter((m) => isMilestoneReached(m, value) && !claimed.has(m.id))
      .map((milestone) => ({ definition, milestone }))
  })
}

export function countUnclaimedReachedMilestones(
  stats: TrophyStats,
  claims: TrophyClaim[],
  defs: TrophyDefinition[] = TROPHY_DEFINITIONS
): number {
  return getClaimableMilestones(stats, claims, defs).length
}

/** Show the highest new milestone per trophy. Record every new key, including
 * lower milestones and trophies represented by the summary. */
export function selectTrophyUnlockToasts(
  ready: TrophyMilestonePair[],
  seen: ReadonlySet<string>
) {
  const highest = new Map<string, TrophyMilestonePair>()
  const newKeys: string[] = []
  for (const pair of ready) {
    const { definition, milestone } = pair
    const key = `${definition.id}/${milestone.id}`
    if (seen.has(key)) continue
    newKeys.push(key)
    const previous = highest.get(definition.id)
    if (!previous || milestone.threshold > previous.milestone.threshold) {
      highest.set(definition.id, pair)
    }
  }
  const milestones = [...highest.values()].slice(0, 3)
  return { milestones, moreCount: highest.size - milestones.length, newKeys }
}

/** The moment an account created at createdTime is `years` years old, in
 * UTC, as get-user-achievements counts it (Postgres interval addition): a
 * Feb 29 signup turns one on Feb 28. */
export function getAccountAnniversaryTime(createdTime: number, years: number) {
  const d = new Date(createdTime)
  const year = d.getUTCFullYear() + years
  const month = d.getUTCMonth()
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return Date.UTC(
    year,
    month,
    Math.min(d.getUTCDate(), lastDay),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    d.getUTCMilliseconds()
  )
}

/** Milestones reached or already claimed: a claim is kept even if the stat
 * later drops below its threshold. */
export function countEarnedMilestones(
  stats: TrophyStats,
  claims: TrophyClaim[],
  defs: TrophyDefinition[] = TROPHY_DEFINITIONS
): number {
  let count = 0
  for (const def of defs) {
    const value = getTrophyStatValue(def, stats)
    const claimed = getClaimedMilestoneIds(claims, def.id)
    count += def.milestones.filter(
      (m) => isMilestoneReached(m, value) || claimed.has(m.id)
    ).length
  }
  return count
}

// ---------------------------------------------------------------------------
// Profile showcase
// ---------------------------------------------------------------------------

// Claimed milestones needed to unlock each showcase pin slot.
export const SHOWCASE_SLOT_UNLOCKS = [0, 10, 25] as const
export const MAX_SHOWCASE_PINS = SHOWCASE_SLOT_UNLOCKS.length

export function getMaxShowcasePins(claimedCount: number): number {
  return SHOWCASE_SLOT_UNLOCKS.filter((needed) => claimedCount >= needed).length
}

// The league badge is derived from the user's current league, not a claim.
export const LEAGUE_SHOWCASE_PIN = 'league'
const TROPHY_PIN_PREFIX = 'trophy-'

/** Where a milestone's badge art is served from (web/public/trophy-badges):
 * a 256 px WebP of the subject on a transparent background. */
export const getTrophyBadgeImagePath = (
  trophyId: string,
  milestoneId: string
) => `/trophy-badges/${trophyId}/${milestoneId}.webp`

export const getTrophyPinId = (trophyId: string) =>
  `${TROPHY_PIN_PREFIX}${trophyId}`

export function getTrophyIdFromPin(pin: string): string | null {
  return pin.startsWith(TROPHY_PIN_PREFIX)
    ? pin.slice(TROPHY_PIN_PREFIX.length)
    : null
}

/** Why these pins can't be saved, or null if they can. */
export function getShowcasePinsError(
  pins: string[],
  claims: TrophyClaim[]
): string | null {
  if (new Set(pins).size !== pins.length)
    return 'Each trophy can be pinned once'
  const maxPins = getMaxShowcasePins(countClaimedMilestones(claims))
  if (pins.length > maxPins) {
    return `You can pin ${maxPins} ${maxPins === 1 ? 'trophy' : 'trophies'}`
  }
  for (const pin of pins) {
    if (pin === LEAGUE_SHOWCASE_PIN) continue
    const trophyId = getTrophyIdFromPin(pin)
    const def = trophyId ? getTrophyDefinition(trophyId) : undefined
    if (!def || !getHighestClaimedMilestone(def, claims)) {
      return 'You can only pin trophies you have claimed'
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

// Rounded down by default, so a stat never shows a threshold it hasn't
// reached (9,999.75 is 9.9K, not 10K); 'up' for an amount still to go, so a
// positive gap never shows as 0.
export function formatTrophyValue(
  def: TrophyDefinition,
  value: number,
  rounding: 'down' | 'up' = 'down'
): string {
  const round = rounding === 'up' ? Math.ceil : Math.floor
  if (def.unit === 'league') {
    const level = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
    return leagueNames[level] ?? `${level - 3} ${mastersUnit(level - 3)}`
  }
  if (def.unit === 'years') return `${(round(value * 10) / 10).toFixed(1)}yr`
  // Whole numbers: volume and dollar stats come with decimals.
  const whole = round(value).toLocaleString('en-US')
  const prefix = def.formatPrefix ?? ''
  const short = (n: number, suffix: string) =>
    `${prefix}${n.toFixed(1).replace(/.0$/, '')}${suffix}`
  if (prefix || def.unit === 'mana') {
    if (value >= 1_000_000) return short(round(value / 100_000) / 10, 'M')
    if (value >= 100_000) return `${prefix}${round(value / 1_000)}K`
    if (value >= 1_000) return short(round(value / 100) / 10, 'K')
    return `${prefix}${whole}`
  }
  return whole
}
