import { SUPPORTER_ENTITLEMENT_IDS } from 'common/supporter-config'
import { betsQueue } from 'shared/helpers/fn-queue'
import {
  publishMembershipRenewal,
  renewDueMembership,
} from 'shared/membership-renewal'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { log } from 'shared/utils'

export async function processMembershipRenewals() {
  const pg = createSupabaseDirectClient()

  // Find all supporter entitlements that:
  // 1. Have auto_renew = true
  // 2. Have expired (expires_time <= NOW())
  const expiredEntitlements = await pg.manyOrNone<{
    user_id: string
    entitlement_id: string
  }>(
    `SELECT user_id, entitlement_id
     FROM user_entitlements
     WHERE entitlement_id = ANY($1)
     AND metadata->>'membershipGrantId' IS NULL
     AND auto_renew = true
     AND expires_time IS NOT NULL
     AND expires_time <= NOW()`,
    [[...SUPPORTER_ENTITLEMENT_IDS]]
  )

  log(`Found ${expiredEntitlements.length} memberships to attempt renewal`)

  let renewedCount = 0
  let failedCount = 0

  // Process each entitlement individually (don't fail batch on one error)
  for (const entitlement of expiredEntitlements) {
    const { user_id, entitlement_id } = entitlement
    try {
      const result = await betsQueue.enqueueFn(
        () =>
          runTransactionWithRetries((tx) =>
            renewDueMembership(tx, user_id, entitlement_id, Date.now())
          ),
        [user_id]
      )
      if (!result) {
        log(
          `${entitlement_id} for user ${user_id} no longer due, skipping renewal`
        )
        continue
      }
      log(`Membership ${result.type} for user ${user_id} (${result.tierName})`)
      if (result.type === 'renewed') renewedCount++
      else failedCount++
      await publishMembershipRenewal(result)
    } catch (error) {
      log(`Error processing renewal for user ${user_id}: ${error}`)
      failedCount++
    }
  }

  log(
    `Membership renewals complete: ${renewedCount} renewed, ${failedCount} cancelled/failed`
  )
}
