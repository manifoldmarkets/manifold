// Trophy prizes: what claiming a trophy milestone pays, once per milestone.
//
// A prize mixes mana, streak freezes and free membership days. Lifetime
// trophies pay by tier colour (the same in every ladder); starter milestones,
// Prediction Streak and a few one-off trophies set their own prize. Rank titles
// (Super, Mega) pay the first time someone reaches them.
//
// Defaults Claude chose for Tod to change (27 Nov 2026): the colour schedule
// below (option B from the v2 page, spread over the 10 colours), mana swapped
// for a freeze on Leagues / Account Age / Legacy Charity, and the standing
// rules in getPrizeStanding.

import type { EffectiveTier, SupporterTier } from 'common/supporter-config'
import type { TrophyTier } from 'common/trophies'

export type TrophyMembershipPrize = {
  // SupporterTier ids: 'basic' is Plus, 'plus' is Pro, 'premium' is Premium.
  // 'paid-tier' is the tier of the membership the account pays for (Member).
  tier: SupporterTier | 'paid-tier'
  days: number
}

export type TrophyPrize = {
  mana?: number
  freezes?: number
  membership?: TrophyMembershipPrize
}

// A sum of prizes. Membership stays a list: each milestone is its own grant.
export type TrophyPrizeTotal = {
  mana: number
  freezes: number
  membership: TrophyMembershipPrize[]
}

const plusDays = (days: number): TrophyMembershipPrize => ({
  tier: 'basic',
  days,
})
const proDays = (days: number): TrophyMembershipPrize => ({
  tier: 'plus',
  days,
})
const premiumDays = (days: number): TrophyMembershipPrize => ({
  tier: 'premium',
  days,
})

// Lifetime trophies (everyone): freezes at the bottom, mana and membership
// where tiers take months or years.
export const LIFETIME_PRIZES_BY_TIER: Record<TrophyTier, TrophyPrize> = {
  green: { freezes: 1 },
  teal: { freezes: 1 },
  blue: { freezes: 1, membership: plusDays(1) },
  indigo: { mana: 50, membership: plusDays(2) },
  purple: { mana: 100, membership: plusDays(3) },
  pink: { mana: 150, membership: plusDays(5) },
  crimson: { mana: 250, membership: plusDays(7) },
  orange: { mana: 350, membership: proDays(2) },
  gold: { mana: 500, membership: proDays(3) },
  prismatic: { mana: 1_000, membership: proDays(7) },
}

// Leagues already pay mana prizes (Tod, 26 Nov). Account Age and Legacy
// Charity are held by huge numbers of mostly dormant accounts. These swap the
// colour's mana for one extra streak freeze.
export const NO_MANA_TROPHY_IDS: readonly string[] = [
  'leagues',
  'account-age',
  'charity-donated',
]

// Milestones with their own prize, by trophy id then milestone id. Every
// starter milestone needs an entry (trophy-prizes.test.ts checks).
export const MILESTONE_PRIZES: Record<string, Record<string, TrophyPrize>> = {
  // --- Getting started (new accounts only) ---
  'starter-trades': {
    'first-trade': { mana: 50 },
    'hat-trick': { mana: 50 },
    'high-five': { mana: 50 },
    'getting-going': { mana: 100 },
    'in-the-groove': { membership: proDays(3) },
  },
  'starter-markets': {
    curious: { mana: 50 },
    explorer: { mana: 100 },
    globetrotter: { mana: 200 },
    cartographer: { mana: 300 },
  },
  'starter-days': {
    'back-again': { mana: 50, freezes: 1 },
    'three-days': { membership: plusDays(3) },
    'five-days': { mana: 100, membership: plusDays(2) },
    'full-week': { mana: 150 },
    'ten-days': { membership: plusDays(2) },
  },
  'starter-wins': {
    'called-it': { mana: 100 },
    'hot-hand': { mana: 150 },
  },
  'starter-topics': { 'pick-your-topics': { mana: 25 } },
  'starter-sells': { 'first-sale': { mana: 50 } },
  'starter-limit-orders': { 'limit-order': { membership: plusDays(1) } },
  'starter-push': { 'stay-in-the-loop': { mana: 500, freezes: 1 } },
  'starter-questions': { 'first-question': { mana: 100 } },
  'starter-referrals': { 'bring-a-friend': { membership: plusDays(3) } },
  'starter-membership': {
    member: { membership: { tier: 'paid-tier', days: 7 } },
  },

  // --- Lifetime trophies with their own prizes ---
  'prediction-streak': {
    kindling: { freezes: 1 },
    spark: { freezes: 1 },
    flame: { freezes: 1, membership: plusDays(1) },
    ember: { freezes: 1, membership: plusDays(2) },
    bonfire: { freezes: 2, membership: plusDays(3) },
    blaze: { freezes: 2, membership: plusDays(7) },
    wildfire: { freezes: 2, membership: proDays(3) },
    inferno: { freezes: 2, membership: proDays(3) },
    'eternal-flame': { freezes: 3, membership: proDays(7) },
    phoenix: { freezes: 3, membership: proDays(7) },
  },
  // Close Call: a freeze saved your streak. Refills the freeze.
  'streak-saves': { 'close-call': { freezes: 1 } },
}

// Newcomer (Account Age, day one): starter accounts get mana to start with,
// everyone else a freeze, so every trophy has a prize for everyone.
export const NEWCOMER_TROPHY_ID = 'account-age'
export const NEWCOMER_MILESTONE_ID = 'newcomer'
export const NEWCOMER_PRIZES: { starter: TrophyPrize; existing: TrophyPrize } =
  {
    starter: { mana: 50 },
    existing: { freezes: 1 },
  }

// Rank titles pay once each, the first time the account's peak reaches them.
// The #1 crown is the prize itself.
export const RANK_TIER_PRIZES: Record<'super' | 'mega', TrophyPrize> = {
  super: { membership: proDays(14) },
  mega: { membership: premiumDays(30) },
}

/** The prize for one milestone, before any reduction for account standing. */
export function getMilestonePrize(
  trophyId: string,
  milestone: { id: string; tier: TrophyTier },
  opts: { isStarterAccount: boolean }
): TrophyPrize {
  if (trophyId === NEWCOMER_TROPHY_ID && milestone.id === NEWCOMER_MILESTONE_ID)
    return opts.isStarterAccount
      ? NEWCOMER_PRIZES.starter
      : NEWCOMER_PRIZES.existing
  const own = MILESTONE_PRIZES[trophyId]?.[milestone.id]
  if (own) return own
  if (trophyId.startsWith('starter-')) return {}
  const byColour = LIFETIME_PRIZES_BY_TIER[milestone.tier] ?? {}
  if (!NO_MANA_TROPHY_IDS.includes(trophyId)) return byColour
  const { mana, ...rest } = byColour
  return isPositive(mana) ? { ...rest, freezes: (rest.freezes ?? 0) + 1 } : rest
}

export const EMPTY_PRIZE_TOTAL: TrophyPrizeTotal = {
  mana: 0,
  freezes: 0,
  membership: [],
}

export function totalPrizes(prizes: TrophyPrize[]): TrophyPrizeTotal {
  return prizes.reduce<TrophyPrizeTotal>(
    (sum, p) => ({
      mana: sum.mana + (isPositive(p.mana) ? p.mana : 0),
      freezes:
        sum.freezes + (isPositive(p.freezes) ? Math.floor(p.freezes) : 0),
      membership:
        p.membership && isPositive(p.membership.days)
          ? [...sum.membership, p.membership]
          : sum.membership,
    }),
    EMPTY_PRIZE_TOTAL
  )
}

export const isEmptyPrizeTotal = (t: TrophyPrizeTotal) =>
  !(t.mana > 0) && !(t.freezes > 0) && t.membership.length === 0

/** Adds totals, e.g. one per milestone of a claim. Mana rounds to 0.01. */
export function addPrizeTotals(totals: TrophyPrizeTotal[]): TrophyPrizeTotal {
  const mana =
    Math.round(
      totals.reduce((sum, t) => sum + (isPositive(t.mana) ? t.mana : 0), 0) *
        100
    ) / 100
  return {
    mana,
    freezes: totals.reduce(
      (sum, t) => sum + (isPositive(t.freezes) ? Math.floor(t.freezes) : 0),
      0
    ),
    membership: totals.flatMap((t) => t.membership),
  }
}

// What an account's standing lets it collect. Mana keeps the quest
// multiplier capped at 1 (flagged 0, bonus-blocked 0.2). Defaults for Tod to
// confirm: flagged accounts get no freezes or membership; bonus-blocked
// accounts get freezes but no membership days.
export type PrizeStanding = {
  manaMultiplier: number
  freezes: boolean
  membership: boolean
}

export function getPrizeStanding(
  tier: EffectiveTier,
  manaMultiplier: number
): PrizeStanding {
  const multiplier =
    Number.isFinite(manaMultiplier) && manaMultiplier > 0
      ? Math.min(manaMultiplier, 1)
      : 0
  if (tier === 'restricted')
    return { manaMultiplier: 0, freezes: false, membership: false }
  if (tier === 'reduced')
    return { manaMultiplier: multiplier, freezes: true, membership: false }
  return { manaMultiplier: multiplier, freezes: true, membership: true }
}

/** The part of a prize this standing collects. Mana rounds to 0.01. */
export function applyPrizeStanding(
  total: TrophyPrizeTotal,
  standing: PrizeStanding
): TrophyPrizeTotal {
  const mana = Math.round(total.mana * standing.manaMultiplier * 100) / 100
  return {
    mana: Number.isFinite(mana) && mana > 0 ? mana : 0,
    freezes: standing.freezes ? total.freezes : 0,
    membership: standing.membership ? total.membership : [],
  }
}

const MEMBERSHIP_TIER_NAMES: Record<TrophyMembershipPrize['tier'], string> = {
  basic: 'Plus',
  plus: 'Pro',
  premium: 'Premium',
  'paid-tier': 'your membership',
}

/** Short display parts, e.g. ['M50', '1 freeze', '3 days of Plus']. */
export function formatPrizeParts(total: TrophyPrizeTotal): string[] {
  const parts: string[] = []
  if (total.mana > 0) parts.push(`M${formatNumber(total.mana)}`)
  if (total.freezes > 0)
    parts.push(`${total.freezes} ${total.freezes === 1 ? 'freeze' : 'freezes'}`)
  const daysByTier = new Map<TrophyMembershipPrize['tier'], number>()
  for (const m of total.membership)
    daysByTier.set(m.tier, (daysByTier.get(m.tier) ?? 0) + m.days)
  for (const tier of ['premium', 'plus', 'basic', 'paid-tier'] as const) {
    const days = daysByTier.get(tier)
    if (days && days > 0)
      parts.push(
        `${formatNumber(days)} ${days === 1 ? 'day' : 'days'} of ${
          MEMBERSHIP_TIER_NAMES[tier]
        }`
      )
  }
  return parts
}

function isPositive(n: number | undefined): n is number {
  return n !== undefined && Number.isFinite(n) && n > 0
}

const formatNumber = (n: number) =>
  Number.isInteger(n) ? n.toLocaleString('en-US') : n.toFixed(2)
