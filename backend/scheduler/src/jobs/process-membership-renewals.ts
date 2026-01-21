import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTxnInBetQueue, type TxnData } from 'shared/txn/run-txn'
import {
  SUPPORTER_ENTITLEMENT_IDS,
  SUPPORTER_TIERS,
  SupporterTier,
} from 'common/supporter-config'
import { DAY_MS } from 'common/util/time'
import { getPrivateUser, log } from 'shared/utils'
import { MembershipSubscriptionData, Notification } from 'common/notification'
import { nanoid } from 'common/util/random'
import { insertNotificationToSupabase } from 'shared/supabase/notifications'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { createPushNotifications } from 'shared/create-push-notifications'
import { MANIFOLD_AVATAR_URL, MANIFOLD_USER_NAME, MANIFOLD_USER_USERNAME } from 'common/user'

// Map entitlement IDs to their tier info
const ENTITLEMENT_TO_TIER: Record<string, { tier: SupporterTier; price: number; name: string }> = {
  'supporter-basic': { tier: 'basic', price: SUPPORTER_TIERS.basic.price, name: SUPPORTER_TIERS.basic.displayName },
  'supporter-plus': { tier: 'plus', price: SUPPORTER_TIERS.plus.price, name: SUPPORTER_TIERS.plus.displayName },
  'supporter-premium': { tier: 'premium', price: SUPPORTER_TIERS.premium.price, name: SUPPORTER_TIERS.premium.displayName },
}

async function createMembershipNotification(
  userId: string,
  tierName: string,
  amount: number,
  type: 'renewed' | 'cancelled',
  newExpiresTime?: number
) {
  const pg = createSupabaseDirectClient()
  const privateUser = await getPrivateUser(userId)
  if (!privateUser) return

  const { sendToBrowser, sendToMobile } = getNotificationDestinationsForUser(
    privateUser,
    'membership_subscription'
  )

  if (!sendToBrowser && !sendToMobile) return

  const id = nanoid(6)
  const notificationData: MembershipSubscriptionData = {
    tierName,
    amount,
    type,
    newExpiresTime,
  }

  const notification: Notification = {
    id,
    userId,
    reason: 'membership_subscription',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: id,
    sourceType: 'membership_subscription',
    sourceUpdateType: type === 'renewed' ? 'updated' : 'canceled',
    sourceUserName: MANIFOLD_USER_NAME,
    sourceUserUsername: MANIFOLD_USER_USERNAME,
    sourceUserAvatarUrl: MANIFOLD_AVATAR_URL,
    sourceText: amount.toString(),
    sourceSlug: '/shop',
    data: notificationData,
  }

  if (sendToBrowser) {
    await insertNotificationToSupabase(notification, pg)
  }

  if (sendToMobile) {
    const title =
      type === 'renewed'
        ? `${tierName} Membership Renewed`
        : `${tierName} Membership Cancelled`
    const body =
      type === 'renewed'
        ? `Your ${tierName} membership has been auto-renewed for M$${amount}.`
        : `Your ${tierName} membership was cancelled due to insufficient balance.`

    await createPushNotifications([[privateUser, notification, title, body]])
  }
}

export async function processMembershipRenewals() {
  const pg = createSupabaseDirectClient()

  // Find all supporter entitlements that:
  // 1. Have auto_renew = true
  // 2. Have expired (expires_time <= NOW())
  const expiredEntitlements = await pg.manyOrNone<{
    user_id: string
    entitlement_id: string
    expires_time: Date
  }>(
    `SELECT user_id, entitlement_id, expires_time
     FROM user_entitlements
     WHERE entitlement_id = ANY($1)
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
    const tierInfo = ENTITLEMENT_TO_TIER[entitlement_id]

    if (!tierInfo) {
      log(`Unknown entitlement ID: ${entitlement_id} for user ${user_id}`)
      continue
    }

    // Track what happened in the transaction so we can send notifications after
    type NotificationInfo = {
      type: 'renewed' | 'cancelled'
      newExpiresTime?: number
    }
    let notificationToSend: NotificationInfo | null = null

    try {
      const result = await pg.tx(async (tx) => {
        // Get user's current balance
        const user = await tx.oneOrNone<{ balance: number }>(
          `SELECT balance FROM users WHERE id = $1`,
          [user_id]
        )

        if (!user) {
          log(`User ${user_id} not found, skipping renewal`)
          return null
        }

        if (user.balance >= tierInfo.price) {
          // User has enough balance - process renewal
          const txnData: TxnData = {
            category: 'MEMBERSHIP_PAYMENT',
            fromType: 'USER',
            fromId: user_id,
            toType: 'BANK',
            toId: 'BANK',
            amount: tierInfo.price,
            token: 'M$',
            description: `Auto-renewed ${tierInfo.name}`,
            data: { itemId: entitlement_id, isAutoRenewal: true },
          }

          await runTxnInBetQueue(tx, txnData)

          // Extend expiration by 30 days from now
          const newExpiresTime = new Date(Date.now() + 30 * DAY_MS)

          await tx.none(
            `UPDATE user_entitlements
             SET expires_time = $1
             WHERE user_id = $2 AND entitlement_id = $3`,
            [newExpiresTime, user_id, entitlement_id]
          )

          log(`Successfully renewed ${tierInfo.name} for user ${user_id}`)
          renewedCount++

          return {
            type: 'renewed' as const,
            newExpiresTime: newExpiresTime.getTime(),
          }
        } else {
          // Insufficient balance - cancel auto-renewal
          await tx.none(
            `UPDATE user_entitlements
             SET auto_renew = false
             WHERE user_id = $1 AND entitlement_id = $2`,
            [user_id, entitlement_id]
          )

          log(`Cancelled ${tierInfo.name} auto-renewal for user ${user_id} (insufficient balance: ${user.balance} < ${tierInfo.price})`)
          failedCount++

          return { type: 'cancelled' as const }
        }
      })

      notificationToSend = result

      // Send notification AFTER transaction commits successfully
      if (notificationToSend) {
        try {
          await createMembershipNotification(
            user_id,
            tierInfo.name,
            tierInfo.price,
            notificationToSend.type,
            notificationToSend.newExpiresTime
          )
        } catch (notifError) {
          // Log but don't fail the renewal if notification fails
          log(`Failed to send ${notificationToSend.type} notification for user ${user_id}: ${notifError}`)
        }
      }
    } catch (error) {
      log(`Error processing renewal for user ${user_id}: ${error}`)
      failedCount++
    }
  }

  log(`Membership renewals complete: ${renewedCount} renewed, ${failedCount} cancelled/failed`)
}
