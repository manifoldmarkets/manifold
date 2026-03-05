import { createSupabaseDirectClient } from 'shared/supabase/init'
import {
  SUPPORTER_ENTITLEMENT_IDS,
  SUPPORTER_TIERS,
  SupporterTier,
} from 'common/supporter-config'
import { DAY_MS } from 'common/util/time'
import { getPrivateUser, log } from 'shared/utils'
import { MembershipSubscriptionData, Notification } from 'common/notification'
import { insertNotificationToSupabase } from 'shared/supabase/notifications'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { createPushNotifications } from 'shared/create-push-notifications'
import {
  MANIFOLD_AVATAR_URL,
  MANIFOLD_USER_NAME,
  MANIFOLD_USER_USERNAME,
} from 'common/user'

// Map entitlement IDs to their tier info
const ENTITLEMENT_TO_TIER: Record<
  string,
  { tier: SupporterTier; price: number; name: string }
> = {
  'supporter-basic': {
    tier: 'basic',
    price: SUPPORTER_TIERS.basic.price,
    name: SUPPORTER_TIERS.basic.displayName,
  },
  'supporter-plus': {
    tier: 'plus',
    price: SUPPORTER_TIERS.plus.price,
    name: SUPPORTER_TIERS.plus.displayName,
  },
  'supporter-premium': {
    tier: 'premium',
    price: SUPPORTER_TIERS.premium.price,
    name: SUPPORTER_TIERS.premium.displayName,
  },
}

async function createSubscriptionExpiringNotification(
  userId: string,
  tierName: string,
  amount: number,
  daysUntilExpiry: number,
  reason: 'cancelled' | 'insufficient_balance'
) {
  const pg = createSupabaseDirectClient()
  const privateUser = await getPrivateUser(userId)
  if (!privateUser) return

  const { sendToBrowser, sendToMobile } = getNotificationDestinationsForUser(
    privateUser,
    'membership_subscription'
  )

  if (!sendToBrowser && !sendToMobile) return

  // Deterministic ID prevents duplicate notifications if the job reruns on the same day
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const id = `sub-expiry-${userId}-${tierName.toLowerCase().replace(/\s+/g, '-')}-${today}-${reason}`
  const notificationData: MembershipSubscriptionData = {
    tierName,
    amount,
    type: 'expiring_soon',
    daysUntilExpiry,
  }

  const notification: Notification = {
    id,
    userId,
    reason: 'membership_subscription',
    createdTime: Date.now(),
    isSeen: false,
    sourceId: id,
    sourceType: 'membership_subscription',
    sourceUpdateType: 'expired',
    sourceUserName: MANIFOLD_USER_NAME,
    sourceUserUsername: MANIFOLD_USER_USERNAME,
    sourceUserAvatarUrl: MANIFOLD_AVATAR_URL,
    sourceText: daysUntilExpiry.toString(),
    sourceSlug: '/shop',
    data: notificationData,
  }

  if (sendToBrowser) {
    await insertNotificationToSupabase(notification, pg)
  }

  if (sendToMobile) {
    const title = `${tierName} Membership Expiring Soon`
    const body =
      reason === 'cancelled'
        ? `Your ${tierName} membership expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'}. Re-subscribe to keep your benefits!`
        : `Your ${tierName} membership expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'} and you don't have enough mana to renew (need M$${amount}).`

    await createPushNotifications([[privateUser, notification, title, body]])
  }
}

export async function checkSubscriptionExpiry() {
  const pg = createSupabaseDirectClient()

  // Find all supporter entitlements expiring in 2-3 days
  const expiringInDaysMin = 2
  const expiringInDaysMax = 3
  const minExpiry = new Date(Date.now() + expiringInDaysMin * DAY_MS)
  const maxExpiry = new Date(Date.now() + expiringInDaysMax * DAY_MS)

  const expiringEntitlements = await pg.manyOrNone<{
    user_id: string
    entitlement_id: string
    expires_time: Date
    auto_renew: boolean
  }>(
    `SELECT user_id, entitlement_id, expires_time, auto_renew
     FROM user_entitlements
     WHERE entitlement_id = ANY($1)
     AND expires_time IS NOT NULL
     AND expires_time > $2
     AND expires_time <= $3`,
    [[...SUPPORTER_ENTITLEMENT_IDS], minExpiry, maxExpiry]
  )

  log(`Found ${expiringEntitlements.length} memberships expiring in ${expiringInDaysMin}-${expiringInDaysMax} days`)

  let notifiedCount = 0

  for (const entitlement of expiringEntitlements) {
    const { user_id, entitlement_id, expires_time, auto_renew } = entitlement
    const tierInfo = ENTITLEMENT_TO_TIER[entitlement_id]

    if (!tierInfo) {
      log(`Unknown entitlement ID: ${entitlement_id} for user ${user_id}`)
      continue
    }

    const daysUntilExpiry = Math.ceil(
      (expires_time.getTime() - Date.now()) / DAY_MS
    )

    // Case 1: Auto-renew is off - user has cancelled
    if (!auto_renew) {
      try {
        await createSubscriptionExpiringNotification(
          user_id,
          tierInfo.name,
          tierInfo.price,
          daysUntilExpiry,
          'cancelled'
        )
        notifiedCount++
        log(`Notified user ${user_id} about ${tierInfo.name} expiring (cancelled)`)
      } catch (error) {
        log(`Failed to notify user ${user_id}: ${error}`)
      }
      continue
    }

    // Case 2: Auto-renew is on but user doesn't have enough balance
    const user = await pg.oneOrNone<{ balance: number }>(
      `SELECT balance FROM users WHERE id = $1`,
      [user_id]
    )

    if (!user) {
      log(`User ${user_id} not found, skipping`)
      continue
    }

    if (user.balance < tierInfo.price) {
      try {
        await createSubscriptionExpiringNotification(
          user_id,
          tierInfo.name,
          tierInfo.price,
          daysUntilExpiry,
          'insufficient_balance'
        )
        notifiedCount++
        log(
          `Notified user ${user_id} about ${tierInfo.name} expiring (insufficient balance: ${user.balance} < ${tierInfo.price})`
        )
      } catch (error) {
        log(`Failed to notify user ${user_id}: ${error}`)
      }
    }
    // If auto_renew is on AND user has enough balance, don't notify (renewal will succeed)
  }

  log(`Subscription expiry check complete: ${notifiedCount} users notified`)
}
