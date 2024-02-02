import * as functions from 'firebase-functions'
import { PrivateUser } from 'common/user'
import { secrets } from 'common/secrets'
import { APIError } from 'common/api/utils'
import { PushNotificationBonusTxn } from 'common/txn'
import { runTxnFromBank } from 'shared/txn/run-txn'
import { PUSH_NOTIFICATION_BONUS } from 'common/economy'
import { createPushNotificationBonusNotification } from 'shared/create-notification'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const onUpdatePrivateUser = functions
  .runWith({ secrets })
  .firestore.document('private-users/{userId}')
  .onUpdate(async (snapshot) => {
    const prev = snapshot.before.data() as PrivateUser
    const current = snapshot.after.data() as PrivateUser
    if (!current) return

    if (!prev.pushToken && current.pushToken) {
      // If they already have a txn, they may have just uninstalled and reinstalled app, in which case we should
      // probably send them a note that we already paid them once
      const txn = await payUserPushNotificationsBonus(
        snapshot.after.id,
        PUSH_NOTIFICATION_BONUS
      )
      await createPushNotificationBonusNotification(
        current,
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
  })

const payUserPushNotificationsBonus = async (
  userId: string,
  payout: number
) => {
  const pg = createSupabaseDirectClient()

  return await pg.tx(async (tx) => {
    // make sure we don't already have a txn for this user/questType
    const previousTxn = await tx.oneOrNone(
      `select * from txns where data->>'toId' = $1 and data->>'category' = 'PUSH_NOTIFICATION_BONUS' limit 1`,
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
