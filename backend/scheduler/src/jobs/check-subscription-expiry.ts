import { createSupabaseDirectClient } from 'shared/supabase/init'
import { SUPPORTER_ENTITLEMENT_IDS } from 'common/supporter-config'
import {
  ExpiringEntitlement,
  writeExpiryNotice,
  publishExpiryNotice,
} from 'shared/membership-expiry-notice'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { DAY_MS } from 'common/util/time'
import { log } from 'shared/utils'

export { daysUntilExpiry } from 'shared/membership-expiry-notice'

export async function checkSubscriptionExpiry() {
  const pg = createSupabaseDirectClient()

  const now = Date.now()
  const minPaidExpiry = new Date(now + 2 * DAY_MS)
  const maxExpiry = new Date(now + 3 * DAY_MS)

  const expiringEntitlements = await pg.manyOrNone<ExpiringEntitlement>(
    `SELECT e.user_id, entitlement_id, expires_time, auto_renew, e.metadata->>'membershipGrantId' as grant_id
     FROM user_entitlements e
     WHERE entitlement_id = ANY($1)
     AND expires_time > $2
     AND expires_time <= $3
     AND (e.metadata->>'membershipGrantId' is not null or expires_time > $4)`,
    [[...SUPPORTER_ENTITLEMENT_IDS], new Date(now), maxExpiry, minPaidExpiry]
  )

  log(
    `Found ${expiringEntitlements.length} memberships in their expiry notice window`
  )

  let notifiedCount = 0

  for (const entitlement of expiringEntitlements) {
    try {
      const delivery = await runTransactionWithRetries((tx) =>
        writeExpiryNotice(tx, entitlement)
      )
      if (await publishExpiryNotice(delivery)) notifiedCount++
    } catch (error) {
      log(`Failed to notify user ${entitlement.user_id}: ${error}`)
    }
  }

  log(`Subscription expiry check complete: ${notifiedCount} users notified`)
}
