import { toUserAPIResponse } from 'common/api/user-types'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError, type APIHandler } from './helpers/endpoint'
import {
  select,
  from,
  limit as limitClause,
  orderBy,
  where,
  renderSql,
} from 'shared/supabase/sql-builder'
import { convertUser } from 'common/supabase/users'

export const getUsers: APIHandler<'users'> = async ({ limit, before }) => {
  const pg = createSupabaseDirectClient()

  const q = [
    select('*'),
    from('users'),
    orderBy('created_time', 'desc'),
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
