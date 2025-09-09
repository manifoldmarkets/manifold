import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

// Returns flat achievement-style statistics for a given user (no ranks)
export const getUserAchievements: APIHandler<'get-user-achievements'> = async ({
  userId,
}) => {
  const pg = createSupabaseDirectClient()

  const queryWithPerMV = `with base as (
        select $1::text as uid
      ),
      
      creators as (
        select (data->'creatorTraders'->>'allTime')::int as creator_traders
        from users
        where id = (select uid from base)
      ),
      referrals as (
        select total_referrals, total_referred_profit as total_referred_profit_mana
        from user_referrals_profit
        where id = (select uid from base)
      ),
      mod_tickets as (
        select count(*) as mod_tickets_resolved
        from txns
        where category = 'ADMIN_REWARD' and to_id = (select uid from base)
        and data -> 'data' ->> 'updateType' = 'resolved'
      ),
      charity as (
        select coalesce(sum(case when token = 'M$' then amount / 100.0 else 0 end), 0)
             + coalesce(sum(case when token = 'CASH' then amount else 0 end), 0)
             + coalesce(sum(case when token = 'SPICE' then amount / 1000.0 else 0 end), 0) as charity_donated_mana
        from txns
        where category = 'CHARITY' and from_id = (select uid from base)
      ),
      volume as (
        select
          sum(case when c.token = 'MANA' then (coalesce((ucm.data->>'totalAmountSold')::numeric,0) + coalesce((ucm.data->>'totalAmountInvested')::numeric,0)) else 0 end) as total_volume_mana
        from user_contract_metrics ucm
        join contracts c on c.id = ucm.contract_id
        where ucm.user_id = (select uid from base) and ucm.answer_id is null
      ),
      leagues_cte as (
        select
          count(*) filter (where division >= 4) as seasons_platinum_or_higher,
          count(*) filter (where division >= 5) as seasons_diamond_or_higher,
          count(*) filter (where division = 6) as seasons_masters
        from leagues
        where user_id = (select uid from base)
      ),
      league_ranks as (
        select
          max(mana_earned) as largest_league_season_earnings
        from user_league_info
        where user_id = (select uid from base)
      ),
      comments as (
        select
          (select count(*) from contract_comments where user_id = (select uid from base)) +
          (select count(*) from old_post_comments where user_id = (select uid from base)) as number_of_comments
      ),
      liquidity as (
        select coalesce(sum((c.data->>'totalLiquidity')::numeric), 0) as total_liquidity_created_markets
        from contracts c
        where c.creator_id = (select uid from base) and c.token = 'MANA'
      ),
      trades as (
        select coalesce(total_trades_count, 0) as total_trades_count
        from ach_trades
        where user_id = (select uid from base)
      ),
      markets_created as (
        select count(*) as total_markets_created
        from contracts c
        where c.creator_id = (select uid from base)
          and c.token = 'MANA'
      ),
      account_age as (
        select round(
          (
            extract(epoch from (now() - u.created_time)) / (365.25*24*60*60)
          )::numeric,
          2
        ) as account_age_years
        from users u
        where u.id = (select uid from base)
      ),
      trade_stats as (
        select
          count(*) filter (where coalesce(ucm.profit, 0) > 0) as profitable_trades_count,
          count(*) filter (where coalesce(ucm.profit, 0) < 0) as unprofitable_trades_count,
          max(ucm.profit) filter (where coalesce(ucm.profit, 0) > 0) as largest_profitable_trade_value,
          min(ucm.profit) filter (where coalesce(ucm.profit, 0) < 0) as largest_unprofitable_trade_value
        from user_contract_metrics ucm
        join contracts c on c.id = ucm.contract_id
        where ucm.user_id = (select uid from base)
          and ucm.answer_id is null
          and c.token = 'MANA'
      ),
      longest_streak as (
        select coalesce(max((tx.data->'data'->>'currentBettingStreak')::int), 0) as longest_betting_streak
        from txns tx
        where tx.to_id = (select uid from base)
          and tx.category = 'BETTING_STREAK_BONUS'
      )
      select
        (select uid from base) as user_id,
        coalesce(creators.creator_traders, 0) as creator_traders,
        coalesce(referrals.total_referrals, 0) as total_referrals,
        coalesce(referrals.total_referred_profit_mana, 0) as total_referred_profit_mana,
        coalesce(volume.total_volume_mana, 0) as total_volume_mana,
        coalesce(leagues_cte.seasons_platinum_or_higher, 0) as seasons_platinum_or_higher,
        coalesce(leagues_cte.seasons_diamond_or_higher, 0) as seasons_diamond_or_higher,
        coalesce(leagues_cte.seasons_masters, 0) as seasons_masters,
        coalesce(league_ranks.largest_league_season_earnings, 0) as largest_league_season_earnings,
        coalesce(comments.number_of_comments, 0) as number_of_comments,
        coalesce(liquidity.total_liquidity_created_markets, 0) as total_liquidity_created_markets,
        coalesce(trades.total_trades_count, 0) as total_trades_count,
        coalesce(markets_created.total_markets_created, 0) as total_markets_created,
        coalesce(account_age.account_age_years, 0) as account_age_years,
        coalesce(trade_stats.profitable_trades_count, 0) as profitable_markets_count,
        coalesce(trade_stats.unprofitable_trades_count, 0) as unprofitable_markets_count,
        coalesce(trade_stats.largest_profitable_trade_value, 0) as largest_profitable_trade_value,
        coalesce(trade_stats.largest_unprofitable_trade_value, 0) as largest_unprofitable_trade_value,
        coalesce(longest_streak.longest_betting_streak, 0) as longest_betting_streak,
        coalesce(mod_tickets.mod_tickets_resolved, 0) as mod_tickets_resolved,
        coalesce(charity.charity_donated_mana, 0) as charity_donated_mana,
        json_build_object(
          'creatorTraders', json_build_object('rank', (select creator_traders_rank from mv_ach_creator_traders where user_id = (select uid from base)), 'percentile', null),
          'totalReferrals', json_build_object('rank', (select total_referrals_rank from mv_ach_referrals where user_id = (select uid from base)), 'percentile', null),
          'totalReferredProfit', json_build_object('rank', (select total_referred_profit_rank from mv_ach_referrals where user_id = (select uid from base)), 'percentile', null),
          'volume', json_build_object('rank', (select volume_rank from mv_ach_volume where user_id = (select uid from base)), 'percentile', null),
          'trades', json_build_object('rank', (select trades_rank from ach_trades where user_id = (select uid from base)), 'percentile', null),
          'marketsCreated', json_build_object('rank', (select markets_created_rank from mv_ach_creator_contracts where user_id = (select uid from base)), 'percentile', null),
          'comments', json_build_object('rank', (select comments_rank from mv_ach_comments where user_id = (select uid from base)), 'percentile', null),
          'seasonsPlatinumOrHigher', json_build_object('rank', (select seasons_platinum_or_higher_rank from mv_ach_leagues where user_id = (select uid from base)), 'percentile', null),
          'seasonsDiamondOrHigher', json_build_object('rank', (select seasons_diamond_or_higher_rank from mv_ach_leagues where user_id = (select uid from base)), 'percentile', null),
          'seasonsMasters', json_build_object('rank', (select seasons_masters_rank from mv_ach_leagues where user_id = (select uid from base)), 'percentile', null),
          'largestLeagueSeasonEarnings', json_build_object('rank', (select largest_league_season_earnings_rank from mv_ach_leagues where user_id = (select uid from base)), 'percentile', null),
          'liquidity', json_build_object('rank', (select liquidity_rank from mv_ach_creator_contracts where user_id = (select uid from base)), 'percentile', null),
          'profitableMarkets', json_build_object('rank', (select profitable_markets_rank from mv_ach_pnl where user_id = (select uid from base)), 'percentile', null),
          'unprofitableMarkets', json_build_object('rank', (select unprofitable_markets_rank from mv_ach_pnl where user_id = (select uid from base)), 'percentile', null),
          'largestProfitableTrade', json_build_object('rank', (select largest_profitable_trade_rank from mv_ach_pnl where user_id = (select uid from base)), 'percentile', null),
          'largestUnprofitableTrade', json_build_object('rank', (select largest_unprofitable_trade_rank from mv_ach_pnl where user_id = (select uid from base)), 'percentile', null),
          'accountAge', json_build_object('rank', (select account_age_rank from mv_ach_account_age where user_id = (select uid from base)), 'percentile', null),
          'longestBettingStreak', json_build_object('rank', (select longest_betting_streak_rank from mv_ach_txns_achievements where user_id = (select uid from base)), 'percentile', null),
          'modTickets', json_build_object('rank', (select mod_tickets_rank from mv_ach_txns_achievements where user_id = (select uid from base)), 'percentile', null),
          'charityDonated', json_build_object('rank', (select charity_donated_rank from mv_ach_txns_achievements where user_id = (select uid from base)), 'percentile', null)
        ) as ranks_json
      from base
      
      left join creators on true
      left join referrals on true
      left join mod_tickets on true
      left join charity on true
      left join volume on true
      left join leagues_cte on true
      left join league_ranks on true
      left join comments on true
      left join liquidity on true
      left join trades on true
      left join markets_created on true
      left join account_age on true
      left join trade_stats on true
      left join longest_streak on true`

  const result = await pg.oneOrNone(queryWithPerMV, [userId])

  const defaultRanks = {
    creatorTraders: { rank: null, percentile: null },
    totalReferrals: { rank: null, percentile: null },
    totalReferredProfit: { rank: null, percentile: null },
    volume: { rank: null, percentile: null },
    trades: { rank: null, percentile: null },
    marketsCreated: { rank: null, percentile: null },
    comments: { rank: null, percentile: null },
    seasonsPlatinumOrHigher: { rank: null, percentile: null },
    seasonsDiamondOrHigher: { rank: null, percentile: null },
    seasonsMasters: { rank: null, percentile: null },
    largestLeagueSeasonEarnings: { rank: null, percentile: null },
    liquidity: { rank: null, percentile: null },
    profitableMarkets: { rank: null, percentile: null },
    unprofitableMarkets: { rank: null, percentile: null },
    largestProfitableTrade: { rank: null, percentile: null },
    largestUnprofitableTrade: { rank: null, percentile: null },
    accountAge: { rank: null, percentile: null },
    longestBettingStreak: { rank: null, percentile: null },
    modTickets: { rank: null, percentile: null },
    charityDonated: { rank: null, percentile: null },
  }

  const rawRanks = (result?.ranks_json as any) ?? defaultRanks
  const { n } = await pg.one('select count(*)::int as n from mv_ach_volume')
  const N = Number(n ?? 0)
  const conv = (e?: { rank: number | null; percentile: number | null }) =>
    e?.rank && N > 0
      ? { rank: e.rank, percentile: (e.rank / N) * 100 }
      : { rank: e?.rank ?? null, percentile: null }

  const ranks = {
    creatorTraders: conv(rawRanks.creatorTraders),
    totalReferrals: conv(rawRanks.totalReferrals),
    totalReferredProfit: conv(rawRanks.totalReferredProfit),
    volume: conv(rawRanks.volume),
    trades: conv(rawRanks.trades),
    marketsCreated: conv(rawRanks.marketsCreated),
    comments: conv(rawRanks.comments),
    seasonsPlatinumOrHigher: conv(rawRanks.seasonsPlatinumOrHigher),
    seasonsDiamondOrHigher: conv(rawRanks.seasonsDiamondOrHigher),
    seasonsMasters: conv(rawRanks.seasonsMasters),
    largestLeagueSeasonEarnings: conv(rawRanks.largestLeagueSeasonEarnings),
    liquidity: conv(rawRanks.liquidity),
    profitableMarkets: conv(rawRanks.profitableMarkets),
    unprofitableMarkets: conv(rawRanks.unprofitableMarkets),
    largestProfitableTrade: conv(rawRanks.largestProfitableTrade),
    largestUnprofitableTrade: conv(rawRanks.largestUnprofitableTrade),
    accountAge: conv(rawRanks.accountAge),
    longestBettingStreak: conv(rawRanks.longestBettingStreak),
    modTickets: conv(rawRanks.modTickets),
    charityDonated: conv(rawRanks.charityDonated),
  }

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
    totalTradesCount: Number(result?.total_trades_count ?? 0),
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
