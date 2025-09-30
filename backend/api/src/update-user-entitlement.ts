import { APIError, APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const updateUserEntitlement: APIHandler<
  'update-user-entitlement'
> = async ({ userId, entitlementId, grant, expiresTime, metadata }, auth) => {
  const callerId = auth.uid
  if (!callerId) throw new APIError(401, 'You must be signed in')
  const targetId = userId ?? callerId
  const pg = createSupabaseDirectClient()

  if (grant === false) {
    await pg.none(
      `delete from user_entitlements where user_id = $1 and entitlement_id = $2`,
      [targetId, entitlementId]
    )
    return { success: true }
  }

  await pg.none(
    `insert into user_entitlements (user_id, entitlement_id, expires_time, metadata)
     values ($1, $2, $3, $4)
     on conflict (user_id, entitlement_id) do update
       set expires_time = excluded.expires_time,
           metadata = excluded.metadata`,
    [targetId, entitlementId, expiresTime ?? null, metadata ?? null]
  )
  return { success: true }
}
