import { APIError, AuthedUser } from 'api/helpers/endpoint'
import {
  STARTER_MIN_TRADE_AMOUNT,
  StarterStats,
  TrophyClaim,
  TrophyMilestoneRef,
  isStarterTrophyAccount,
} from 'common/trophies'
import { SupabaseDirectClient, SupabaseTransaction } from 'shared/supabase/init'

// The page sends the profile it is changing. A session that switched accounts
// after the page loaded must not change the other account's trophies.
export function assertOwnProfile(userId: string, auth: AuthedUser) {
  if (userId !== auth.uid) {
    throw new APIError(
      403,
      'You are signed in as a different account. Reload the page.'
    )
  }
}

type TrophyClaimRow = {
  trophy_id: string
  milestone_id: string
  claimed_time: Date
}

export const convertTrophyClaim = (row: TrophyClaimRow): TrophyClaim => ({
  trophyId: row.trophy_id,
  milestoneId: row.milestone_id,
  claimedTime: new Date(row.claimed_time).valueOf(),
})

type Pg = SupabaseDirectClient | SupabaseTransaction

export async function getTrophyClaims(
  pg: Pg,
  userId: string
): Promise<TrophyClaim[]> {
  const rows = await pg.manyOrNone<TrophyClaimRow>(
    `select trophy_id, milestone_id, claimed_time
     from user_trophy_milestones
     where user_id = $1
     order by claimed_time, trophy_id, milestone_id`,
    [userId]
  )
  return rows.map(convertTrophyClaim)
}

export async function getShowcasePins(
  pg: Pg,
  userId: string
): Promise<string[] | null> {
  const row = await pg.oneOrNone<{ pins: string[] }>(
    `select pins from user_showcase where user_id = $1`,
    [userId]
  )
  return row ? row.pins : null
}

// Whether the account gets the "Getting started" trophies, or null if there is
// no such user.
// Milestones whose reward has been paid (see user_trophy_rewards).
export async function getRewardedMilestones(
  pg: Pg,
  userId: string
): Promise<TrophyMilestoneRef[]> {
  const rows = await pg.manyOrNone<{ trophy_id: string; milestone_id: string }>(
    `select trophy_id, milestone_id from user_trophy_rewards where user_id = $1`,
    [userId]
  )
  return rows.map((r) => ({
    trophyId: r.trophy_id,
    milestoneId: r.milestone_id,
  }))
}

export async function getIsStarterTrophyAccount(
  pg: Pg,
  userId: string
): Promise<boolean | null> {
  const row = await pg.oneOrNone<{ created_time: Date }>(
    `select created_time from users where id = $1`,
    [userId]
  )
  if (!row) return null
  return isStarterTrophyAccount(new Date(row.created_time).valueOf())
}

// The highest starter threshold is 25, so the account's first bets are enough.
// The cap keeps the cost flat for an account with a long history: each bet is
// a heap read, and 5,000 cold reads took 6 s on prod (22 Nov 2026).
const STARTER_STATS_BET_LIMIT = 500

// Counts for the "Getting started" trophies (see STARTER_STAT_KEYS), from
// the account's first bets: a market-day counts when the account's buys in
// that market that Pacific day, not via the API and in a mana market, add up
// to M10 or more. A purchase split across answers adds up; sells (negative
// amounts) and redemptions don't count. A limit order counts on the day it
// was placed, once its fills reach M10.
export async function getStarterStats(
  pg: Pg,
  userId: string
): Promise<StarterStats> {
  const row = await pg.one<{ trades: number; markets: number; days: number }>(
    `with first_bets as (
       select b.contract_id, b.amount, b.created_time, b.is_redemption, b.is_api
       from contract_bets b
       where b.user_id = $1
       order by b.created_time, b.bet_id
       limit $2
     ),
     market_days as (
       select
         fb.contract_id,
         (fb.created_time at time zone 'America/Los_Angeles')::date as day
       from first_bets fb
       join contracts c on c.id = fb.contract_id
       where fb.amount > 0
         and not coalesce(fb.is_redemption, false)
         and not coalesce(fb.is_api, false)
         and c.token = 'MANA'
       group by 1, 2
       -- Amounts are floats: legs of a split M10 purchase can sum to
       -- 9.99999999999999.
       having sum(fb.amount) >= $3 - 1e-6
     )
     select
       count(*)::int as trades,
       count(distinct contract_id)::int as markets,
       count(distinct day)::int as days
     from market_days`,
    [userId, STARTER_STATS_BET_LIMIT, STARTER_MIN_TRADE_AMOUNT]
  )
  return {
    starterTrades: row.trades,
    starterMarkets: row.markets,
    starterDays: row.days,
  }
}
