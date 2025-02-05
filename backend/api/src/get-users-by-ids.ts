import { type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { removeNullOrUndefinedProps } from 'common/util/object'

export const getUsersByIds: APIHandler<'users/by-id'> = async (props) => {
  const pg = createSupabaseDirectClient()
  const users = await pg.manyOrNone(
    `select id, name, username, data->>'avatarUrl' as "avatarUrl", data->'isBannedFromPosting' as "isBannedFromPosting"
     from users
     where id = any($1)`,
    [props.ids]
  )
  return users.map((user) => removeNullOrUndefinedProps(user))
}

export const getUserBalancesByIds: APIHandler<'users/by-id/balance'> = async (
  props
) => {
  const pg = createSupabaseDirectClient()
  const users = await pg.manyOrNone(
    `select id, balance
     from users
     where id = any($1)`,
    [props.ids]
  )
  return users.map((user) => removeNullOrUndefinedProps(user))
}
