import { APIHandler } from 'api/helpers/endpoint'
// NOTE: Duplication warning
// The ranks below (apart from trades) come from the materialized views in
// backend/supabase/achievement_materialized_views.sql, refreshed nightly.
// Changes to a ranked achievement must match that SQL file. Trophy-only
// fields are live here and use separate nightly ranks in update-trophy-ranks.
// Trades and their rank are live, from user_stats (dev-docs/user-stats.md).
import { APIResponse } from 'common/api/schema'
import {
  MARKET_CREATED_MIN_TRADERS,
  REFERRAL_MIN_TRADES,
  getLeagueLevel,
} from 'common/trophies'
import { EPSILON } from 'common/util/math'
import { HOUR_MS, MINUTE_MS } from 'common/util/time'
import {
  TROPHY_FRESH_PORTFOLIO_FILTER,
  TROPHY_PERSON_FILTER,
  TROPHY_VISIBLE_COMMENT_FILTER,
} from 'shared/supabase/trophy-eligibility'
import {
  SupabaseDirectClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import {
  getUserTrades,
  isUserStatsTradesReady,
} from 'shared/user-stats-backfill'

type Rank = { rank: number | null; percentile: number | null }
type RankKey = keyof APIResponse<'get-user-achievements'>['ranks']

// Returns flat achievement-style statistics for a given user, with ranks
export const getUserAchievements: APIHandler<'get-user-achievements'> = async ({
  userId,
}) => loadUserAchievements(userId)

// Also used by claim-trophy, so a claim is checked against the same numbers
// the profile shows.
export async function loadUserAchievements(
  userId: string
): Promise<APIResponse<'get-user-achievements'>> {
  const pg = createSupabaseDirectClient()
  const [result, trades, N] = await Promise.all([
    pg.oneOrNone<StatsRow>(STATS_QUERY, [
      userId,
      MARKET_CREATED_MIN_TRADERS,
      REFERRAL_MIN_TRADES,
      EPSILON,
    ]),
    loadTrades(pg, userId),
    getRankPopulation(pg),
  ])

  const conv = (rank: number | null | undefined): Rank =>
    rank && N > 0
      ? { rank, percentile: (rank / N) * 100 }
      : { rank: rank ?? null, percentile: null }
  const mvRanks = result?.ranks_json ?? {}
  const ranks = Object.fromEntries(
    RANK_KEYS.map((key) => [
      key,
      conv(key === 'trades' ? trades.rank : mvRanks[key]),
    ])
  ) as Record<RankKey, Rank>

  const seasons = {
    seasonsGoldOrHigher: Number(result?.seasons_gold_or_higher ?? 0),
    seasonsPlatinumOrHigher: Number(result?.seasons_platinum_or_higher ?? 0),
    seasonsDiamondOrHigher: Number(result?.seasons_diamond_or_higher ?? 0),
    seasonsMasters: Number(result?.seasons_masters ?? 0),
  }
  return {
    userId,
    ...seasons,
    leagueLevel: getLeagueLevel(seasons),
    netWorth: Number(result?.net_worth ?? 0),
    peakNetWorth: Number(result?.peak_net_worth ?? 0),
    likedComments: Number(result?.liked_comments ?? 0),
    marketsCreatedWithTraders: Number(
      result?.markets_created_with_traders ?? 0
    ),
    referredTraders: Number(result?.referred_traders ?? 0),
    resolvedProfitableMarkets: Number(result?.resolved_profitable_markets ?? 0),
    creatorTraders: Number(result?.creator_traders ?? 0),
    totalReferrals: Number(result?.total_referrals ?? 0),
    totalReferredProfitMana: Number(result?.total_referred_profit_mana ?? 0),
    totalVolumeMana: Number(result?.total_volume_mana ?? 0),
    largestLeagueSeasonEarnings: Number(
      result?.largest_league_season_earnings ?? 0
    ),
    numberOfComments: Number(result?.number_of_comments ?? 0),
    totalLiquidityCreatedMarkets: Number(
      result?.total_liquidity_created_markets ?? 0
    ),
    totalTradesCount: trades.count,
    totalMarketsCreated: Number(result?.total_markets_created ?? 0),
    accountAgeYears: Number(result?.account_age_years ?? 0),
    profitableMarketsCount: Number(result?.profitable_markets_count ?? 0),
    unprofitableMarketsCount: Number(result?.unprofitable_markets_count ?? 0),
    largestProfitableTradeValue: Number(
      result?.largest_profitable_trade_value ?? 0
    ),
    largestUnprofitableTradeValue: Number(
      result?.largest_unprofitable_trade_value ?? 0
    ),
    longestBettingStreak: Number(result?.longest_betting_streak ?? 0),
    modTicketsResolved: Number(result?.mod_tickets_resolved ?? 0),
    charityDonatedMana: Number(result?.charity_donated_mana ?? 0),
    ranks,
  }
}

// Live from user_stats once its backfill is complete; until then the old
// ach_trades table, whose refresh job has been off since Sep 2025.
async function loadTrades(
  pg: SupabaseDirectClient,
  userId: string
): Promise<{ count: number; rank: number | null }> {
  if (await userStatsReady(pg)) return await getUserTrades(pg, userId)
  const row = await pg.oneOrNone<{ count: number; rank: number | null }>(
    `select total_trades_count as count, trades_rank as rank
     from ach_trades where user_id = $1`,
    [userId]
  )
  return { count: Number(row?.count ?? 0), rank: row?.rank ?? null }
}

// Once complete, user_stats stays complete, so only "not yet" is re-checked.
let userStatsReadyCache: { ready: boolean; checkedAt: number } | undefined
async function userStatsReady(pg: SupabaseDirectClient) {
  const cached = userStatsReadyCache
  if (cached && (cached.ready || Date.now() - cached.checkedAt < MINUTE_MS)) {
    return cached.ready
  }
  const ready = await isUserStatsTradesReady(pg)
  userStatsReadyCache = { ready, checkedAt: Date.now() }
  return ready
}

// Percentiles are a rank over every account (the rows of mv_ach_volume, one
// per user at its last refresh). Counted once an hour, not per request.
let rankPopulationCache: { n: number; checkedAt: number } | undefined
async function getRankPopulation(pg: SupabaseDirectClient) {
  const cached = rankPopulationCache
  if (cached && Date.now() - cached.checkedAt < HOUR_MS) return cached.n
  const { n } = await pg.one<{ n: number }>(
    'select count(*)::int as n from mv_ach_volume'
  )
  rankPopulationCache = { n: Number(n ?? 0), checkedAt: Date.now() }
  return rankPopulationCache.n
}

const RANK_KEYS: RankKey[] = [
  'creatorTraders',
  'totalReferrals',
  'totalReferredProfit',
  'volume',
  'trades',
  'marketsCreated',
  'comments',
  'seasonsPlatinumOrHigher',
  'seasonsDiamondOrHigher',
  'seasonsMasters',
  'largestLeagueSeasonEarnings',
  'liquidity',
  'profitableMarkets',
  'unprofitableMarkets',
  'largestProfitableTrade',
  'largestUnprofitableTrade',
  'accountAge',
  'longestBettingStreak',
  'modTickets',
  'charityDonated',
]

type StatsRow = {
  net_worth: number | null
  peak_net_worth: number | null
  liked_comments: number | null
  markets_created_with_traders: number | null
  referred_traders: number | null
  resolved_profitable_markets: number | null
  seasons_gold_or_higher: number | null
  creator_traders: number | null
  total_referrals: number | null
  total_referred_profit_mana: number | null
  total_volume_mana: number | null
  seasons_platinum_or_higher: number | null
  seasons_diamond_or_higher: number | null
  seasons_masters: number | null
  largest_league_season_earnings: number | null
  number_of_comments: number | null
  total_liquidity_created_markets: number | null
  total_markets_created: number | null
  account_age_years: number | null
  profitable_markets_count: number | null
  unprofitable_markets_count: number | null
  largest_profitable_trade_value: number | null
  largest_unprofitable_trade_value: number | null
  longest_betting_streak: number | null
  mod_tickets_resolved: number | null
  charity_donated_mana: number | null
  ranks_json: Partial<Record<RankKey, number | null>> | null
}

// Every part reads only this user's rows through an index on the user.
const STATS_QUERY = `with
  creators as (
    select (data->'creatorTraders'->>'allTime')::int as creator_traders
    from users
    where id = $1
  ),
  -- Same numbers as the user_referrals_profit view, which ranks every referrer
  -- and so scans all users; this reads only this user's referrals
  -- (user_referrals_idx).
  referrals as (
    select
      count(uphl.user_id) as total_referrals,
      count(*) filter (where ${TROPHY_PERSON_FILTER}
        and coalesce(s.trades, 0) + coalesce(baseline.trades, 0) >= $3) as referred_traders,
      sum(uphl.balance + uphl.spice_balance + uphl.investment_value - uphl.total_deposits)
        as total_referred_profit_mana
    from users person
    left join user_portfolio_history_latest uphl on uphl.user_id = person.id
    left join user_stats s on s.user_id = person.id
    left join user_stats_baseline baseline on baseline.user_id = person.id
    where person.data->>'referredByUserId' = $1
      and exists (select 1 from users referrer where referrer.id = $1)
  ),
  portfolio as (
    select uphl.balance + uphl.investment_value as net_worth,
      ${TROPHY_FRESH_PORTFOLIO_FILTER} as is_fresh
    from user_portfolio_history_latest uphl where uphl.user_id = $1
  ),
  liked as (
    select count(distinct r.content_id) as liked_comments
    from user_reactions r
    join users person on person.id = r.user_id
    where r.content_owner_id = $1 and r.content_type = 'comment' and r.reaction_type = 'like'
      and r.user_id <> $1 and ${TROPHY_PERSON_FILTER}
      and ${TROPHY_VISIBLE_COMMENT_FILTER}
  ),
  mod_tickets as (
    select count(*) as mod_tickets_resolved
    from txns
    where category = 'ADMIN_REWARD' and to_id = $1
    and data -> 'data' ->> 'updateType' = 'resolved'
  ),
  charity as (
    select coalesce(sum(case when token = 'M$' then amount / 100.0 else 0 end), 0)
         + coalesce(sum(case when token = 'CASH' then amount else 0 end), 0)
         + coalesce(sum(case when token = 'SPICE' then amount / 1000.0 else 0 end), 0) as charity_donated_mana
    from txns
    where category = 'CHARITY' and from_id = $1
  ),
  -- Volume and the P&L counts in one pass over the user's market summaries.
  metrics as (
    select
      sum(coalesce((ucm.data->>'totalAmountSold')::numeric, 0)
        + coalesce((ucm.data->>'totalAmountInvested')::numeric, 0)) as total_volume_mana,
      count(*) filter (where coalesce(ucm.profit, 0) > 0) as profitable_markets_count,
      count(*) filter (where ucm.profit > $4 and ucm.profit < 'Infinity'::numeric
        and c.resolution is not null
        and c.resolution <> 'CANCEL' and not coalesce(c.deleted, false)) as resolved_profitable_markets,
      count(*) filter (where coalesce(ucm.profit, 0) < 0) as unprofitable_markets_count,
      max(ucm.profit) filter (where coalesce(ucm.profit, 0) > 0) as largest_profitable_trade_value,
      min(ucm.profit) filter (where coalesce(ucm.profit, 0) < 0) as largest_unprofitable_trade_value
    from user_contract_metrics ucm
    join contracts c on c.id = ucm.contract_id
    where ucm.user_id = $1
      and ucm.answer_id is null
      and c.token = 'MANA'
  ),
  -- From leagues directly: the user_league_info view ranks every cohort.
  leagues_cte as (
    select
      count(*) filter (where division >= 3) as seasons_gold_or_higher,
      count(*) filter (where division >= 4) as seasons_platinum_or_higher,
      count(*) filter (where division >= 5) as seasons_diamond_or_higher,
      count(*) filter (where division = 6) as seasons_masters,
      max(mana_earned) as largest_league_season_earnings
    from leagues
    where user_id = $1
  ),
  comments as (
    select
      (select count(*) from contract_comments where user_id = $1) +
      (select count(*) from old_post_comments where user_id = $1) as number_of_comments
  ),
  -- Markets created counts public mana markets: unlisted and deleted ones
  -- don't count (same rule as mv_ach_creator_contracts, migration
  -- 2026112221). Liquidity still sums every mana market the user created.
  created as (
    select
      count(*) filter (
        where c.visibility = 'public' and not coalesce(c.deleted, false)
      ) as total_markets_created,
      count(*) filter (where c.visibility = 'public' and not coalesce(c.deleted, false)
        and c.mechanism <> 'none' and c.unique_bettor_count >= $2) as markets_created_with_traders,
      coalesce(sum((c.data->>'totalLiquidity')::numeric), 0) as total_liquidity_created_markets
    from contracts c
    where c.creator_id = $1 and c.token = 'MANA'
  ),
  account_age as (
    -- Whole years since signup, plus the share of the current year,
    -- rounded down to four places (under an hour), all in UTC. A year is complete when
    -- created_time plus that many calendar years has passed (so a
    -- Feb 29 signup completes one on Feb 28), and the whole part and the
    -- share come from the same anniversaries, so the Account Age trophy
    -- is never reached early.
    select a.whole + floor(
        10000 * extract(epoch from (a.now_utc - a.last_anniversary))
        / extract(epoch from (a.next_anniversary - a.last_anniversary))
      ) / 10000 as account_age_years
    from (
      select
        y.now_utc,
        y.whole,
        y.created + make_interval(years => y.whole) as last_anniversary,
        y.created + make_interval(years => y.whole + 1) as next_anniversary
      from (
        select
          x.now_utc,
          x.created,
          x.k
            + (x.created + make_interval(years => x.k + 1) <= x.now_utc)::int
            - (x.created + make_interval(years => x.k) > x.now_utc)::int
            as whole
        from (
          select
            now() at time zone 'UTC' as now_utc,
            u.created_time at time zone 'UTC' as created,
            extract(year from age(
              now() at time zone 'UTC', u.created_time at time zone 'UTC'
            ))::int as k
          from users u
          where u.id = $1
        ) x
      ) y
    ) a
  ),
  -- The longest of: any streak a bonus was paid for, the longest ended
  -- streak (kept by reset-betting-streaks) and the current one. Accounts
  -- that can't receive bonuses get no bonus txns.
  longest_streak as (
    select greatest(
      coalesce(max((tx.data->'data'->>'currentBettingStreak')::int), 0),
      coalesce((
        select greatest(
          coalesce((u.data->>'longestBettingStreak')::int, 0),
          coalesce((u.data->>'currentBettingStreak')::int, 0)
        )
        from users u where u.id = $1
      ), 0)
    ) as longest_betting_streak
    from txns tx
    where tx.to_id = $1
      and tx.category = 'BETTING_STREAK_BONUS'
  )
  select
    coalesce(portfolio.net_worth, 0) as net_worth,
    greatest(coalesce(peaks.peak_net_worth, 0),
      case when portfolio.is_fresh then portfolio.net_worth end) as peak_net_worth,
    liked.liked_comments,
    created.markets_created_with_traders,
    referrals.referred_traders,
    metrics.resolved_profitable_markets,
    leagues_cte.seasons_gold_or_higher,
    creators.creator_traders,
    referrals.total_referrals,
    referrals.total_referred_profit_mana,
    metrics.total_volume_mana,
    leagues_cte.seasons_platinum_or_higher,
    leagues_cte.seasons_diamond_or_higher,
    leagues_cte.seasons_masters,
    leagues_cte.largest_league_season_earnings,
    comments.number_of_comments,
    created.total_liquidity_created_markets,
    created.total_markets_created,
    account_age.account_age_years,
    metrics.profitable_markets_count,
    metrics.unprofitable_markets_count,
    metrics.largest_profitable_trade_value,
    metrics.largest_unprofitable_trade_value,
    longest_streak.longest_betting_streak,
    mod_tickets.mod_tickets_resolved,
    charity.charity_donated_mana,
    json_build_object(
      'creatorTraders', (select creator_traders_rank from mv_ach_creator_traders where user_id = $1),
      'totalReferrals', (select total_referrals_rank from mv_ach_referrals where user_id = $1),
      'totalReferredProfit', (select total_referred_profit_rank from mv_ach_referrals where user_id = $1),
      'volume', (select volume_rank from mv_ach_volume where user_id = $1),
      'marketsCreated', (select markets_created_rank from mv_ach_creator_contracts where user_id = $1),
      'comments', (select comments_rank from mv_ach_comments where user_id = $1),
      'seasonsPlatinumOrHigher', (select seasons_platinum_or_higher_rank from mv_ach_leagues where user_id = $1),
      'seasonsDiamondOrHigher', (select seasons_diamond_or_higher_rank from mv_ach_leagues where user_id = $1),
      'seasonsMasters', (select seasons_masters_rank from mv_ach_leagues where user_id = $1),
      'largestLeagueSeasonEarnings', (select largest_league_season_earnings_rank from mv_ach_leagues where user_id = $1),
      'liquidity', (select liquidity_rank from mv_ach_creator_contracts where user_id = $1),
      'profitableMarkets', (select profitable_markets_rank from mv_ach_pnl where user_id = $1),
      'unprofitableMarkets', (select unprofitable_markets_rank from mv_ach_pnl where user_id = $1),
      'largestProfitableTrade', (select largest_profitable_trade_rank from mv_ach_pnl where user_id = $1),
      'largestUnprofitableTrade', (select largest_unprofitable_trade_rank from mv_ach_pnl where user_id = $1),
      'accountAge', (select account_age_rank from mv_ach_account_age where user_id = $1),
      'longestBettingStreak', (select longest_betting_streak_rank from mv_ach_txns_achievements where user_id = $1),
      'modTickets', (select mod_tickets_rank from mv_ach_txns_achievements where user_id = $1),
      'charityDonated', (select charity_donated_rank from mv_ach_txns_achievements where user_id = $1)
    ) as ranks_json
  -- One row even when there is no users row (e.g. an imported comment's
  -- author): the parts that only need the id still count.
  from (select 1) base
  left join portfolio on portfolio.net_worth > '-Infinity'::numeric and portfolio.net_worth < 'Infinity'::numeric
  left join user_net_worth_peaks peaks on peaks.user_id = $1
  left join liked on true
  left join metrics on true
  left join creators on true
  left join referrals on true
  left join mod_tickets on true
  left join charity on true
  left join leagues_cte on true
  left join comments on true
  left join created on true
  left join account_age on true
  left join longest_streak on true`
