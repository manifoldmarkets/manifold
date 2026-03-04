import { toUserAPIResponse } from 'common/api/user-types'
import { convertUser } from 'common/supabase/users'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  from,
  limit as limitClause,
  orderBy,
  renderSql,
  select,
  where,
} from 'shared/supabase/sql-builder'
import { APIError, type APIHandler } from './helpers/endpoint'

export const getUsers: APIHandler<'users'> = async ({
  limit,
  before,
  order,
}) => {
  const pg = createSupabaseDirectClient()

  const q = [
    select('*'),
    from('users'),
    orderBy('created_time ' + order),
    limitClause(limit),
  ]

  if (before) {
    const beforeUser = await pg.oneOrNone(
      `select created_time from users where id = $1`,
      [before]
    )
    if (!beforeUser)
      throw new APIError(404, `Could not find user with id: ${before}`)

    q.push(where('created_time < $1', beforeUser.created_time))
  }

  const users = await pg.map(renderSql(q), [], (r) =>
    toUserAPIResponse(convertUser(r))
  )

  const userIds = users.map((u) => u.id)
  if (userIds.length === 0) return users

  const [tradeCounts, questionCounts, portfolios] = await Promise.all([
    pg.map(
      `select user_id, count(*)::int as n from contract_bets where user_id = any($1) group by user_id`,
      [userIds],
      (r: { user_id: string; n: number }) => r
    ),
    pg.map(
      `select creator_id, count(*)::int as n from contracts where creator_id = any($1) and visibility = 'public' group by creator_id`,
      [userIds],
      (r: { creator_id: string; n: number }) => r
    ),
    pg.map(
      `select ucm.user_id, sum(
        case
          when answers.prob is not null then
            coalesce(ucm.total_shares_yes, 0) * answers.prob
            + coalesce(ucm.total_shares_no, 0) * (1 - answers.prob)
          else
            coalesce(ucm.total_shares_yes, 0) * (contracts.data->>'prob')::numeric
            + coalesce(ucm.total_shares_no, 0) * (1 - (contracts.data->>'prob')::numeric)
        end
      ) as investment_value
      from user_contract_metrics ucm
      join contracts on ucm.contract_id = contracts.id
      left join answers on ucm.answer_id = answers.id
      where ucm.user_id = any($1)
        and contracts.resolution is null
        and (contracts.mechanism = 'cpmm-multi-1' or contracts.mechanism = 'cpmm-1')
        and ucm.has_shares = true
      group by ucm.user_id`,
      [userIds],
      (r: { user_id: string; investment_value: number }) => r
    ),
  ])

  const tradesByUser = new Map(tradeCounts.map((r) => [r.user_id, r.n]))
  const questionsByUser = new Map(
    questionCounts.map((r) => [r.creator_id, r.n])
  )
  const investedByUser = new Map(
    portfolios.map((r) => [r.user_id, r.investment_value])
  )

  return users.map((u) => ({
    ...u,
    numTrades: tradesByUser.get(u.id) ?? 0,
    numQuestions: questionsByUser.get(u.id) ?? 0,
    investedAmount: investedByUser.get(u.id) ?? 0,
  }))
}
