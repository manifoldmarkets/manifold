import { APIError, type APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateUser } from 'shared/supabase/users'
import { getUser, log } from 'shared/utils'

export const dismissmodalert: APIHandler<'dismiss-mod-alert'> = async (
  _props,
  auth
) => {
  const db = createSupabaseDirectClient()
  const user = await getUser(auth.uid)

  if (!user) throw new APIError(404, 'User not found')
  if (!user.modAlert) {
    throw new APIError(400, 'No mod alert to dismiss')
  }

  await updateUser(db, auth.uid, {
    modAlert: {
      ...user.modAlert,
      dismissed: true,
    },
  })

  log('dismissed mod alert', auth.uid)
  return { success: true }
}
