import {
  createSupabaseDirectClient,
  SupabaseTransaction,
} from 'shared/supabase/init'
import {
  SUPPORTER_ENTITLEMENT_IDS,
  SUPPORTER_TIERS,
} from 'common/supporter-config'
import { readMembershipGrantView } from 'shared/membership-grants'
import { runTransactionWithRetries } from 'shared/transact-with-retries'
import { DAY_MS } from 'common/util/time'
import { getPrivateUser, log } from 'shared/utils'
import {
  freeDaysExpiryMessage,
  MembershipSubscriptionData,
  Notification,
} from 'common/notification'
import {
  broadcastNotification,
  insertNotificationRow,
} from 'shared/supabase/notifications'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { createPushNotifications } from 'shared/create-push-notifications'
import {
  MANIFOLD_AVATAR_URL,
  MANIFOLD_USER_NAME,
  MANIFOLD_USER_USERNAME,
} from 'common/user'

type ExpiringEntitlement = {
  user_id: string
  entitlement_id: string
  expires_time: string
  auto_renew: boolean
  grant_id: string | null
}

async function writeExpiryNotice(
  tx: SupabaseTransaction,
  entitlement: ExpiringEntitlement
) {
  const {
    user_id: userId,
    entitlement_id,
    expires_time,
    auto_renew,
    grant_id,
  } = entitlement
  const tier = Object.values(SUPPORTER_TIERS).find(
    (t) => t.id === entitlement_id
  )
  if (!tier) throw new Error(`Unknown entitlement ID: ${entitlement_id}`)
  const amount = tier.price
  const now = Date.now()
  const current = await tx.oneOrNone<{ balance: number; expiry_key: string }>(
    `select u.balance, extract(epoch from e.expires_time)::text as expiry_key
     from user_entitlements e join users u on u.id = e.user_id
     where e.user_id = $1 and e.entitlement_id = $2 and e.expires_time = $3
       and e.auto_renew = $4 and (e.metadata->>'membershipGrantId') is not distinct from $5
       and ($5::text is null or exists (
         select 1 from membership_grants g where g.user_id = e.user_id and g.status = 'active'
           and g.id::text = $5 and g.ends_time = e.expires_time and g.ends_time > $6
       ))
     for share of e`,
    [userId, entitlement_id, expires_time, auto_renew, grant_id, new Date(now)]
  )
  if (!current || (!grant_id && auto_renew && current.balance >= amount))
    return null

  const view = grant_id ? await readMembershipGrantView(tx, userId, now) : null
  if (grant_id && view?.active?.id !== grant_id) return null
  const reason = grant_id
    ? 'free_days'
    : auto_renew
    ? 'insufficient_balance'
    : 'cancelled'
  const id = grant_id
    ? `sub-expiry-grant-${grant_id}-${current.expiry_key}-${reason}`
    : `sub-expiry-paid-${userId}-${entitlement_id}-${current.expiry_key}-${reason}`
  const privateUser = await getPrivateUser(userId, tx)
  if (!privateUser) return null
  const { sendToBrowser, sendToMobile } = getNotificationDestinationsForUser(
    privateUser,
    'membership_subscription'
  )
  if (!sendToBrowser && !sendToMobile) return null
  const receipt = await tx.oneOrNone(
    `insert into membership_notice_deliveries (notice_key, user_id) values ($1, $2)
     on conflict do nothing returning notice_key`,
    [id, userId]
  )
  if (!receipt) return null
  const tierName = view?.active
    ? SUPPORTER_TIERS[view.active.tier].name
    : tier.displayName
  const days = daysUntilExpiry(expires_time, now)
  const notificationData = {
    tierName,
    amount,
    type: 'expiring_soon',
    expiryReason: reason,
    grantEndsTime: view?.active?.endsTime,
    nextMembership: view?.next,
    daysUntilExpiry: days,
  } satisfies MembershipSubscriptionData

  const notification = {
    id,
    userId,
    reason: 'membership_subscription',
    createdTime: now,
    isSeen: false,
    sourceId: id,
    sourceType: 'membership_subscription',
    sourceUpdateType: 'expired',
    sourceUserName: MANIFOLD_USER_NAME,
    sourceUserUsername: MANIFOLD_USER_USERNAME,
    sourceUserAvatarUrl: MANIFOLD_AVATAR_URL,
    sourceText: days.toString(),
    sourceSlug: view?.active ? '/membership' : '/shop',
    data: notificationData,
  } satisfies Notification

  const inserted =
    sendToBrowser && (await insertNotificationRow(notification, tx))
  return { notification, inserted, privateUser, sendToMobile }
}

async function createSubscriptionExpiringNotification(
  entitlement: ExpiringEntitlement
) {
  const delivery = await runTransactionWithRetries((tx) =>
    writeExpiryNotice(tx, entitlement)
  )
  if (!delivery) return false
  const { notification, inserted, privateUser, sendToMobile } = delivery
  if (inserted) broadcastNotification(notification)
  if (sendToMobile) {
    const {
      tierName,
      amount,
      daysUntilExpiry: days,
      expiryReason,
      grantEndsTime,
      nextMembership,
    } = notification.data
    const title = `${tierName} Membership Expiring Soon`
    const body =
      grantEndsTime !== undefined
        ? freeDaysExpiryMessage(tierName, grantEndsTime, amount, nextMembership)
        : expiryReason === 'cancelled'
        ? `Your ${tierName} membership expires in ${days} day${
            days === 1 ? '' : 's'
          }. Re-subscribe to keep your benefits!`
        : `Your ${tierName} membership expires in ${days} day${
            days === 1 ? '' : 's'
          } and you don't have enough mana to renew (need M$${amount}).`

    await createPushNotifications([[privateUser, notification, title, body]])
  }
  return true
}

// Whole days until an entitlement expires, rounded up.
//
// `expires_time` is a timestamptz and arrives as an ISO string, not a Date:
// shared/supabase/init.ts registers identity type parsers for timestamp and
// timestamptz (#3803). Calling .getTime() on it threw
// "expires_time.getTime is not a function" on every run from 2026-10-04,
// the first day a supporter membership fell inside the 2-3 day window since
// that change, so no expiry warning was ever sent.
export const daysUntilExpiry = (
  expiresTime: string | Date,
  nowMs = Date.now()
) => Math.ceil((new Date(expiresTime).getTime() - nowMs) / DAY_MS)

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
      if (await createSubscriptionExpiringNotification(entitlement))
        notifiedCount++
    } catch (error) {
      log(`Failed to notify user ${entitlement.user_id}: ${error}`)
    }
  }

  log(`Subscription expiry check complete: ${notifiedCount} users notified`)
}
