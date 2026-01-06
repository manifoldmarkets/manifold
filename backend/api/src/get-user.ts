import { toUserAPIResponse } from 'common/api/user-types'
import { convertUser, displayUserColumns } from 'common/supabase/users'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError } from 'common/api/utils'
import { removeNullOrUndefinedProps } from 'common/util/object'
import { APIHandler } from './helpers/endpoint'

// API handler for public user endpoints - uses default 'public' visibility
export const getUser: APIHandler<'user/by-id/:id'> = async (props) => {
  return getUserWithVisibility(props, { visibility: 'public' })
}

// API handler for getting user by username
export const getUserByUsername: APIHandler<'user/:username'> = async (props) => {
  return getUserWithVisibility(props, { visibility: 'public' })
}

// Internal function that can be called with visibility options
export const getUserWithVisibility = async (
  props: { id: string } | { username: string },
  options?: { visibility?: 'public' | 'self' | 'admin' }
) => {
  const pg = createSupabaseDirectClient()
  const user = await pg.oneOrNone(
    `select * from users
            where ${'id' in props ? 'id' : 'username'} = $1`,
    ['id' in props ? props.id : props.username],
    (r) => (r ? convertUser(r) : null)
  )
  if (!user) throw new APIError(404, 'User not found')

  return toUserAPIResponse(user, options)
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
