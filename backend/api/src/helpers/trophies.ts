import {
  STARTER_MIN_TRADE_AMOUNT,
  StarterStats,
  TrophyClaim,
  isStarterTrophyAccount,
} from 'common/trophies'
import { SupabaseDirectClient, SupabaseTransaction } from 'shared/supabase/init'

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

// Counts for the "Getting started" trophies (see STARTER_STAT_KEYS): buys of
// M10 or more, not via the API, in mana markets, among the account's first
// bets. Sells have negative amounts, so they never count.
export async function getStarterStats(
  pg: Pg,
  userId: string
): Promise<StarterStats> {
  const row = await pg.one<{ trades: number; markets: number; days: number }>(
    `with first_bets as (
       select b.contract_id, b.amount, b.created_time, b.is_redemption, b.is_api
       from contract_bets b
       where b.user_id = $1
       order by b.created_time
       limit $2
     ),
     qualifying as (
       select
         fb.contract_id,
         (fb.created_time at time zone 'America/Los_Angeles')::date as day
       from first_bets fb
       join contracts c on c.id = fb.contract_id
       where fb.amount >= $3
         and not coalesce(fb.is_redemption, false)
         and not coalesce(fb.is_api, false)
         and c.token = 'MANA'
     )
     select
       count(distinct contract_id || ':' || day::text)::int as trades,
       count(distinct contract_id)::int as markets,
       count(distinct day)::int as days
     from qualifying`,
    [userId, STARTER_STATS_BET_LIMIT, STARTER_MIN_TRADE_AMOUNT]
  )
  return {
    starterTrades: row.trades,
    starterMarkets: row.markets,
    starterDays: row.days,
  }
}
