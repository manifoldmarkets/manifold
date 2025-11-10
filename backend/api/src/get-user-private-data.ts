import { isAdminId } from 'common/envs/constants'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIError, APIHandler } from './helpers/endpoint'

export const getUserPrivateData: APIHandler<'get-user-private-data'> = async (
  { userId },
  auth
) => {
  if (!isAdminId(auth.uid)) {
    throw new APIError(403, 'Only admins can access user private data')
  }

  const pg = createSupabaseDirectClient()
  const privateUser = await pg.oneOrNone(
    `select data from private_users
            where id = $1`,
    [userId],
    (r) => r?.data
  )
  if (!privateUser) throw new APIError(404, 'User not found')
  return privateUser
}
