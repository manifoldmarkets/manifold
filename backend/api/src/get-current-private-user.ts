import { createSupabaseClient } from 'shared/supabase/init'
import { APIError, APIHandler } from './helpers/endpoint'
import { PrivateUser } from 'common/user'

export const getCurrentPrivateUser: APIHandler<'me/private'> = async (
  _,
  auth
) => {
  const db = createSupabaseClient()

  const q = db.from('private_users').select('data').eq('id', auth.uid)

  const { data, error } = await q

  if (error) {
    throw new APIError(
      500,
      'Error fetching private user data: ' + error.message
    )
  }

  if (!data.length) {
    throw new APIError(401, 'Your account was not found')
  }

  return data[0].data as PrivateUser
}
