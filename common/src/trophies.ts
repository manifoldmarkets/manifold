// Trophies: named milestones on a user's long-running stats (volume, trades,
// streaks, markets created...). Users claim a milestone once they reach it,
// keep it forever, and can pin trophies to their profile.
//
// The stats come from `get-user-achievements`, apart from the "Getting
// started" trophies, whose stats `get-user-trophies` counts live. Claims live
// in `user_trophy_milestones`, one row per claimed milestone. The server is
// the authority on what can be claimed (claim-trophy recomputes the stat); the
// helpers here are shared so the web shows the same answer.
//
// "Getting started" milestones pay mana once, when claimed. They exist only
// for accounts created at or after STARTER_TROPHIES_START_TIME.

import { ENV } from 'common/envs/constants'

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
  // Mana paid once when the milestone is claimed, before the claimant's tier
  // multiplier. Only "Getting started" milestones have one.
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

// Numeric fields of the get-user-achievements response that trophies use,
// plus the starter stats.
export const TROPHY_STAT_KEYS = [
  ...STARTER_STAT_KEYS,
  'totalVolumeMana',
  'totalTradesCount',
  'longestBettingStreak',
  'profitableMarketsCount',
  'totalMarketsCreated',
  'creatorTraders',
  'numberOfComments',
  'totalReferrals',
  'charityDonatedMana',
  'seasonsMasters',
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
}

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

  // --- Trading ---
  {
    id: 'trading-volume',
    label: 'Trading Volume',
    description: 'Total mana traded across all your trades',
    category: 'trading',
    statKey: 'totalVolumeMana',
    unit: 'mana',
    milestones: [
      m('goldfish', 'Goldfish', '\u{1F421}', 10_000, 'green'),
      m('minnow', 'Minnow', '\u{1F41F}', 100_000, 'green'),
      m('swordfish', 'Swordfish', '\u{1F420}', 500_000, 'blue'),
      m('shark', 'Shark', '\u{1F988}', 2_000_000, 'purple'),
      m('orca', 'Orca', '\u{1F42C}', 5_000_000, 'crimson'),
      m('whale', 'Whale', '\u{1F433}', 10_000_000, 'gold'),
      m('leviathan', 'Leviathan', '\u{1F30A}', 50_000_000, 'prismatic'),
      m('kraken', 'Kraken', '\u{1F991}', 100_000_000, 'prismatic'),
    ],
  },
  {
    id: 'total-trades',
    label: 'Trades Placed',
    description: "Number of individual trades you've made",
    category: 'trading',
    statKey: 'totalTradesCount',
    unit: 'trades',
    milestones: [
      m('rookie', 'Rookie', '\u{1F3AF}', 10, 'green'),
      m('dabbler', 'Dabbler', '\u{1F3B2}', 50, 'green'),
      m('regular', 'Regular', '\u{1F4CA}', 250, 'blue'),
      m('hustler', 'Hustler', '\u{1F4B9}', 1_000, 'purple'),
      m('machine', 'Machine', '\u{2699}', 5_000, 'crimson'),
      m('terminator', 'Terminator', '\u{1F916}', 25_000, 'gold'),
      m('singularity', 'Singularity', '\u{1F300}', 100_000, 'prismatic'),
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
      m('spark', 'Spark', '\u{2728}', 14, 'green'),
      m('ember', 'Ember', '\u{1F525}', 30, 'blue'),
      m('blaze', 'Blaze', '\u{1F4A5}', 60, 'purple'),
      m('inferno', 'Inferno', '\u{1F30B}', 100, 'crimson'),
      m('phoenix', 'Phoenix', '\u{1F426}\u{200D}\u{1F525}', 200, 'gold'),
      m('eternal-flame', 'Eternal Flame', '\u{2600}', 365, 'gold'),
      m('undying', 'Undying', '\u{1F9BF}', 700, 'prismatic'),
      m('timeless', 'Timeless', '\u{231B}', 1_065, 'prismatic'),
      m('immortal', 'Immortal', '\u{23F3}', 1_500, 'prismatic'),
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
      m('lucky', 'Lucky', '\u{1F340}', 10, 'green'),
      m('savvy', 'Savvy', '\u{1F9E0}', 25, 'green'),
      m('sharp', 'Sharp', '\u{1F52A}', 75, 'blue'),
      m('tactician', 'Tactician', '\u{265F}', 150, 'blue'),
      m('oracle', 'Oracle', '\u{1F52E}', 300, 'purple'),
      m('sage', 'Sage', '\u{1F9D9}', 500, 'crimson'),
      m('clairvoyant', 'Clairvoyant', '\u{1F441}', 800, 'gold'),
      m('omniscient', 'Omniscient', '\u{1F31F}', 1_500, 'prismatic'),
    ],
  },

  // --- Creating ---
  {
    id: 'markets-created',
    label: 'Markets Created',
    description: "Questions you've created for the community to trade on",
    category: 'creating',
    statKey: 'totalMarketsCreated',
    unit: 'markets',
    milestones: [
      m('apprentice', 'Apprentice', '\u{1F528}', 5, 'green'),
      m('journeyman', 'Journeyman', '\u{1F6E0}', 15, 'green'),
      m('builder', 'Builder', '\u{1F3D7}', 50, 'blue'),
      m('architect', 'Architect', '\u{1F4D0}', 150, 'blue'),
      m('city-planner', 'City Planner', '\u{1F306}', 400, 'purple'),
      m('visionary', 'Visionary', '\u{1F52D}', 800, 'crimson'),
      m('world-builder', 'World Builder', '\u{1F30D}', 1_500, 'gold'),
      m('titan-of-questions', 'Titan of Questions', '\u{1F3D4}', 3_000, 'gold'),
      m(
        'infinite-curiosity',
        'Infinite Curiosity',
        '\u{267E}',
        5_000,
        'prismatic'
      ),
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
    milestones: [
      m('invisible', 'Invisible', '\u{1F47B}', 10, 'green'),
      m('unknown', 'Unknown', '\u{1F464}', 50, 'green'),
      m('recognized', 'Recognized', '\u{1F44B}', 150, 'green'),
      m('notable', 'Notable', '\u{1F465}', 500, 'blue'),
      m('popular', 'Popular', '\u{1F4E2}', 1_500, 'purple'),
      m('famous', 'Famous', '\u{2B50}', 3_000, 'crimson'),
      m('legendary', 'Legendary', '\u{1F3C5}', 6_000, 'gold'),
      m('icon', 'Icon', '\u{1F3AC}', 12_000, 'gold'),
      m('celebrity', 'Celebrity', '\u{1F451}', 25_000, 'gold'),
      m('superstar', 'Superstar', '\u{1F4AB}', 50_000, 'prismatic'),
      m('phenomenon', 'Phenomenon', '\u{1F320}', 75_000, 'prismatic'),
      m('transcendent', 'Transcendent', '\u{1F30C}', 100_000, 'prismatic'),
    ],
  },

  // --- Social ---
  {
    id: 'comments',
    label: 'Comments',
    description: "Comments you've posted",
    category: 'social',
    statKey: 'numberOfComments',
    unit: 'comments',
    milestones: [
      m('chatterbox', 'Chatterbox', '\u{1F4AC}', 50, 'green'),
      m('conversationalist', 'Conversationalist', '\u{1F4AD}', 150, 'green'),
      m('debater', 'Debater', '\u{1F5E3}', 400, 'blue'),
      m('commentator', 'Commentator', '\u{1F4DD}', 1_000, 'purple'),
      m('pundit', 'Pundit', '\u{1F4E3}', 2_500, 'crimson'),
      m('influencer', 'Influencer', '\u{1F4F0}', 5_000, 'gold'),
      m('thought-leader', 'Thought Leader', '\u{1F4A1}', 10_000, 'gold'),
      m(
        'voice-of-the-people',
        'Voice of the People',
        '\u{1F3A4}',
        20_000,
        'prismatic'
      ),
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
      m('networker', 'Networker', '\u{1F91D}', 5, 'green'),
      m('connector', 'Connector', '\u{1F517}', 15, 'blue'),
      m('recruiter', 'Recruiter', '\u{1F4E8}', 40, 'purple'),
      m('ambassador', 'Ambassador', '\u{1F3C7}', 100, 'crimson'),
      m('evangelist', 'Evangelist', '\u{1F4E1}', 250, 'gold'),
      m('pied-piper', 'Pied Piper', '\u{1F3B5}', 500, 'gold'),
      m('kingmaker', 'Kingmaker', '\u{1FA84}', 1_000, 'prismatic'),
      m('movement-leader', 'Movement Leader', '\u{1F3C1}', 2_500, 'prismatic'),
      m('founding-force', 'Founding Force', '\u{26A1}', 5_000, 'prismatic'),
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
      m('patron', 'Patron', '\u{1F49C}', 50, 'blue'),
      m('philanthropist', 'Philanthropist', '\u{2764}', 100, 'purple'),
      m('benefactor', 'Benefactor', '\u{1F496}', 1_000, 'gold'),
      m('saint', 'Saint', '\u{1F607}', 2_500, 'prismatic'),
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
      m('contender', 'Contender', '\u{1F94A}', 1, 'blue'),
      m('champion', 'Champion', '\u{1F3C6}', 3, 'purple'),
      m('dynasty', 'Dynasty', '\u{1F3F0}', 5, 'gold'),
      m('goat', 'GOAT', '\u{1F410}', 8, 'prismatic'),
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
      m('newcomer', 'Newcomer', '\u{1F331}', 0, 'green'),
      m('established', 'Established', '\u{1F333}', 1, 'blue'),
      m('veteran', 'Veteran', '\u{1F396}', 2, 'purple'),
      m('elder', 'Elder', '\u{1F474}', 3, 'gold'),
      m(
        'founding-member',
        'Founding Member',
        '\u{1F3DB}\u{FE0F}',
        4,
        'prismatic'
      ),
    ],
  },
]

const DEFINITIONS_BY_ID = new Map(TROPHY_DEFINITIONS.map((d) => [d.id, d]))

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

/** Mana the given milestones pay, before the claimant's tier multiplier. */
export function getRewardManaTotal(milestones: TrophyMilestone[]): number {
  return milestones.reduce((sum, m) => {
    const reward = m.rewardMana ?? 0
    return Number.isFinite(reward) && reward > 0 ? sum + reward : sum
  }, 0)
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

const isKnownClaim = (claim: TrophyClaim) => {
  const def = getTrophyDefinition(claim.trophyId)
  return !!def && !!getMilestone(def, claim.milestoneId)
}

export function getClaimedMilestoneIds(
  claims: TrophyClaim[],
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
export function countUnclaimedReachedMilestones(
  stats: TrophyStats,
  claims: TrophyClaim[],
  defs: TrophyDefinition[] = TROPHY_DEFINITIONS
): number {
  let count = 0
  for (const def of defs) {
    const value = getTrophyStatValue(def, stats)
    const claimed = getClaimedMilestoneIds(claims, def.id)
    count += def.milestones.filter(
      (m) => isMilestoneReached(m, value) && !claimed.has(m.id)
    ).length
  }
  return count
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
export const SHOWCASE_SLOT_UNLOCKS = [0, 25, 50] as const
export const MAX_SHOWCASE_PINS = SHOWCASE_SLOT_UNLOCKS.length

export function getMaxShowcasePins(claimedCount: number): number {
  return SHOWCASE_SLOT_UNLOCKS.filter((needed) => claimedCount >= needed).length
}

// The league badge is derived from the user's current league, not a claim.
export const LEAGUE_SHOWCASE_PIN = 'league'
const TROPHY_PIN_PREFIX = 'trophy-'

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
