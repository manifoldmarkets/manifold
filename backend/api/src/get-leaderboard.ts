import { APIError, APIHandler } from 'api/helpers/endpoint'
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
  if (kind === 'referral' && groupId)
    throw new APIError(400, 'Referrals are not per-topic')

  const pg = createSupabaseDirectClient()

  if (kind === 'referral') {
    const data = await pg.any(
      `select id, total_referrals, total_referred_profit
      from user_referrals_profit limit $1`,
      [limitValue]
    )

    return data.map((r) => ({
      userId: r.id,
      score: r.totalReferrals,
      totalReferredProfit: r.totalReferredProfit,
    }))
  }

  const query = renderSql(
    from('contracts c'),

    kind === 'creator' && [
      select('c.creator_id as user_id, count(*) as score'),
      groupBy('c.creator_id'),
    ],

    kind === 'profit' && [
      join('user_contract_metrics ucm on ucm.contract_id = c.id'),
      where('ucm.answer_id is null'),
      select('user_id, sum(profit) as score'),
      groupBy('user_id'),
    ],

    where('c.token = ${token}', { token }),
    groupId &&
      where(
        'c.id in (select contract_id from group_contracts where group_id = ${groupId})',
        { groupId }
      ),
    orderBy('score desc'),
    limit(limitValue)
  )

  return await pg.any(query, (r: any) => ({
    userId: r.user_id,
    score: parseFloat(r.score),
  }))
}
