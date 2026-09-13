import { ITask } from 'pg-promise'
import { SUPPORTER_ENTITLEMENT_IDS } from 'common/supporter-config'
import { convertEntitlement, UserEntitlement } from 'common/shop/types'

/**
 * Fetch active supporter entitlements for a user.
 *
 * Includes a 25-hour grace period for auto-renewing memberships so that
 * entitlements don't briefly lapse between expiration and the next renewal
 * scheduler run.  This must be the single source of truth for "is this
 * supporter entitlement active?" on the backend – do NOT inline the query
 * elsewhere.
 *
 * Note: getUserSupporterTier in common/src/supporter-config.ts has a
 * parallel grace period check in TypeScript for frontend use. Keep them
 * in sync if the grace window changes.
 */
export async function getActiveSupporterEntitlements(
  pg: ITask<any> | { manyOrNone: ITask<any>['manyOrNone'] },
  userId: string
): Promise<UserEntitlement[]> {
  const rows = await pg.manyOrNone<{
    user_id: string
    entitlement_id: string
    granted_time: string
    expires_time: string | null
    enabled: boolean
    auto_renew: boolean
  }>(
    `select user_id, entitlement_id, granted_time, expires_time, enabled, auto_renew
     from user_entitlements
     where user_id = $1
       and entitlement_id = any($2)
       and enabled = true
       and (expires_time is null
            or expires_time > now()
            or (auto_renew = true and expires_time > now() - interval '25 hours'))
     order by expires_time desc nulls first`,
    [userId, [...SUPPORTER_ENTITLEMENT_IDS]]
  )
  return rows.map(convertEntitlement)
}
