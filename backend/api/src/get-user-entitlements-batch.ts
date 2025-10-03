import { APIError, APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getUserEntitlementsBatch: APIHandler<
  'get-user-entitlements-batch'
> = async ({ userIds }) => {
  if (!userIds || userIds.length === 0)
    throw new APIError(400, 'userIds is required')

  const pg = createSupabaseDirectClient()
  const rows = await pg.manyOrNone(
    `select user_id, entitlement_id, granted_time, expires_time, metadata
       from user_entitlements
      where user_id in ($1:list)
        and (expires_time is null or expires_time > now())`,
    [userIds]
  )

  const byUser: Record<string, any[]> = {}
  for (const r of rows) {
    const u = String(r.user_id)
    ;(byUser[u] ||= []).push({
      entitlementId: String(r.entitlement_id),
      grantedTime: String(r.granted_time),
      expiresTime: (r.expires_time as string) ?? null,
      metadata: (r.metadata as Record<string, any>) ?? undefined,
    })
  }

  const items = userIds.map((uid) => ({
    userId: uid,
    entitlements: byUser[uid] ?? [],
  }))
  return { items }
}
