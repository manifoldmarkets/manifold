import { SUPPORTER_TIERS } from 'common/supporter-config'
import { DAY_MS } from 'common/util/time'
import {
  createSupabaseDirectClient,
  SupabaseTransaction,
} from './supabase/init'
import { broadcastUserUpdates, UserUpdate } from './supabase/users'
import { runTxnOutsideBetQueue } from './txn/run-txn'
import { getPrivateUser, log } from 'shared/utils'
import { MembershipSubscriptionData, Notification } from 'common/notification'
import { nanoid } from 'common/util/random'
import { insertNotificationToSupabase } from 'shared/supabase/notifications'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { createPushNotifications } from 'shared/create-push-notifications'
import {
  MANIFOLD_AVATAR_URL,
  MANIFOLD_USER_NAME,
  MANIFOLD_USER_USERNAME,
} from 'common/user'

export type MembershipRenewal = {
  userId: string
  tierName: string
  amount: number
  type: 'renewed' | 'cancelled'
  newExpiresTime?: number
  balanceUpdates: UserUpdate[]
}

// The scan and grant restoration both own a retried SERIALIZABLE transaction.
// Re-check the live row at the transition instant before charging it.
export async function renewDueMembership(
  tx: SupabaseTransaction,
  userId: string,
  entitlementId: string,
  now: number
): Promise<MembershipRenewal | null> {
  const tier = Object.values(SUPPORTER_TIERS).find(
    (t) => t.id === entitlementId
  )
  if (!tier) throw new Error(`Unknown supporter entitlement ${entitlementId}`)
  const due = await tx.oneOrNone<{ balance: number }>(
    `select u.balance from user_entitlements e join users u on u.id = e.user_id
     where e.user_id = $1 and e.entitlement_id = $2
       and e.metadata->>'membershipGrantId' is null and e.auto_renew
       and e.expires_time <= $3 for update of e`,
    [userId, entitlementId, new Date(now)]
  )
  if (!due) return null
  if (!Number.isFinite(due.balance))
    throw new Error(`Invalid balance for ${userId}`)
  const balanceUpdates: UserUpdate[] = []
  const result = {
    userId,
    tierName: tier.displayName,
    amount: tier.price,
    balanceUpdates,
  }
  if (due.balance < tier.price) {
    await tx.none(
      'update user_entitlements set auto_renew = false where user_id = $1 and entitlement_id = $2',
      [userId, entitlementId]
    )
    return { ...result, type: 'cancelled' }
  }

  await runTxnOutsideBetQueue(
    tx,
    {
      category: 'MEMBERSHIP_PAYMENT',
      fromType: 'USER',
      fromId: userId,
      toType: 'BANK',
      toId: 'BANK',
      amount: tier.price,
      token: 'M$',
      description: `Auto-renewed ${tier.displayName}`,
      data: { itemId: entitlementId, isAutoRenewal: true },
    },
    false,
    (updates) => balanceUpdates.push(...updates)
  )
  const newExpiresTime = now + 30 * DAY_MS
  await tx.none(
    'update user_entitlements set expires_time = $3 where user_id = $1 and entitlement_id = $2',
    [userId, entitlementId, new Date(newExpiresTime)]
  )
  return { ...result, type: 'renewed', newExpiresTime }
}

export async function publishMembershipRenewal(renewal: MembershipRenewal) {
  if (renewal.balanceUpdates.length)
    broadcastUserUpdates(renewal.balanceUpdates)
  try {
    await createMembershipNotification(renewal)
  } catch (error) {
    log(
      `Failed to send ${renewal.type} notification for user ${renewal.userId}: ${error}`
    )
  }
}

async function createMembershipNotification({
  userId,
  tierName,
  amount,
  type,
  newExpiresTime,
}: MembershipRenewal) {
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
