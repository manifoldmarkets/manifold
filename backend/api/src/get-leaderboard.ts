import { APIHandler } from 'api/helpers/endpoint'
import { HIDE_FROM_LEADERBOARD_USER_IDS } from 'common/envs/constants'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  renderSql,
  select,
  from,
  where,
  orderBy,
  limit,
  join,
  groupBy,
} from 'shared/supabase/sql-builder'

export const getLeaderboard: APIHandler<'leaderboard'> = async ({
  groupId,
  limit: limitValue,
  token,
  kind,
}) => {
  const pg = createSupabaseDirectClient()

  if (kind === 'referral') {
    const data = await pg.any(
      `select id, total_referrals, total_referred_profit, total_referred_cash_profit
      from user_referrals_profit limit $1`,
      [limitValue]
    )

    return data.map((r) => ({
      userId: r.id,
      score: r.total_referrals,
      totalReferredProfit:
        token === 'CASH'
          ? r.total_referred_cash_profit
          : r.total_referred_profit,
    }))
  }

  if ((kind == 'profit' || kind == 'loss') && !groupId) {
    const query = renderSql(
      from('user_portfolio_history_latest uph'),
      select('uph.user_id as user_id'),
      token === 'MANA'
        ? select(
            'uph.balance + uph.spice_balance + uph.investment_value - uph.total_deposits as score'
          )
        : select(
            'uph.cash_balance + uph.cash_investment_value - uph.total_cash_deposits as score'
          ),
      where('user_id not in ($1:list)', [HIDE_FROM_LEADERBOARD_USER_IDS]),
      orderBy(kind === 'loss' ? 'score asc' : 'score desc nulls last'),
      limit(limitValue)
    )
    return await pg.map(query, [], (r) => ({
      userId: r.user_id,
      score: r.score,
    }))
  }

  const query = renderSql(
    from('contracts c'),
    join('user_contract_metrics ucm on ucm.contract_id = c.id'),
    where('ucm.answer_id is null'),

    kind === 'creator' && [
      select('c.creator_id as user_id, count(*) as score'),
      groupBy('c.creator_id'),
    ],

    (kind === 'profit' || kind === 'loss') && [
      select(
        `user_id, nullif(sum(profit + coalesce(profit_adjustment, 0)), 'NaN') as score`
      ),
      groupBy('user_id'),
      where('user_id not in ($1:list)', [HIDE_FROM_LEADERBOARD_USER_IDS]),
    ],

    kind === 'volume' && [
      select('user_id'),
      select(
        `sum((ucm.data->'totalAmountSold')::numeric + (ucm.data->'totalAmountInvested')::numeric) as score`
      ),
      groupBy('user_id'),
    ],

    where('c.token = ${token}', { token }),

    groupId &&
      where(
        'c.id in (select contract_id from group_contracts where group_id = ${groupId})',
        { groupId }
      ),
    orderBy(kind === 'loss' ? 'score asc' : 'score desc nulls last'),
    limit(limitValue)
  )

  return await pg.map(query, [], (r) => ({
    userId: r.user_id,
    score: parseFloat(r.score),
  }))
}
