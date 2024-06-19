import { PUSH_NOTIFICATION_BONUS } from 'common/economy'
import { PushNotificationBonusTxn } from 'common/txn'
import { createPushNotificationBonusNotification } from 'shared/create-notification'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTxnFromBank } from 'shared/txn/run-txn'
import { broadcastUpdatedPrivateUser } from 'shared/websockets/helpers'
import { APIError, APIHandler } from './helpers/endpoint'

// for mobile or something?
export const setPushToken: APIHandler<'set-push-token'> = async (
  props,
  auth
) => {
  const { pushToken } = props
  const db = createSupabaseDirectClient()

  const updated = await db.one(
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
  broadcastUpdatedPrivateUser(auth.uid)

  const txn = await payUserPushNotificationsBonus(
    auth.uid,
    PUSH_NOTIFICATION_BONUS
  )
  await createPushNotificationBonusNotification(
    updated,
    txn.id,
    PUSH_NOTIFICATION_BONUS,
    'push_notification_bonus_' +
      new Date().toLocaleDateString('en-US', {
        year: '2-digit',
        month: '2-digit',
        day: '2-digit',
      })
  )
}

const payUserPushNotificationsBonus = async (
  userId: string,
  payout: number
) => {
  const pg = createSupabaseDirectClient()

  return await pg.tx(async (tx) => {
    // make sure we don't already have a txn for this user/questType
    const previousTxn = await tx.oneOrNone(
      `select * from txns where to_id = $1 and category = 'PUSH_NOTIFICATION_BONUS' limit 1`,
      [userId]
    )
    if (previousTxn) {
      throw new APIError(400, 'Already awarded PUSH_NOTIFICATION_BONUS')
    }

    const loanTxn: Omit<
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
    return await runTxnFromBank(tx, loanTxn)
  })
}
