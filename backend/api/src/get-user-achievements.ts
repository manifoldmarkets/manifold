import { APIHandler } from 'api/helpers/endpoint'
// NOTE: Duplication warning
// The ranks below (apart from trades) come from the materialized views in
// backend/supabase/achievement_materialized_views.sql, refreshed nightly.
// If you add/remove/rename achievement fields here, ALSO update that SQL file
// and the API return type in common/src/api/schema.ts ('get-user-achievements').
// Trades and their rank are live, from user_stats (dev-docs/user-stats.md).
import { APIResponse } from 'common/api/schema'
import { HOUR_MS, MINUTE_MS } from 'common/util/time'
import {
  SupabaseDirectClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { isUserStatsTradesReady } from 'shared/user-stats-backfill'

type Rank = { rank: number | null; percentile: number | null }
type RankKey = keyof APIResponse<'get-user-achievements'>['ranks']

// Returns flat achievement-style statistics for a given user, with ranks
export const getUserAchievements: APIHandler<'get-user-achievements'> = async ({
  userId,
}) => loadUserAchievements(userId)

export async function loadUserAchievements(
  userId: string
): Promise<APIResponse<'get-user-achievements'>> {
  const pg = createSupabaseDirectClient()
  const [result, trades, N] = await Promise.all([
    pg.oneOrNone<StatsRow>(STATS_QUERY, [userId]),
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

  return {
    userId,
    creatorTraders: Number(result?.creator_traders ?? 0),
    totalReferrals: Number(result?.total_referrals ?? 0),
    totalReferredProfitMana: Number(result?.total_referred_profit_mana ?? 0),
    totalVolumeMana: Number(result?.total_volume_mana ?? 0),
    seasonsPlatinumOrHigher: Number(result?.seasons_platinum_or_higher ?? 0),
    seasonsDiamondOrHigher: Number(result?.seasons_diamond_or_higher ?? 0),
    seasonsMasters: Number(result?.seasons_masters ?? 0),
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
  if (await userStatsReady(pg)) {
    // Count and rank in one statement, so a trade landing in between can't
    // rank someone below themselves. A user's count is their live row plus
    // their backfilled history. Competition rank among everyone with a
    // counted trade, by one pass over the two narrow tables (no index on
    // trades, which keeps the per-bet updates HOT); none for 0.
    const row = await pg.one<{ count: number; rank: number | null }>(
      `with totals as (
         select user_id, coalesce(s.trades, 0) + coalesce(b.trades, 0) as trades
         from user_stats s
         full join user_stats_baseline b using (user_id)
       ),
       mine as (
         select coalesce((select trades from totals where user_id = $1), 0) as trades
       )
       select
         mine.trades as count,
         case when mine.trades > 0
           then (select count(*) + 1 from totals where totals.trades > mine.trades)
         end as rank
       from mine`,
      [userId]
    )
    return {
      count: Math.max(0, Number(row.count)),
      rank: row.rank === null ? null : Number(row.rank),
    }
  }
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
      count(*) as total_referrals,
      sum(uphl.balance + uphl.spice_balance + uphl.investment_value - uphl.total_deposits)
        as total_referred_profit_mana
    from users referred
    join user_portfolio_history_latest uphl on uphl.user_id = referred.id
    where referred.data->>'referredByUserId' = $1
      and exists (select 1 from users referrer where referrer.id = $1)
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
  created as (
    select
      count(*) as total_markets_created,
      coalesce(sum((c.data->>'totalLiquidity')::numeric), 0) as total_liquidity_created_markets
    from contracts c
    where c.creator_id = $1 and c.token = 'MANA'
  ),
  account_age as (
    select round(
      (
        extract(epoch from (now() - u.created_time)) / (365.25*24*60*60)
      )::numeric,
      2
    ) as account_age_years
    from users u
    where u.id = $1
  ),
  longest_streak as (
    select coalesce(max((tx.data->'data'->>'currentBettingStreak')::int), 0) as longest_betting_streak
    from txns tx
    where tx.to_id = $1
      and tx.category = 'BETTING_STREAK_BONUS'
  )
  select
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
