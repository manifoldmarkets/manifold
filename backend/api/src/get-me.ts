import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseClient } from 'shared/supabase/init'
import { toUserAPIResponse } from 'common/api/user-types'
import { convertUser } from 'common/supabase/users'

export const getMe: APIHandler<'me'> = async (_, auth) => {
  const db = createSupabaseClient()
  const { data, error } = await db.from('users').select().eq('id', auth.uid)
  if (error)
    throw new APIError(500, 'Error fetching user data: ' + error.message)

  if (!data.length) throw new APIError(401, 'Your account was not found')

  return toUserAPIResponse(convertUser(data[0]))
}
