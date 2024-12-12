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
import { assertUnreachable } from 'common/util/types'

export const getLeaderboard: APIHandler<'leaderboard'> = async ({
  groupId,
  limit: limitValue,
  token,
  kind,
}) => {
  const pg = createSupabaseDirectClient()

  if (kind === 'referral') {
    const data = await pg.any(
      `select ur.id, ur.total_referrals, ur.total_referred_profit, ur.total_referred_cash_profit
      from user_referrals_profit ur
      join users u on ur.id = u.id
      where coalesce((u.data->>'isBannedFromPosting')::boolean, false) is not true
      limit $1`,
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
      join('users u on u.id = uph.user_id'),
      select('uph.user_id as user_id'),
      token === 'MANA'
        ? select('uph.profit as score')
        : select(
            'uph.cash_balance + uph.cash_investment_value - uph.total_cash_deposits as score'
          ),
      where('user_id not in ($1:list)', [HIDE_FROM_LEADERBOARD_USER_IDS]),
      where(`coalesce((u.data->>'isBannedFromPosting')::boolean, false) is not true`),
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
    join('users u on u.id = ' + (kind === 'creator' ? 'c.creator_id' : 'ucm.user_id')),
    where('ucm.answer_id is null'),
    where(`coalesce((c.data->'isRanked')::boolean, true) = true`),
    where(`coalesce((u.data->>'isBannedFromPosting')::boolean, false) is not true`),

    kind === 'creator' && [
      select('c.creator_id as user_id, count(*) as score'),
      groupBy('c.creator_id'),
    ],

    (kind === 'profit' || kind === 'loss') && [
      select(`user_id, sum(profit) as score`),
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
      (token === 'MANA'
        ? where(
            `c.id in (select contract_id from group_contracts where group_id = $<groupId>)`,
            { groupId }
          )
        : token === 'CASH'
        ? where(
            `c.data->>'siblingContractId' in (select contract_id from group_contracts where group_id = $<groupId>)`,
            { groupId }
          )
        : assertUnreachable(token)),
    orderBy(kind === 'loss' ? 'score asc' : 'score desc nulls last'),
    limit(limitValue)
  )

  return await pg.map(query, [], (r) => ({
    userId: r.user_id,
    score: parseFloat(r.score),
  }))
}
