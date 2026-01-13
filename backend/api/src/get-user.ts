import { toUserAPIResponse } from 'common/api/user-types'
import { convertUser, displayUserColumns } from 'common/supabase/users'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError } from 'common/api/utils'
import { removeNullOrUndefinedProps } from 'common/util/object'
import { convertEntitlement } from 'common/shop/types'

export const getUser = async (props: { id: string } | { username: string }) => {
  const pg = createSupabaseDirectClient()
  const whereColumn = 'id' in props ? 'id' : 'username'
  const whereValue = 'id' in props ? props.id : props.username

  // Fetch user with entitlements in a single query
  const result = await pg.oneOrNone(
    `select u.*,
      (select coalesce(json_agg(e), '[]'::json)
       from user_entitlements e
       where e.user_id = u.id) as entitlements
     from users u
     where u.${whereColumn} = $1`,
    [whereValue]
  )

  if (!result) throw new APIError(404, 'User not found')

  const { entitlements: rawEntitlements, ...userRow } = result
  const user = convertUser(userRow)

  // Convert entitlements from database format
  const entitlements = (rawEntitlements || []).map(convertEntitlement)

  return toUserAPIResponse({ ...user, entitlements })
}

export const getLiteUser = async (
  props: { id: string } | { username: string }
) => {
  const pg = createSupabaseDirectClient()
  const liteUser = await pg.oneOrNone(
    `select ${displayUserColumns}
            from users
            where ${'id' in props ? 'id' : 'username'} = $1`,
    ['id' in props ? props.id : props.username]
  )
  if (!liteUser) throw new APIError(404, 'User not found')

  return removeNullOrUndefinedProps(liteUser)
}
