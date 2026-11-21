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
    `SELECT user_id, entitlement_id, granted_time, expires_time, enabled, auto_renew
     FROM user_entitlements
     WHERE user_id = $1
       AND entitlement_id = ANY($2)
       AND enabled = true
       AND (expires_time IS NULL
            OR expires_time > NOW()
            OR (auto_renew = true AND expires_time > NOW() - interval '25 hours'))`,
    [userId, [...SUPPORTER_ENTITLEMENT_IDS]]
  )
  return rows.map(convertEntitlement)
}
