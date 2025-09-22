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

  return await pg.map(renderSql(q), [], (r) =>
    toUserAPIResponse(convertUser(r))
  )
}
