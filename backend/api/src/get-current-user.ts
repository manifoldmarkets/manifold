import { User } from 'common/user'
import { APIError, type APIHandler } from './helpers/endpoint'
import { createSupabaseClient } from 'shared/supabase/init'
import { toLiteUser } from 'common/api/user-types'

export const getCurrentUser: APIHandler<'me'> = async (_, auth) => {
  const db = createSupabaseClient()

  const q = db.from('users').select('data').eq('id', auth.uid)

  const { data, error } = await q
  if (error)
    throw new APIError(500, 'Error fetching user data: ' + error.message)

  if (!data.length) throw new APIError(401, 'Your account was not found')

  return toLiteUser(data[0].data as unknown as User)
}
