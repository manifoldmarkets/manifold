import { PUSH_NOTIFICATION_BONUS } from 'common/economy'
import { PushNotificationBonusTxn } from 'common/txn'
import { createPushNotificationBonusNotification } from 'shared/create-notification'
import {
  createSupabaseDirectClient,
  SERIAL_MODE,
  SupabaseTransaction,
} from 'shared/supabase/init'
import { runTxnFromBank } from 'shared/txn/run-txn'
import { broadcastUpdatedPrivateUser } from 'shared/websockets/helpers'
import { APIError, APIHandler } from './helpers/endpoint'
import { convertPrivateUser } from 'common/supabase/users'
import { getPrivateUser, getUser, log } from 'shared/utils'
import { hasFullBonusAccess } from 'common/user'

// for mobile or something?
export const setPushToken: APIHandler<'set-push-token'> = async (
  props,
  auth
) => {
  const { pushToken } = props
  const db = createSupabaseDirectClient()

  const user = await getUser(auth.uid)
  if (!user) {
    throw new APIError(404, 'Account not found')
  }
  const result = await db.tx({ mode: SERIAL_MODE }, async (tx) => {
    const oldPrivateUser = await getPrivateUser(auth.uid, tx)
    if (!oldPrivateUser) {
      throw new APIError(404, 'Account not found')
    }
    // A device's push token must belong to at most one account. If this token
    // is currently registered to other accounts (e.g. the user previously
    // logged into multiple accounts on the same device and logged back out),
    // clear it from them. Otherwise notifications for those logged-out accounts
    // keep getting delivered to this physical device.
    await tx.none(
      `update private_users
       set data = data - 'pushToken'
       where id <> $1
         and data->>'pushToken' = $2`,
      [auth.uid, pushToken]
    )
    const updatedRow = await tx.one(
      `update private_users set data =
      jsonb_set(
        data,
        '{notificationPreferences,opt_out_all}',
        coalesce(data->'notificationPreferences'->'opt_out_all', '[]'::jsonb) - 'mobile'
      )
      - 'rejectedPushNotificationsOn'
      - 'interestedInPushNotifications'
      || jsonb_build_object('pushToken', $1)
    where id = $2
    returning *`,
      [pushToken, auth.uid]
    )
    const newPrivateUser = convertPrivateUser(updatedRow)
    if (oldPrivateUser.pushToken != newPrivateUser.pushToken) {
      // Only pay push notification bonus to users with full bonus access
      // (identity-verified, grandfathered, or purchase/admin-'eligible')
      if (hasFullBonusAccess(user)) {
        const txn = await payUserPushNotificationsBonus(
          auth.uid,
          PUSH_NOTIFICATION_BONUS,
          tx
        )
        return { newPrivateUser, txn }
      } else {
        log(
          `Skipped push notification bonus for user ${auth.uid} - not eligible for bonuses`
        )
        return { newPrivateUser, txn: null }
      }
    }
    return { newPrivateUser: null, txn: null }
  })
  broadcastUpdatedPrivateUser(auth.uid)
  if (result.newPrivateUser && result.txn) {
    await createPushNotificationBonusNotification(
      result.newPrivateUser,
      result.txn.id,
      PUSH_NOTIFICATION_BONUS,
      'push_notification_bonus_' +
        new Date().toLocaleDateString('en-US', {
          year: '2-digit',
          month: '2-digit',
          day: '2-digit',
        })
    )
  }
}

const payUserPushNotificationsBonus = async (
  userId: string,
  payout: number,
  tx: SupabaseTransaction
) => {
  // make sure we don't already have a txn for this user/questType
  const previousTxn = await tx.oneOrNone(
    `select * from txns where to_id = $1 and category = 'PUSH_NOTIFICATION_BONUS' limit 1`,
    [userId]
  )
  if (previousTxn) return null

  const bonusTxn: Omit<
    PushNotificationBonusTxn,
    'fromId' | 'id' | 'createdTime'
  > = {
    fromType: 'BANK',
    toId: userId,
    toType: 'USER',
    amount: payout,
    token: 'M$',
    category: 'PUSH_NOTIFICATION_BONUS',
  }
  return await runTxnFromBank(tx, bonusTxn)
}
