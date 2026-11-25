import { APIError, type APIHandler } from './helpers/endpoint'
import { getActiveMembershipGrant } from 'shared/membership-grants'
import { SUPPORTER_ENTITLEMENT_IDS } from 'common/supporter-config'
import {
  getActiveSupporterEntitlements,
  getUserEntitlements,
} from 'shared/supabase/entitlements'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { broadcastUpdatedUser } from 'shared/websockets/helpers'

export const shopCancelSubscription: APIHandler<
  'shop-cancel-subscription'
> = async (_, auth) => {
  const userId = auth.uid
  const entitlements = await runTransactionWithRetries(async (tx) => {
    const active = await getActiveMembershipGrant(tx, userId)
    if (active) {
      if (!active.pausedPaid)
        throw new APIError(
          404,
          'You have free days and no paid membership to cancel.'
        )
      if (active.pausedPaid.autoRenew)
        await tx.one(
          `update membership_grants set paused_paid = jsonb_set(paused_paid, '{autoRenew}', 'false')
         where id = $1 and status = 'active' returning id`,
          [active.id]
        )
    } else {
      const cancelled = await tx.manyOrNone(
        `update user_entitlements set auto_renew = false
         where user_id = $1 and entitlement_id = any($2)
           and metadata->>'membershipGrantId' is null and auto_renew
         returning entitlement_id`,
        [userId, SUPPORTER_ENTITLEMENT_IDS]
      )
      // A repeat cancellation of a still-active paid subscription also succeeds.
      if (!cancelled.length) {
        const activePaid = await getActiveSupporterEntitlements(tx, userId)
        if (!activePaid.some((row) => row.metadata?.membershipGrantId == null))
          throw new APIError(404, 'No active membership subscription found')
      }
    }
    return getUserEntitlements(tx, userId)
  })
  broadcastUpdatedUser({ id: userId, entitlements })
  return { success: true, entitlements }
}
