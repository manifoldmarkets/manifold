import { APIError, AuthedUser } from 'api/helpers/endpoint'
import { BANNED_TRADING_USER_IDS } from 'common/envs/constants'
import {
  STARTER_MIN_TRADE_AMOUNT,
  STARTER_QUESTION_MIN_TRADERS,
  StarterStats,
  TrophyClaim,
  TrophyMilestoneRef,
  isRankPrizeRewardId,
  getStarterStatCap,
  isStarterTrophyAccount,
} from 'common/trophies'
import { EPSILON } from 'common/util/math'
import { SupabaseDirectClient, SupabaseTransaction } from 'shared/supabase/init'
import { TROPHY_PERSON_FILTER } from 'shared/supabase/trophy-eligibility'

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

// Milestones whose prize has been paid. The table also holds rank title
// prizes, which aren't milestones.
export async function getRewardedMilestones(
  pg: Pg,
  userId: string
): Promise<TrophyMilestoneRef[]> {
  const rows = await pg.manyOrNone<{ trophy_id: string; milestone_id: string }>(
    `select trophy_id, milestone_id from user_trophy_rewards where user_id = $1`,
    [userId]
  )
  return rows
    .filter((r) => !isRankPrizeRewardId(r.milestone_id))
    .map((r) => ({ trophyId: r.trophy_id, milestoneId: r.milestone_id }))
}

// Whether the account gets the starter trophies, or null if there is no such user.
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

// The bet stats read the account's first bets only, which keeps the cost flat
// for an account with a long history: each bet is a heap read, and 5,000 cold
// reads took 6 s on prod (22 Nov 2026).
//
// The limit counts the bets and orders the account placed, not rows. One
// purchase in a market whose answers sum to one writes a row per answer (the
// arbitrage legs, saved as redemptions), so a row limit ran out after 10 to 20
// trades in a 30-answer market. The highest thresholds are 50 markets, 25
// trades and 10 days: 500 bets leave room for 10 per market, or 50 a day.
// API bets and bets in other currencies are placed bets too: they use up the
// limit without counting.
export const STARTER_STATS_BET_LIMIT = 500
// Rows read to find those bets, redemptions included. The rows of one purchase
// are written together and mostly share a heap page, so this costs far less
// than as many separate bets.
export const STARTER_STATS_ROW_LIMIT = 3000

type StarterBetStatsRow = {
  trades: number
  markets: number
  days: number
  sells: number
  limit_orders: number
}

// From the account's first bets (see STARTER_STAT_KEYS), not via the API and
// in mana markets. A market-day counts as a trade when its buys add up to M10
// or more, and as a sale when its sells do. A purchase split across answers
// adds up; redemptions don't count, nor do the sell legs that redeem a full
// set automatically (isAutoRedemption, as for the Trades Placed count). A
// limit order counts as a trade on the day it was placed, once its fills
// reach M10, and as a limit order when the order itself is M10 or more. Bets
// after the limits don't count, so every number is at most the true one.
const STARTER_BET_STATS_QUERY = `
  with first_rows as (
    select b.bet_id, b.contract_id, b.amount, b.created_time, b.is_redemption,
      b.is_api, b.data
    from contract_bets b
    where b.user_id = $[userId]
    order by b.created_time, b.bet_id
    limit $[rowLimit]
  ),
  first_bets as (
    select r.contract_id, r.amount, r.created_time, r.is_api, r.data
    from first_rows r
    where not coalesce(r.is_redemption, false)
      and (r.data->>'isAutoRedemption') is distinct from 'true'
    order by r.created_time, r.bet_id
    limit $[betLimit]
  ),
  mana_bets as (
    select
      fb.contract_id,
      fb.amount,
      (fb.created_time at time zone 'America/Los_Angeles')::date as day,
      -- A slippage-protected buy is sent as a silent limit order that
      -- expires within a second; it is not a limit order to the trader.
      (fb.data->>'limitProb') is not null
        and not coalesce((fb.data->>'silent')::boolean, false) as is_limit_order,
      coalesce((fb.data->>'orderAmount')::numeric, 0) as order_amount
    from first_bets fb
    join contracts c on c.id = fb.contract_id
    where c.token = 'MANA' and not coalesce(fb.is_api, false)
  ),
  market_days as (
    select
      contract_id,
      day,
      coalesce(sum(amount) filter (where amount > 0), 0) as bought,
      coalesce(-sum(amount) filter (where amount < 0), 0) as sold
    from mana_bets
    group by 1, 2
  )
  -- Amounts are floats: legs of a split M10 purchase or sale can sum to
  -- 9.99999999999999. An order amount is what the trader typed, so it is
  -- compared exactly.
  select
    (count(*) filter (where bought >= $[minAmount] - 1e-6))::int as trades,
    (count(distinct contract_id) filter (where bought >= $[minAmount] - 1e-6))::int as markets,
    (count(distinct day) filter (where bought >= $[minAmount] - 1e-6))::int as days,
    (count(*) filter (where sold >= $[minAmount] - 1e-6))::int as sells,
    (
      select count(*) from mana_bets
      where is_limit_order and order_amount >= $[minAmount]
    )::int as limit_orders
  from market_days`

type StarterAccountStatsRow = {
  wins: number
  topics: number
  push_enabled: boolean
  popular_markets: number
  referrals: number
  paid_membership: boolean
}

// From the account. Each count stops at its top milestone (the limits), and
// every part reads only this user's rows through an index:
// - wins: unique_user_contract_answer (the user's summary rows), then
//   contracts_pkey. The same rule as resolvedProfitableMarkets in
//   get-user-achievements, less the account's own markets (and any market
//   with no creator on record).
// - topics: group_members_member_id_idx
// - push_enabled: private_users_pkey; the bonus older accounts were paid
//   (txns_category_to_id) counts too, since a sign-out removes the token
// - popular_markets: contracts_creator_id. The Markets Created rule with a
//   lower bar.
// - referrals: user_referrals_idx. People only, as for the Referrals trophy.
// - paid_membership: txns_category_to_id_from_id. Buying or renewing a
//   membership pays the bank; free days (membership_grants) write no txn.
const STARTER_ACCOUNT_STATS_QUERY = `
  select
    (
      select count(*) from (
        select 1
        from user_contract_metrics ucm
        join contracts c on c.id = ucm.contract_id
        where ucm.user_id = $[userId]
          -- The coalesce is the index's own expression, so the index skips
          -- the per-answer rows of multiple choice markets.
          and coalesce(ucm.answer_id, '') = ''
          and ucm.answer_id is null
          and ucm.profit > $[epsilon] and ucm.profit < 'Infinity'::numeric
          and c.token = 'MANA'
          and c.resolution is not null and c.resolution <> 'CANCEL'
          and not coalesce(c.deleted, false)
          and c.creator_id <> $[userId]
        limit $[maxWins]
      ) won
    )::int as wins,
    (
      select count(*) from (
        select 1 from group_members gm
        where gm.member_id = $[userId]
        limit $[maxTopics]
      ) followed
    )::int as topics,
    (
      exists (
        select 1 from private_users pu
        where pu.id = $[userId] and coalesce(pu.data->>'pushToken', '') <> ''
      )
      or exists (
        select 1 from txns t
        where t.category = 'PUSH_NOTIFICATION_BONUS' and t.to_id = $[userId]
      )
    ) as push_enabled,
    (
      select count(*) from (
        select 1 from contracts c
        where c.creator_id = $[userId]
          and c.token = 'MANA'
          and c.visibility = 'public'
          and not coalesce(c.deleted, false)
          and c.mechanism <> 'none'
          and c.unique_bettor_count >= $[minQuestionTraders]
        limit $[maxPopularMarkets]
      ) popular
    )::int as popular_markets,
    (
      select count(*) from (
        select 1 from users person
        where person.data->>'referredByUserId' = $[userId]
          and person.id <> $[userId]
          and ${TROPHY_PERSON_FILTER}
        limit $[maxReferrals]
      ) referred
    )::int as referrals,
    exists (
      select 1 from txns t
      where t.category = 'MEMBERSHIP_PAYMENT' and t.to_id = 'BANK'
        and t.from_id = $[userId] and t.amount > 0
    ) as paid_membership`

// A count from the database, or 0 if it is missing or not a finite number.
const toCount = (value: number | null | undefined) => {
  const count = Number(value ?? 0)
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0
}

// Counts for the "Getting started" trophies (see STARTER_STAT_KEYS). Runs on
// profile views and claims, on the client or transaction it is given.
export async function getStarterStats(
  pg: Pg,
  userId: string
): Promise<StarterStats> {
  const bets = await pg.one<StarterBetStatsRow>(STARTER_BET_STATS_QUERY, {
    userId,
    rowLimit: STARTER_STATS_ROW_LIMIT,
    betLimit: STARTER_STATS_BET_LIMIT,
    minAmount: STARTER_MIN_TRADE_AMOUNT,
  })
  const account = await pg.one<StarterAccountStatsRow>(
    STARTER_ACCOUNT_STATS_QUERY,
    {
      userId,
      epsilon: EPSILON,
      bannedTradingIds: BANNED_TRADING_USER_IDS,
      minQuestionTraders: STARTER_QUESTION_MIN_TRADERS,
      maxWins: getStarterStatCap('starterWins'),
      maxTopics: getStarterStatCap('topicsFollowed'),
      maxPopularMarkets: getStarterStatCap('starterPopularMarkets'),
      maxReferrals: getStarterStatCap('starterReferrals'),
    }
  )
  return {
    starterTrades: toCount(bets.trades),
    starterMarkets: toCount(bets.markets),
    starterDays: toCount(bets.days),
    starterWins: toCount(account.wins),
    topicsFollowed: toCount(account.topics),
    starterSells: toCount(bets.sells),
    starterLimitOrders: toCount(bets.limit_orders),
    pushEnabled: account.push_enabled ? 1 : 0,
    starterPopularMarkets: toCount(account.popular_markets),
    starterReferrals: toCount(account.referrals),
    paidMembership: account.paid_membership ? 1 : 0,
  }
}
