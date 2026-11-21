import { isAdminId } from 'common/envs/constants'
import { throwErrorIfNotAdmin } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUser, log } from 'shared/utils'
import { APIError, APIHandler } from './helpers/endpoint'

export const adminIpBanUser: APIHandler<'admin-ip-ban-user'> = async (
  { userId },
  auth
) => {
  throwErrorIfNotAdmin(auth.uid)

  if (isAdminId(userId)) {
    throw new APIError(403, 'Cannot IP ban admin account')
  }

  const user = await getUser(userId)
  if (!user) {
    throw new APIError(404, 'User not found')
  }

  const pg = createSupabaseDirectClient()
  const privateUser = await pg.oneOrNone<{ ip_address: string | null }>(
    `select data->>'initialIpAddress' as ip_address
     from private_users
     where id = $1`,
    [userId]
  )

  const ipAddress = privateUser?.ip_address
  if (!ipAddress) {
    throw new APIError(400, 'User has no signup IP to block')
  }

  const existing = await pg.oneOrNone<{ id: number }>(
    `select id from signup_blocklist
     where entry_type = 'ip' and value = $1
     limit 1`,
    [ipAddress]
  )

  if (existing) {
    return { success: true, added: false, ipAddress }
  }

  await pg.none(
    `insert into signup_blocklist (entry_type, value, reason, source_user_id)
     values ('ip', $1, $2, $3)`,
    [ipAddress, 'Added from admin new users page', userId]
  )

  log(`Admin ${auth.uid} IP banned ${userId} (${ipAddress})`)

  return { success: true, added: true, ipAddress }
}
