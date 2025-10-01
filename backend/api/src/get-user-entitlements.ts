import { APIError, APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getUserEntitlements: APIHandler<'get-user-entitlements'> = async (
  { userId },
  auth
) => {
  const targetId = userId ?? auth?.uid
  if (!targetId) throw new APIError(400, 'userId is required')
  const pg = createSupabaseDirectClient()
  const rows = await pg.manyOrNone(
    `select entitlement_id, granted_time, expires_time, metadata
       from user_entitlements
      where user_id = $1
        and (expires_time is null or expires_time > now())`,
    [targetId]
  )
  return {
    entitlements: rows.map((r: any) => ({
      entitlementId: String(r.entitlement_id),
      grantedTime: String(r.granted_time),
      expiresTime: (r.expires_time as string) ?? null,
      metadata: (r.metadata as Record<string, any>) ?? undefined,
    })),
  }
}
