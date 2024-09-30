import { toUserAPIResponse } from 'common/api/user-types'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  from,
  limit,
  orderBy,
  renderSql,
  select,
  where,
} from 'shared/supabase/sql-builder'
import { APIError, type APIHandler } from './helpers/endpoint'

export const getUsers: APIHandler<'users'> = async (props) => {
  const pg = createSupabaseDirectClient()

  const q = [
    from('users'),
    select('data'),
    limit(props.limit),
    orderBy('created_time desc'),
  ]

  if (props.before) {
    const data = await pg.oneOrNone(
      `select created_time from users where id = $1`,
      props.before
    )
    if (!data)
      throw new APIError(404, `Could not find user with id: ${props.before}`)

    q.push(where('created_time < $1', data.created_time))
  }

  return pg.map(renderSql(q), [], toUserAPIResponse)
}
