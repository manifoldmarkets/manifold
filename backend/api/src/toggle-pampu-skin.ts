import { APIError, APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const togglePampuSkin: APIHandler<'toggle-pampu-skin'> = async (
  { equipped },
  auth
) => {
  const userId = auth.uid
  if (!userId) throw new APIError(401, 'You must be signed in')

  const pg = createSupabaseDirectClient()

  // Check if user owns the pampu-skin
  const entitlement = await pg.oneOrNone(
    `select * from user_entitlements 
     where user_id = $1 and entitlement_id = 'pampu-skin'`,
    [userId]
  )

  if (!entitlement) {
    throw new APIError(403, 'You must purchase the PAMPU skin first')
  }

  // Update the equipped status in metadata
  await pg.none(
    `update user_entitlements 
     set metadata = $2
     where user_id = $1 and entitlement_id = 'pampu-skin'`,
    [userId, { equipped }]
  )

  return { success: true, equipped }
}
