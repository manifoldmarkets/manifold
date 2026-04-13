import { APIError, type APIHandler } from 'api/helpers/endpoint'
import { isAdminId } from 'common/envs/constants'
import { trackPublicEvent } from 'shared/analytics'
import { throwErrorIfNotMod } from 'shared/helpers/auth'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateUser } from 'shared/supabase/users'
import { getUser, log } from 'shared/utils'

export const setbotstatus: APIHandler<'set-bot-status'> = async (
  props,
  auth
) => {
  const { userId, isBot } = props
  throwErrorIfNotMod(auth.uid)
  if (isAdminId(userId))
    throw new APIError(403, 'Cannot modify admin bot status')

  const user = await getUser(userId)
  if (!user) throw new APIError(404, 'User not found')

  const pg = createSupabaseDirectClient()
  await updateUser(pg, userId, { isBot })

  await trackPublicEvent(auth.uid, 'set bot status', { userId, isBot })
  log('set bot status', { userId, isBot, by: auth.uid })
  return { success: true }
}
