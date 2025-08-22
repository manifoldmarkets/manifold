import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

// Returns flat achievement-style statistics for a given user (no ranks)
export const getUserAchievements: APIHandler<'get-user-achievements'> = async ({
  userId,
}) => {
  const pg = createSupabaseDirectClient()

  // Detect if per-achievement MVs exist; else fall back to monolithic MV; else no MV
  const perMVReg = await pg.oneOrNone(
    "select to_regclass('public.mv_ach_volume') as reg"
  )
  const hasPerMV = !!perMVReg?.reg

  const mvReg = await pg.oneOrNone(
    "select to_regclass('public.mv_user_achievement_stats') as reg"
  )
  const hasMV = !!mvReg?.reg

  const queryWithPerMV = `with base as (
        select $1::text as uid
      ),
      portfolio as (
        select
          coalesce(profit, balance + spice_balance + investment_value - total_deposits) as total_profit_mana
        from user_portfolio_history_latest
        where user_id = (select uid from base)
      ),
      portfolio_maxes as (
        select
          max(balance) as highest_balance_mana,
          max(investment_value) as highest_invested_mana,
          max(balance + investment_value) as highest_networth_mana,
          max(loan_total) as highest_loan_mana
        from user_portfolio_history
        where user_id = (select uid from base)
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
      volume as (
        select
          sum(case when c.token = 'MANA' then (coalesce((ucm.data->>'totalAmountSold')::numeric,0) + coalesce((ucm.data->>'totalAmountInvested')::numeric,0)) else 0 end) as total_volume_mana
        from user_contract_metrics ucm
        join contracts c on c.id = ucm.contract_id
        where ucm.user_id = (select uid from base) and ucm.answer_id is null
      ),
      leagues_cte as (
        select
          count(*) filter (where division >= 3) as seasons_gold_or_higher,
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
        select count(*) as total_trades_count
        from contract_bets b
        join contracts c on c.id = b.contract_id
        where b.user_id = (select uid from base)
          and not coalesce(b.is_redemption, false)
          and coalesce(b.is_filled, true)
          and not coalesce(b.is_cancelled, false)
          and c.token = 'MANA'
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
      streak as (
        select coalesce((data->>'currentBettingStreak')::int, 0) as current_betting_streak
        from users
        where id = (select uid from base)
      )
      select
        (select uid from base) as user_id,
        coalesce(portfolio.total_profit_mana, 0) as total_profit_mana,
        coalesce(creators.creator_traders, 0) as creator_traders,
        coalesce(referrals.total_referrals, 0) as total_referrals,
        coalesce(referrals.total_referred_profit_mana, 0) as total_referred_profit_mana,
        coalesce(volume.total_volume_mana, 0) as total_volume_mana,
        coalesce(leagues_cte.seasons_gold_or_higher, 0) as seasons_gold_or_higher,
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
        coalesce(streak.current_betting_streak, 0) as current_betting_streak,
        coalesce(portfolio_maxes.highest_balance_mana, 0) as highest_balance_mana,
        coalesce(portfolio_maxes.highest_invested_mana, 0) as highest_invested_mana,
        coalesce(portfolio_maxes.highest_networth_mana, 0) as highest_networth_mana,
        coalesce(portfolio_maxes.highest_loan_mana, 0) as highest_loan_mana,
        json_build_object(
          'volume', json_build_object('rank', (select volume_rank from mv_ach_volume where user_id = (select uid from base)), 'percentile', null),
          'trades', json_build_object('rank', (select trades_rank from mv_ach_trades where user_id = (select uid from base)), 'percentile', null),
          'marketsCreated', json_build_object('rank', (select markets_created_rank from mv_ach_markets_created where user_id = (select uid from base)), 'percentile', null),
          'comments', json_build_object('rank', (select comments_rank from mv_ach_comments where user_id = (select uid from base)), 'percentile', null),
          'seasonsMasters', json_build_object('rank', (select seasons_masters_rank from mv_ach_leagues where user_id = (select uid from base)), 'percentile', null),
          'largestLeagueSeasonEarnings', json_build_object('rank', (select largest_league_season_earnings_rank from mv_ach_leagues where user_id = (select uid from base)), 'percentile', null),
          'liquidity', json_build_object('rank', (select liquidity_rank from mv_ach_liquidity where user_id = (select uid from base)), 'percentile', null),
          'profitableMarkets', json_build_object('rank', (select profitable_markets_rank from mv_ach_pnl where user_id = (select uid from base)), 'percentile', null),
          'unprofitableMarkets', json_build_object('rank', (select unprofitable_markets_rank from mv_ach_pnl where user_id = (select uid from base)), 'percentile', null),
          'largestProfitableTrade', json_build_object('rank', (select largest_profitable_trade_rank from mv_ach_pnl where user_id = (select uid from base)), 'percentile', null),
          'largestUnprofitableTrade', json_build_object('rank', (select largest_unprofitable_trade_rank from mv_ach_pnl where user_id = (select uid from base)), 'percentile', null),
          'highestBalance', json_build_object('rank', (select highest_balance_rank from mv_ach_portfolio_maxes where user_id = (select uid from base)), 'percentile', null),
          'highestInvested', json_build_object('rank', (select highest_invested_rank from mv_ach_portfolio_maxes where user_id = (select uid from base)), 'percentile', null),
          'highestNetworth', json_build_object('rank', (select highest_networth_rank from mv_ach_portfolio_maxes where user_id = (select uid from base)), 'percentile', null),
          'highestLoan', json_build_object('rank', (select highest_loan_rank from mv_ach_portfolio_maxes where user_id = (select uid from base)), 'percentile', null)
        ) as ranks_json
      from base
      left join portfolio on true
      left join portfolio_maxes on true
      left join creators on true
      left join referrals on true
      left join volume on true
      left join leagues_cte on true
      left join league_ranks on true
      left join comments on true
      left join liquidity on true
      left join trades on true
      left join markets_created on true
      left join account_age on true
      left join trade_stats on true
      left join streak on true`

  const queryWithMV = `with base as (
        select $1::text as uid
      ),
      mv as (
        select * from mv_user_achievement_stats where user_id = (select uid from base)
      ),
      portfolio as (
        select
          coalesce(profit, balance + spice_balance + investment_value - total_deposits) as total_profit_mana
        from user_portfolio_history_latest
        where user_id = (select uid from base)
      ),
      portfolio_maxes as (
        select
          max(balance) as highest_balance_mana,
          max(investment_value) as highest_invested_mana,
          max(balance + investment_value) as highest_networth_mana,
          max(loan_total) as highest_loan_mana
        from user_portfolio_history
        where user_id = (select uid from base)
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
      volume as (
        select
          sum(case when c.token = 'MANA' then (coalesce((ucm.data->>'totalAmountSold')::numeric,0) + coalesce((ucm.data->>'totalAmountInvested')::numeric,0)) else 0 end) as total_volume_mana
        from user_contract_metrics ucm
        join contracts c on c.id = ucm.contract_id
        where ucm.user_id = (select uid from base) and ucm.answer_id is null
      ),
      leagues_cte as (
        select
          count(*) filter (where division >= 3) as seasons_gold_or_higher,
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
        select count(*) as total_trades_count
        from contract_bets b
        join contracts c on c.id = b.contract_id
        where b.user_id = (select uid from base)
          and not coalesce(b.is_redemption, false)
          and coalesce(b.is_filled, true)
          and not coalesce(b.is_cancelled, false)
          and c.token = 'MANA'
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
      streak as (
        select coalesce((data->>'currentBettingStreak')::int, 0) as current_betting_streak
        from users
        where id = (select uid from base)
      )
      select
        (select uid from base) as user_id,
        coalesce(portfolio.total_profit_mana, 0) as total_profit_mana,
        coalesce(creators.creator_traders, 0) as creator_traders,
        coalesce(referrals.total_referrals, 0) as total_referrals,
        coalesce(referrals.total_referred_profit_mana, 0) as total_referred_profit_mana,
        coalesce(volume.total_volume_mana, 0) as total_volume_mana,
        coalesce(leagues_cte.seasons_gold_or_higher, 0) as seasons_gold_or_higher,
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
        coalesce(streak.current_betting_streak, 0) as current_betting_streak,
        coalesce(portfolio_maxes.highest_balance_mana, 0) as highest_balance_mana,
        coalesce(portfolio_maxes.highest_invested_mana, 0) as highest_invested_mana,
        coalesce(portfolio_maxes.highest_networth_mana, 0) as highest_networth_mana,
        coalesce(portfolio_maxes.highest_loan_mana, 0) as highest_loan_mana,
        json_build_object(
          'volume', json_build_object('rank', (select volume_rank from mv), 'percentile', (select volume_percentile from mv)),
          'trades', json_build_object('rank', (select trades_rank from mv), 'percentile', (select trades_percentile from mv)),
          'marketsCreated', json_build_object('rank', (select markets_created_rank from mv), 'percentile', (select markets_created_percentile from mv)),
          'comments', json_build_object('rank', (select comments_rank from mv), 'percentile', (select comments_percentile from mv)),
          'seasonsMasters', json_build_object('rank', (select seasons_masters_rank from mv), 'percentile', (select seasons_masters_percentile from mv)),
          'seasonsRank1ByCohort', json_build_object('rank', (select seasons_rank1_by_cohort_rank from mv), 'percentile', (select seasons_rank1_by_cohort_percentile from mv)),
          'seasonsRank1Masters', json_build_object('rank', (select seasons_rank1_masters_rank from mv), 'percentile', (select seasons_rank1_masters_percentile from mv)),
          'largestLeagueSeasonEarnings', json_build_object('rank', (select largest_league_season_earnings_rank from mv), 'percentile', (select largest_league_season_earnings_percentile from mv)),
          'liquidity', json_build_object('rank', (select liquidity_rank from mv), 'percentile', (select liquidity_percentile from mv)),
          'profitableMarkets', json_build_object('rank', (select profitable_markets_rank from mv), 'percentile', (select profitable_markets_percentile from mv)),
          'unprofitableMarkets', json_build_object('rank', (select unprofitable_markets_rank from mv), 'percentile', (select unprofitable_markets_percentile from mv)),
          'largestProfitableTrade', json_build_object('rank', (select largest_profitable_trade_rank from mv), 'percentile', (select largest_profitable_trade_percentile from mv)),
          'largestUnprofitableTrade', json_build_object('rank', (select largest_unprofitable_trade_rank from mv), 'percentile', (select largest_unprofitable_trade_percentile from mv)),
          'highestBalance', json_build_object('rank', (select highest_balance_rank from mv), 'percentile', (select highest_balance_percentile from mv)),
          'highestInvested', json_build_object('rank', (select highest_invested_rank from mv), 'percentile', (select highest_invested_percentile from mv)),
          'highestNetworth', json_build_object('rank', (select highest_networth_rank from mv), 'percentile', (select highest_networth_percentile from mv)),
          'highestLoan', json_build_object('rank', (select highest_loan_rank from mv), 'percentile', (select highest_loan_percentile from mv))
        ) as ranks_json
      from base
      left join portfolio on true
      left join portfolio_maxes on true
      left join creators on true
      left join referrals on true
      left join volume on true
      left join leagues_cte on true
      left join league_ranks on true
      left join comments on true
      left join liquidity on true
      left join trades on true
      left join markets_created on true
      left join account_age on true
      left join trade_stats on true
      left join streak on true`

  const queryWithoutMV = `with base as (
        select $1::text as uid
      ),
      portfolio as (
        select
          coalesce(profit, balance + spice_balance + investment_value - total_deposits) as total_profit_mana
        from user_portfolio_history_latest
        where user_id = (select uid from base)
      ),
      portfolio_maxes as (
        select
          max(balance) as highest_balance_mana,
          max(investment_value) as highest_invested_mana,
          max(balance + investment_value) as highest_networth_mana,
          max(loan_total) as highest_loan_mana
        from user_portfolio_history
        where user_id = (select uid from base)
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
      volume as (
        select
          sum(case when c.token = 'MANA' then (coalesce((ucm.data->>'totalAmountSold')::numeric,0) + coalesce((ucm.data->>'totalAmountInvested')::numeric,0)) else 0 end) as total_volume_mana
        from user_contract_metrics ucm
        join contracts c on c.id = ucm.contract_id
        where ucm.user_id = (select uid from base) and ucm.answer_id is null
      ),
      leagues_cte as (
        select
          count(*) filter (where division >= 3) as seasons_gold_or_higher,
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
        select count(*) as total_trades_count
        from contract_bets b
        join contracts c on c.id = b.contract_id
        where b.user_id = (select uid from base)
          and not coalesce(b.is_redemption, false)
          and coalesce(b.is_filled, true)
          and not coalesce(b.is_cancelled, false)
          and c.token = 'MANA'
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
      streak as (
        select coalesce((data->>'currentBettingStreak')::int, 0) as current_betting_streak
        from users
        where id = (select uid from base)
      )
      select
        (select uid from base) as user_id,
        coalesce(portfolio.total_profit_mana, 0) as total_profit_mana,
        coalesce(creators.creator_traders, 0) as creator_traders,
        coalesce(referrals.total_referrals, 0) as total_referrals,
        coalesce(referrals.total_referred_profit_mana, 0) as total_referred_profit_mana,
        coalesce(volume.total_volume_mana, 0) as total_volume_mana,
        coalesce(leagues_cte.seasons_gold_or_higher, 0) as seasons_gold_or_higher,
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
        coalesce(streak.current_betting_streak, 0) as current_betting_streak,
        coalesce(portfolio_maxes.highest_balance_mana, 0) as highest_balance_mana,
        coalesce(portfolio_maxes.highest_invested_mana, 0) as highest_invested_mana,
        coalesce(portfolio_maxes.highest_networth_mana, 0) as highest_networth_mana,
        coalesce(portfolio_maxes.highest_loan_mana, 0) as highest_loan_mana,
        null::jsonb as ranks_json
      from base
      left join portfolio on true
      left join portfolio_maxes on true
      left join creators on true
      left join referrals on true
      left join volume on true
      left join leagues_cte on true
      left join league_ranks on true
      left join comments on true
      left join liquidity on true
      left join trades on true
      left join markets_created on true
      left join account_age on true
      left join trade_stats on true
      left join streak on true`

  const result = await pg.oneOrNone(
    hasPerMV ? queryWithPerMV : hasMV ? queryWithMV : queryWithoutMV,
    [userId]
  )

  const defaultRanks = {
    volume: { rank: null, percentile: null },
    trades: { rank: null, percentile: null },
    marketsCreated: { rank: null, percentile: null },
    comments: { rank: null, percentile: null },
    seasonsMasters: { rank: null, percentile: null },
    seasonsRank1ByCohort: { rank: null, percentile: null },
    seasonsRank1Masters: { rank: null, percentile: null },
    largestLeagueSeasonEarnings: { rank: null, percentile: null },
    liquidity: { rank: null, percentile: null },
    profitableMarkets: { rank: null, percentile: null },
    unprofitableMarkets: { rank: null, percentile: null },
    largestProfitableTrade: { rank: null, percentile: null },
    largestUnprofitableTrade: { rank: null, percentile: null },
    highestBalance: { rank: null, percentile: null },
    highestInvested: { rank: null, percentile: null },
    highestNetworth: { rank: null, percentile: null },
    highestLoan: { rank: null, percentile: null },
  }

  const rawRanks = (result?.ranks_json as any) ?? defaultRanks
  let ranks = rawRanks
  if (hasPerMV || hasMV) {
    const { n } = await pg.one(
      hasPerMV
        ? 'select count(*)::int as n from mv_ach_volume'
        : 'select count(*)::int as n from mv_user_achievement_stats'
    )
    const N = Number(n ?? 0)
    const conv = (e?: { rank: number | null; percentile: number | null }) =>
      e?.rank && N > 0
        ? { rank: e.rank, percentile: (e.rank / N) * 100 }
        : { rank: e?.rank ?? null, percentile: null }

    ranks = {
      volume: conv(rawRanks.volume),
      trades: conv(rawRanks.trades),
      marketsCreated: conv(rawRanks.marketsCreated),
      comments: conv(rawRanks.comments),
      seasonsMasters: conv(rawRanks.seasonsMasters),
      seasonsRank1ByCohort: conv(rawRanks.seasonsRank1ByCohort),
      seasonsRank1Masters: conv(rawRanks.seasonsRank1Masters),
      largestLeagueSeasonEarnings: conv(rawRanks.largestLeagueSeasonEarnings),
      liquidity: conv(rawRanks.liquidity),
      profitableMarkets: conv(rawRanks.profitableMarkets),
      unprofitableMarkets: conv(rawRanks.unprofitableMarkets),
      largestProfitableTrade: conv(rawRanks.largestProfitableTrade),
      largestUnprofitableTrade: conv(rawRanks.largestUnprofitableTrade),
      highestBalance: conv(rawRanks.highestBalance),
      highestInvested: conv(rawRanks.highestInvested),
      highestNetworth: conv(rawRanks.highestNetworth),
      highestLoan: conv(rawRanks.highestLoan),
    }
  }

  return {
    userId,
    totalProfitMana: Number(result?.total_profit_mana ?? 0),
    creatorTraders: Number(result?.creator_traders ?? 0),
    totalReferrals: Number(result?.total_referrals ?? 0),
    totalReferredProfitMana: Number(result?.total_referred_profit_mana ?? 0),
    totalVolumeMana: Number(result?.total_volume_mana ?? 0),
    seasonsGoldOrHigher: Number(result?.seasons_gold_or_higher ?? 0),
    seasonsPlatinumOrHigher: Number(result?.seasons_platinum_or_higher ?? 0),
    seasonsDiamondOrHigher: Number(result?.seasons_diamond_or_higher ?? 0),
    seasonsMasters: Number(result?.seasons_masters ?? 0),
    seasonsRank1ByCohort: Number(result?.seasons_rank1_by_cohort ?? 0),
    seasonsRank1Masters: Number(result?.seasons_rank1_masters ?? 0),
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
    currentBettingStreak: Number(result?.current_betting_streak ?? 0),
    highestBalanceMana: Number(result?.highest_balance_mana ?? 0),
    highestInvestedMana: Number(result?.highest_invested_mana ?? 0),
    highestNetworthMana: Number(result?.highest_networth_mana ?? 0),
    highestLoanMana: Number(result?.highest_loan_mana ?? 0),
    ranks,
  }
}
