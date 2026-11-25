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
import { insertNotificationToSupabase } from 'shared/supabase/notifications'
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

async function claimExpiryNotice(
  tx: SupabaseTransaction,
  entitlement: ExpiringEntitlement,
  price: number
) {
  const { user_id, entitlement_id, expires_time, auto_renew, grant_id } =
    entitlement
  const current = await tx.oneOrNone<{ balance: number; expiry_key: string }>(
    `select u.balance, extract(epoch from e.expires_time)::text as expiry_key
     from user_entitlements e join users u on u.id = e.user_id
     where e.user_id = $1 and e.entitlement_id = $2 and e.expires_time = $3
       and e.auto_renew = $4 and (e.metadata->>'membershipGrantId') is not distinct from $5
     for share of e`,
    [user_id, entitlement_id, expires_time, auto_renew, grant_id]
  )
  if (!current || (!grant_id && auto_renew && current.balance >= price))
    return null

  const view = grant_id
    ? await readMembershipGrantView(tx, user_id, Date.now())
    : null
  if (grant_id && view?.active?.id !== grant_id) return null
  const reason = grant_id
    ? 'free_days'
    : auto_renew
    ? 'insufficient_balance'
    : 'cancelled'
  const id = grant_id
    ? `sub-expiry-grant-${grant_id}-${reason}`
    : `sub-expiry-paid-${user_id}-${entitlement_id}-${current.expiry_key}-${reason}`
  const privateUser = await getPrivateUser(user_id, tx)
  if (!privateUser) return null
  const { sendToBrowser, sendToMobile } = getNotificationDestinationsForUser(
    privateUser,
    'membership_subscription'
  )
  if (!sendToBrowser && !sendToMobile) return null
  const receipt = await tx.oneOrNone(
    `insert into membership_notice_deliveries (notice_key, user_id) values ($1, $2)
     on conflict do nothing returning notice_key`,
    [id, user_id]
  )
  if (!receipt) return null
  return { id, reason, view, privateUser, sendToBrowser, sendToMobile } as const
}

async function createSubscriptionExpiringNotification(
  entitlement: ExpiringEntitlement
) {
  const { user_id: userId, entitlement_id, expires_time } = entitlement
  const tier = Object.values(SUPPORTER_TIERS).find(
    (t) => t.id === entitlement_id
  )
  if (!tier) throw new Error(`Unknown entitlement ID: ${entitlement_id}`)
  const amount = tier.price
  const claimed = await runTransactionWithRetries((tx) =>
    claimExpiryNotice(tx, entitlement, amount)
  )
  if (!claimed) return false
  const { id, reason, view, privateUser, sendToBrowser, sendToMobile } = claimed
  const tierName = view?.active
    ? SUPPORTER_TIERS[view.active.tier].name
    : tier.displayName
  const days = daysUntilExpiry(expires_time)
  const notificationData: MembershipSubscriptionData = {
    tierName,
    amount,
    type: 'expiring_soon',
    expiryReason: reason,
    grantEndsTime: view?.active?.endsTime,
    nextMembership: view?.next,
    daysUntilExpiry: days,
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
    sourceText: days.toString(),
    sourceSlug: view?.active ? '/membership' : '/shop',
    data: notificationData,
  }

  if (sendToBrowser)
    await insertNotificationToSupabase(
      notification,
      createSupabaseDirectClient()
    )

  if (sendToMobile) {
    const title = `${tierName} Membership Expiring Soon`
    const body = view?.active
      ? freeDaysExpiryMessage(tierName, view.active.endsTime, amount, view.next)
      : reason === 'cancelled'
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

  // Find all supporter entitlements expiring in 2-3 days
  const expiringInDaysMin = 2
  const expiringInDaysMax = 3
  const minExpiry = new Date(Date.now() + expiringInDaysMin * DAY_MS)
  const maxExpiry = new Date(Date.now() + expiringInDaysMax * DAY_MS)

  const expiringEntitlements = await pg.manyOrNone<ExpiringEntitlement>(
    `SELECT e.user_id, entitlement_id, expires_time, auto_renew, e.metadata->>'membershipGrantId' as grant_id
     FROM user_entitlements e
     WHERE entitlement_id = ANY($1)
     AND expires_time IS NOT NULL
     AND expires_time > $2
     AND expires_time <= $3`,
    [[...SUPPORTER_ENTITLEMENT_IDS], minExpiry, maxExpiry]
  )

  log(
    `Found ${expiringEntitlements.length} memberships expiring in ${expiringInDaysMin}-${expiringInDaysMax} days`
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
