import type { SupabaseTransaction } from './init'

import { SUPPORTER_ENTITLEMENT_IDS } from 'common/supporter-config'
import { convertEntitlement, UserEntitlement } from 'common/shop/types'

type EntitlementReader = Pick<SupabaseTransaction, 'manyOrNone'>

const activeSupporterAccessAt = (time: 'now()' | '$3::timestamptz') =>
  `enabled = true
  and (expires_time is null or expires_time > ${time}
       or (auto_renew and expires_time > ${time} - interval '25 hours'))`

export const activeSupporterAccessSql = activeSupporterAccessAt('now()')

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
  pg: EntitlementReader,
  userId: string,
  now?: number
): Promise<UserEntitlement[]> {
  const time = now === undefined ? 'now()' : '$3::timestamptz'
  const rows = await pg.manyOrNone<{
    user_id: string
    entitlement_id: string
    granted_time: string
    expires_time: string | null
    enabled: boolean
    auto_renew: boolean
    metadata: Record<string, unknown> | null
  }>(
    `SELECT user_id, entitlement_id, granted_time, expires_time, enabled, auto_renew, metadata
     FROM user_entitlements
     WHERE user_id = $1
       AND entitlement_id = ANY($2)
       AND ${activeSupporterAccessAt(time)}`,
    [
      userId,
      SUPPORTER_ENTITLEMENT_IDS,
      ...(now === undefined ? [] : [new Date(now)]),
    ]
  )
  return rows.map(convertEntitlement)
}

// Grant transitions also replace expired rows. Lock the full set before changing its key.
export async function getSupporterRow(
  pg: EntitlementReader,
  userId: string,
  lock = false
) {
  const rows = await pg.manyOrNone<Parameters<typeof convertEntitlement>[0]>(
    `select * from user_entitlements where user_id = $1 and entitlement_id = any($2) ${
      lock ? 'for update' : ''
    }`,
    [userId, SUPPORTER_ENTITLEMENT_IDS]
  )
  if (rows.length > 1)
    throw new Error('Multiple supporter rows for user ' + userId)
  const row = rows[0]
  return row
    ? {
        ...convertEntitlement(row),
        expiresTimeText: row.expires_time ?? undefined,
      }
    : null
}

export async function getUserEntitlements(
  pg: EntitlementReader,
  userId: string
) {
  const rows = await pg.manyOrNone<Parameters<typeof convertEntitlement>[0]>(
    `select * from user_entitlements where user_id = $1`,
    [userId]
  )
  return rows.map(convertEntitlement)
}
