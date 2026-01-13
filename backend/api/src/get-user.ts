import { toUserAPIResponse } from 'common/api/user-types'
import { convertUser, displayUserColumns } from 'common/supabase/users'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError } from 'common/api/utils'
import { removeNullOrUndefinedProps } from 'common/util/object'
import { APIHandler } from './helpers/endpoint'
import { isAdminId, isModId } from 'common/envs/constants'

// Determine visibility level based on auth context
function getVisibilityForAuth(
  authUid: string | undefined,
  targetUserId: string
): 'public' | 'self' | 'admin' {
  if (!authUid) return 'public'
  if (isAdminId(authUid) || isModId(authUid)) return 'admin'
  if (authUid === targetUserId) return 'self'
  return 'public'
}

// API handler for public user endpoints - visibility based on auth
export const getUserById: APIHandler<'user/by-id/:id'> = async (props, auth) => {
  const visibility = getVisibilityForAuth(auth?.uid, props.id)
  return getUser(props, { visibility })
}

// API handler for getting user by username - need to fetch user first to check visibility
export const getUserByUsername: APIHandler<'user/:username'> = async (
  props,
  auth
) => {
  // For username lookup, we need to fetch the user first to determine visibility
  const pg = createSupabaseDirectClient()
  const userId = await pg.oneOrNone(
    `select id from users where username = $1`,
    [props.username],
    (r) => r?.id as string | null
  )
  if (!userId) throw new APIError(404, 'User not found')

  const visibility = getVisibilityForAuth(auth?.uid, userId)
  return getUser(props, { visibility })
}

// Get user by id or username with optional visibility filtering
export const getUser = async (
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
