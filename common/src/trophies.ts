// Trophies: named milestones on a user's long-running stats (net worth, trades,
// streaks, markets created...). Users claim a milestone once they reach it,
// and can pin trophies to their profile. Claims last. Net Worth badges track the latest snapshot.
//
// The stats come from `get-user-achievements`, apart from the "Getting
// started" trophies, whose stats `get-user-trophies` counts live. Claims live
// in `user_trophy_milestones`, one row per claimed milestone. The server is
// the authority on what can be claimed (claim-trophy recomputes the stat); the
// helpers here are shared so the web shows the same answer.
//
// The "Getting started" trophies are for new accounts only (see
// isStarterTrophyAccount); every other trophy is for everyone. What a
// milestone pays is in trophy-prizes.ts.

import { minBy, sortBy } from 'lodash'
import { ENV } from 'common/envs/constants'
import {
  EffectiveTier,
  getEffectiveBonusMultiplier,
  roundTierBonus,
} from 'common/supporter-config'
import { formatMoney } from 'common/util/format'

// Best first.
export const TROPHY_TIER_ORDER = [
  'prismatic',
  'gold',
  'orange',
  'crimson',
  'pink',
  'purple',
  'indigo',
  'blue',
  'teal',
  'green',
] as const
export type TrophyTier = (typeof TROPHY_TIER_ORDER)[number]

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
// (see getStarterStats in backend/api).
//
// From the account's first bets, not via the API and in mana markets. The
// unit is a market-day: a market and Pacific day.
// - starterTrades: market-days whose buys add up to M10 or more, so buying
//   and selling the same market again the same day does not count again
// - starterMarkets: distinct markets among them
// - starterDays: distinct days among them
// - starterSells: market-days whose sells add up to M10 or more
// - starterLimitOrders: limit orders of M10 or more, filled or not. Quick
//   orders that expire at once (slippage protection) don't count
//
// From the account, each counted only as far as its top milestone:
// - starterWins: resolved mana markets, not cancelled and not its own, where
//   it made a profit (the Profitable Markets rule)
// - topicsFollowed: topics followed
// - pushEnabled: 1 once push notifications are on
// - starterPopularMarkets: its public markets with
//   STARTER_QUESTION_MIN_TRADERS traders or more
// - starterReferrals: people who signed up with its referral
// - paidMembership: 1 once it has paid for a membership; free days don't count
export const STARTER_STAT_KEYS = [
  'starterTrades',
  'starterMarkets',
  'starterDays',
  'starterWins',
  'topicsFollowed',
  'starterSells',
  'starterLimitOrders',
  'pushEnabled',
  'starterPopularMarkets',
  'starterReferrals',
  'paidMembership',
] as const
export type StarterStatKey = (typeof STARTER_STAT_KEYS)[number]
export type StarterStats = Record<StarterStatKey, number>
export const EMPTY_STARTER_STATS: StarterStats = {
  starterTrades: 0,
  starterMarkets: 0,
  starterDays: 0,
  starterWins: 0,
  topicsFollowed: 0,
  starterSells: 0,
  starterLimitOrders: 0,
  pushEnabled: 0,
  starterPopularMarkets: 0,
  starterReferrals: 0,
  paidMembership: 0,
}
export const STARTER_MIN_TRADE_AMOUNT = 10
export const STARTER_QUESTION_MIN_TRADERS = 5

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
  'netWorth',
  'peakNetWorth',
  'totalTradesCount',
  'longestBettingStreak',
  'streakFreezesUsed',
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
  ranked?: boolean // nightly top-25 ranks with Super, Mega and #1 titles
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
    description: 'Trades of M10 or more, counting each market once a day',
    category: 'starter',
    statKey: 'starterTrades',
    unit: 'trades',
    milestones: [
      m('first-trade', 'First Trade', '\u{1F423}', 1, 'green', 50),
      m('hat-trick', 'Hat Trick', '\u{1F3A9}', 3, 'green', 50),
      m('high-five', 'High Five', '\u{1F64C}', 5, 'teal'),
      m('getting-going', 'Getting Going', '\u{1F6B2}', 10, 'blue', 100),
      m('in-the-groove', 'In the Groove', '\u{1F3B6}', 25, 'purple', 150),
    ],
  },
  {
    id: 'starter-markets',
    label: 'Markets Explored',
    description: 'Different markets you have traded M10 or more in on a day',
    category: 'starter',
    statKey: 'starterMarkets',
    unit: 'markets',
    milestones: [
      m('curious', 'Curious', '\u{1F9ED}', 3, 'green', 50),
      m('explorer', 'Explorer', '\u{1F5FA}', 10, 'blue', 100),
      m('globetrotter', 'Globetrotter', '\u{1F30E}', 25, 'indigo'),
      m('cartographer', 'Cartographer', '\u{1F310}', 50, 'purple'),
    ],
  },
  {
    id: 'starter-days',
    label: 'Days Active',
    description: 'Days you traded M10 or more in a market',
    category: 'starter',
    statKey: 'starterDays',
    unit: 'days',
    milestones: [
      m('back-again', 'Back Again', '\u{1F44B}', 2, 'green', 100),
      m('three-days', 'Three Days', '\u{1F4C5}', 3, 'green', 100),
      m('five-days', 'Five Days', '\u{1F31E}', 5, 'teal'),
      m('full-week', 'Full Week', '\u{1F5D3}', 7, 'blue', 150),
      m('ten-days', 'Ten Days', '\u{1F51F}', 10, 'purple'),
    ],
  },
  {
    id: 'starter-wins',
    label: 'Wins',
    description:
      "Resolved markets where you made a profit. Your own and cancelled markets don't count",
    category: 'starter',
    statKey: 'starterWins',
    unit: 'wins',
    milestones: [
      m('called-it', 'Called It', '\u{2705}', 1, 'blue'),
      m('hot-hand', 'Hot Hand', '\u{1F3C0}', 3, 'purple'),
    ],
  },
  {
    id: 'starter-topics',
    label: 'Topics',
    description: 'Topics you follow',
    category: 'starter',
    statKey: 'topicsFollowed',
    unit: 'topics',
    milestones: [
      m('pick-your-topics', 'Pick Your Topics', '\u{1F9E9}', 3, 'green'),
    ],
  },
  {
    id: 'starter-sells',
    label: 'First Sale',
    description: 'Sales of M10 or more, counting each market once a day',
    category: 'starter',
    statKey: 'starterSells',
    unit: 'sales',
    milestones: [m('first-sale', 'First Sale', '\u{1F4B0}', 1, 'teal')],
  },
  {
    id: 'starter-limit-orders',
    label: 'Limit Order',
    description: 'Limit orders of M10 or more',
    category: 'starter',
    statKey: 'starterLimitOrders',
    unit: 'limit orders',
    milestones: [m('limit-order', 'Limit Order', '\u{1F3A3}', 1, 'blue')],
  },
  {
    id: 'starter-push',
    label: 'Stay in the Loop',
    description: 'Push notifications turned on in the app',
    category: 'starter',
    statKey: 'pushEnabled',
    unit: 'devices',
    milestones: [
      m('stay-in-the-loop', 'Stay in the Loop', '\u{1F514}', 1, 'indigo'),
    ],
  },
  {
    id: 'starter-questions',
    label: 'First Question',
    description: `Public questions you asked that reached ${STARTER_QUESTION_MIN_TRADERS} traders`,
    category: 'starter',
    statKey: 'starterPopularMarkets',
    unit: 'questions',
    milestones: [
      m('first-question', 'First Question', '\u{2753}', 1, 'purple'),
    ],
  },
  {
    id: 'starter-referrals',
    label: 'Bring a Friend',
    description: 'People who signed up with your invite',
    category: 'starter',
    statKey: 'starterReferrals',
    unit: 'friends',
    milestones: [m('bring-a-friend', 'Bring a Friend', '\u{1F48C}', 1, 'pink')],
  },
  {
    id: 'starter-membership',
    label: 'Member',
    description: "Memberships you paid for. Free days don't count",
    category: 'starter',
    statKey: 'paidMembership',
    unit: 'memberships',
    milestones: [m('member', 'Member', '\u{1F4B3}', 1, 'gold')],
  },

  {
    id: 'net-worth',
    label: 'Net Worth',
    description:
      'Your net worth right now (mana plus open positions, from the latest nightly snapshot). If you drop below a tier, your badge drops with you. Your best tier is kept as history.',
    category: 'trading',
    statKey: 'netWorth',
    unit: 'mana',
    ranked: true,
    milestones: [
      m('minnow', 'Minnow', '🐟', 2_500, 'green'),
      m('pufferfish', 'Pufferfish', '🐡', 5_000, 'blue'),
      m('goldfish', 'Goldfish', '🐠', 10_000, 'indigo'),
      m('swordfish', 'Swordfish', '🗡', 25_000, 'purple'),
      m('barracuda', 'Barracuda', '🐟', 50_000, 'pink'),
      m('shark', 'Shark', '🦈', 100_000, 'crimson'),
      m('manta-ray', 'Manta Ray', '🌊', 175_000, 'orange'),
      m('orca', 'Orca', '🐬', 250_000, 'gold'),
      m('whale', 'Whale', '🐳', 500_000, 'prismatic'),
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
      m('rookie', 'Rookie', '🎯', 10, 'green'),
      m('dabbler', 'Dabbler', '📝', 25, 'teal'),
      m('regular', 'Regular', '📊', 100, 'blue'),
      m('enthusiast', 'Enthusiast', '💻', 250, 'indigo'),
      m('hustler', 'Hustler', '💹', 500, 'purple'),
      m('day-trader', 'Day Trader', '🖥', 1_000, 'pink'),
      m('grinder', 'Grinder', '⛏', 2_500, 'crimson'),
      m('workhorse', 'Workhorse', '🐎', 5_000, 'orange'),
      m('machine', 'Machine', '⚙', 10_000, 'gold'),
      m('terminator', 'Terminator', '🤖', 25_000, 'prismatic'),
    ],
  },
  {
    id: 'prediction-streak',
    label: 'Prediction Streak',
    description:
      'Your longest-ever streak of consecutive days placing a bet. You keep it after the streak ends.',
    category: 'trading',
    statKey: 'longestBettingStreak',
    unit: 'days',
    ranked: true,
    milestones: [
      m('kindling', 'Kindling', '🪵', 3, 'green'),
      m('spark', 'Spark', '✨', 7, 'teal'),
      m('flame', 'Flame', '🕯', 14, 'blue'),
      m('ember', 'Ember', '🔥', 30, 'indigo'),
      m('bonfire', 'Bonfire', '🏕', 60, 'purple'),
      m('blaze', 'Blaze', '💥', 100, 'pink'),
      m('wildfire', 'Wildfire', '🌪', 200, 'crimson'),
      m('inferno', 'Inferno', '🌋', 365, 'orange'),
      m('eternal-flame', 'Eternal Flame', '☀', 730, 'gold'),
      m('phoenix', 'Phoenix', '🐦\u200d🔥', 1_000, 'prismatic'),
    ],
  },
  {
    id: 'streak-saves',
    label: 'Close Call',
    // Counted by reset-betting-streaks from the deploy that added it.
    description: 'Times a streak freeze saved your streak',
    category: 'trading',
    statKey: 'streakFreezesUsed',
    unit: 'saves',
    ranked: false,
    milestones: [m('close-call', 'Close Call', '\u{1F9CA}', 1, 'teal')],
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
    milestones: [
      m('lucky', 'Lucky', '🍀', 10, 'green'),
      m('steady', 'Steady', '⚖', 25, 'teal'),
      m('savvy', 'Savvy', '🧠', 50, 'blue'),
      m('shrewd', 'Shrewd', '🦊', 100, 'indigo'),
      m('tactician', 'Tactician', '♞', 250, 'purple'),
      m('sage', 'Sage', '🧙', 400, 'pink'),
      m('seer', 'Seer', '👁', 500, 'crimson'),
      m('sharpe', 'Sharpe', '🗡', 750, 'orange'),
      m('clairvoyant', 'Clairvoyant', '👁', 1_000, 'gold'),
      m('oracle', 'Oracle', '🔮', 2_000, 'prismatic'),
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
    milestones: [
      m('apprentice', 'Apprentice', '🧱', 1, 'green'),
      m('tinkerer', 'Tinkerer', '🔧', 2, 'teal'),
      m('journeyman', 'Journeyman', '🔨', 3, 'blue'),
      m('craftsman', 'Craftsman', '🏠', 5, 'indigo'),
      m('builder', 'Builder', '🏡', 10, 'purple'),
      m('architect', 'Architect', '🏢', 25, 'pink'),
      m('engineer', 'Engineer', '🏗', 50, 'crimson'),
      m('city-planner', 'City Planner', '🏙', 100, 'orange'),
      m('visionary', 'Visionary', '🌆', 150, 'gold'),
      m('titan', 'Titan', '🏔', 250, 'prismatic'),
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
    milestones: [
      m('noticed', 'Noticed', '👀', 10, 'green'),
      m('discovered', 'Discovered', '🔍', 50, 'teal'),
      m('recognized', 'Recognized', '👋', 150, 'blue'),
      m('rising-star', 'Rising Star', '🌠', 300, 'indigo'),
      m('notable', 'Notable', '⭐', 500, 'purple'),
      m('headliner', 'Headliner', '🎭', 1_000, 'pink'),
      m('popular', 'Popular', '📣', 1_500, 'crimson'),
      m('famous', 'Famous', '🌟', 3_000, 'orange'),
      m('celebrity', 'Celebrity', '📸', 6_000, 'gold'),
      m('icon', 'Icon', '🎬', 12_000, 'prismatic'),
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
    milestones: [
      m('well-said', 'Well Said', '💬', 1, 'green'),
      m('chatterbox', 'Chatterbox', '🗨', 3, 'teal'),
      m('conversationalist', 'Conversationalist', '💭', 10, 'blue'),
      m('quotable', 'Quotable', '📌', 25, 'indigo'),
      m('debater', 'Debater', '🗣', 50, 'purple'),
      m('columnist', 'Columnist', '📰', 100, 'pink'),
      m('commentator', 'Commentator', '🎙', 150, 'crimson'),
      m('thought-leader', 'Thought Leader', '💡', 250, 'orange'),
      m('influencer', 'Influencer', '💖', 400, 'gold'),
      m('pundit', 'Pundit', '🏛', 1_000, 'prismatic'),
    ],
  },
  {
    id: 'leagues',
    label: 'Leagues',
    description:
      'Reach Silver or higher in a league season, then Gold, Platinum and Diamond. Each season in Masters counts.',
    category: 'prestige',
    statKey: 'leagueLevel',
    unit: 'league',
    ranked: true,
    milestones: [
      m('silver-season', 'Silver Season', '🥈', 1, 'green'),
      m('gold-season', 'Gold Season', '🥇', 2, 'teal'),
      m('platinum-season', 'Platinum Season', '💿', 3, 'blue'),
      m('diamond-season', 'Diamond Season', '💎', 4, 'indigo'),
      m('contender', 'Contender', '🥊', 5, 'purple'),
      m('challenger', 'Challenger', '⚔', 6, 'pink'),
      m('champion', 'Champion', '🏆', 7, 'crimson'),
      m('dynasty', 'Dynasty', '🏛', 9, 'orange'),
      m('legend', 'Legend', '🌟', 10, 'gold'),
      m('goat', 'GOAT', '🐐', 12, 'prismatic'),
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
    milestones: [
      m('networker', 'Networker', '🤝', 1, 'green'),
      m('plus-one', 'Plus One', '👥', 2, 'teal'),
      m('connector', 'Connector', '🔗', 3, 'blue'),
      m('recruiter', 'Recruiter', '📋', 5, 'indigo'),
      m('organizer', 'Organizer', '🚩', 7, 'purple'),
      m('evangelist', 'Evangelist', '📡', 10, 'pink'),
      m('promoter', 'Promoter', '🎉', 15, 'crimson'),
      m('talent-scout', 'Talent Scout', '🔭', 25, 'orange'),
      m('movement-builder', 'Movement Builder', '✊', 35, 'gold'),
      m('ambassador', 'Ambassador', '🌍', 50, 'prismatic'),
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
      m('newcomer', 'Newcomer', '🌱', 0, 'green', 25),
      m('settling-in', 'Settling In', '🌿', 1 / 12, 'teal'),
      m('committed', 'Committed', '🪴', 1 / 4, 'blue'),
      m('half-year', 'Half Year', '🌳', 1 / 2, 'indigo'),
      m('established', 'Established', '🌲', 1, 'purple'),
      m('seasoned', 'Seasoned', '🍂', 3 / 2, 'pink'),
      m('veteran', 'Veteran', '🍁', 2, 'crimson'),
      m('elder', 'Elder', '🌰', 3, 'orange'),
      m('old-guard', 'Old Guard', '🏛', 4, 'gold'),
      m('founding-member', 'Founding Member', '🌌', 5, 'prismatic'),
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
      m('donor', 'Donor', '💚', 10, 'green'),
      m('supporter', 'Supporter', '💙', 50, 'blue'),
      m('patron', 'Patron', '💜', 100, 'purple'),
      m('philanthropist', 'Philanthropist', '❤', 250, 'crimson'),
      m('humanitarian', 'Humanitarian', '💛', 500, 'gold'),
      m('benefactor', 'Benefactor', '💝', 1_000, 'prismatic'),
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

// The achievements response can predate a claim or a nightly publication.
export function getTrophyDisplayStats(
  achievements: TrophyStats | undefined,
  trophies:
    | {
        ranks: TrophyRank[]
        starter: StarterStats | null
        storedPeakNetWorth: number | null
      }
    | undefined
): TrophyStats {
  const held = trophies?.ranks.find((rank) => rank.trophyId === 'net-worth')
  return {
    ...achievements,
    ...trophies?.starter,
    peakNetWorth: getNetWorthPeak(
      achievements?.peakNetWorth,
      trophies?.storedPeakNetWorth,
      held?.value
    ),
  }
}

function getNetWorthPeak(...peaks: (number | null | undefined)[]) {
  const values = peaks.filter(
    (value): value is number => value != null && Number.isFinite(value)
  )
  return values.length ? Math.max(...values) : undefined
}

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
  seasonsSilverOrHigher: number
  seasonsGoldOrHigher: number
  seasonsPlatinumOrHigher: number
  seasonsDiamondOrHigher: number
  seasonsMasters: number
}) {
  const hasSeason = (n: number) => Number.isFinite(n) && n >= 1
  if (hasSeason(counts.seasonsMasters))
    return 4 + Math.floor(counts.seasonsMasters)
  if (hasSeason(counts.seasonsDiamondOrHigher)) return 4
  if (hasSeason(counts.seasonsPlatinumOrHigher)) return 3
  if (hasSeason(counts.seasonsGoldOrHigher)) return 2
  return hasSeason(counts.seasonsSilverOrHigher) ? 1 : 0
}

const leagueNames = [
  'No Silver season yet',
  'Silver',
  'Gold',
  'Platinum',
  'Diamond',
]
const mastersUnit = (n: number) => `Masters season${n === 1 ? '' : 's'}`

export function formatLeagueRemaining(current: number, target: number) {
  if (target <= 4) return `a ${leagueNames[target]} season`
  const remaining = Math.max(0, target - Math.max(4, current))
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

/** The top milestone threshold of a starter stat: counting past it changes
 * nothing, so the live count can stop there. 0 if no trophy measures it. */
export function getStarterStatCap(key: StarterStatKey): number {
  const thresholds = TROPHY_DEFINITIONS.filter(
    (d) => isStarterTrophy(d) && d.statKey === key
  ).flatMap((d) => d.milestones.map((m) => m.threshold))
  return Math.max(0, ...thresholds.filter((t) => Number.isFinite(t)))
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

// What to do for the next "Getting started" milestone, and where.
export type StarterMilestoneHint = { text: string; cta: string; href: string }

export function getStarterMilestoneHint(next: {
  definition: TrophyDefinition
  milestone: TrophyMilestone
  value: number
}): StarterMilestoneHint {
  const { definition, milestone, value } = next
  const gap = milestone.threshold - value
  const remaining = Number.isFinite(gap) ? Math.max(1, Math.ceil(gap)) : 1
  const minimum = `${formatMoney(STARTER_MIN_TRADE_AMOUNT)} or more`
  const market = { cta: 'Find a market', href: '/home' }
  switch (definition.statKey) {
    case 'starterDays':
      return {
        ...market,
        text:
          remaining === 1
            ? `Trade ${minimum} on another day`
            : `Trade ${minimum} on ${remaining} more days`,
      }
    case 'starterMarkets':
      return {
        ...market,
        text:
          remaining === 1
            ? `Trade ${minimum} in one more market`
            : `Trade ${minimum} in ${remaining} more markets`,
      }
    case 'starterWins':
      return {
        ...market,
        text:
          remaining === 1
            ? 'Make a profit on a market that resolves'
            : `Make a profit on ${remaining} more markets that resolve`,
      }
    case 'starterSells':
      return { ...market, text: `Sell ${minimum} of a position` }
    case 'starterLimitOrders':
      return { ...market, text: `Place a limit order of ${minimum}` }
    case 'topicsFollowed':
      return {
        cta: 'Browse topics',
        href: '/browse',
        text:
          remaining === 1
            ? 'Follow one more topic'
            : `Follow ${remaining} more topics`,
      }
    case 'pushEnabled':
      return {
        cta: 'Notifications',
        href: '/notifications',
        text: 'Turn on push notifications in the app',
      }
    case 'starterPopularMarkets':
      return {
        cta: 'Ask a question',
        href: '/create',
        text: `Ask a question that gets ${STARTER_QUESTION_MIN_TRADERS} traders`,
      }
    case 'starterReferrals':
      return {
        cta: 'Invite a friend',
        href: '/referrals',
        text: 'Invite a friend who signs up',
      }
    case 'paidMembership':
      return {
        cta: 'See memberships',
        href: '/membership',
        text: 'Become a member',
      }
    default:
      return {
        ...market,
        text:
          milestone.threshold === 1
            ? `Make a trade of ${minimum}`
            : `Make ${remaining} more ${
                remaining === 1 ? 'trade' : 'trades'
              } of ${minimum}, one per market per day`,
      }
  }
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

/** UTC signup anniversary at a whole number of calendar months, expressed
 * in years. Clamp the day to month end, as Postgres interval addition does. */
export function getAccountAnniversaryTime(createdTime: number, years: number) {
  const d = new Date(createdTime)
  const year = d.getUTCFullYear()
  const month = d.getUTCMonth() + Math.round(years * 12)
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

/** Earned tiers reflect current net worth. Other claimed tiers stay earned. */
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
      (m) =>
        isMilestoneReached(m, value) ||
        (def.id !== 'net-worth' && claimed.has(m.id))
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

/** Rank pins share the milestone art directory. */
export const getTrophyRankBadgeImagePath = (
  trophyId: string,
  tier: TrophyRankTier
) => getTrophyBadgeImagePath(trophyId, tier)

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

// A claim is also evidence of a past tier, including one reached with a
// snapshot too old to update the stored peak. It never raises the current tier.
export function getNetWorthStatus(stats: TrophyStats, claims: TrophyClaim[]) {
  const def = DEFINITIONS_BY_ID.get('net-worth')!
  const value = getTrophyStatValue(def, stats)
  const current = getHighestMilestone(def, value)
  const claimed = getHighestClaimedMilestone(def, claims)
  const best = getHighestMilestone(
    def,
    getNetWorthPeak(stats.peakNetWorth, claimed?.threshold) ?? 0
  )
  const previousBest = best && best.threshold > value ? best : null
  return { current, previousBest, value }
}

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
    return leagueNames[level] ?? `${level - 4} ${mastersUnit(level - 4)}`
  }
  if (def.unit === 'years' && value > 0 && value < 2)
    return `${round(value * 12)}mo`
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
