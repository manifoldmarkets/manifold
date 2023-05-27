import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import * as dayjs from 'dayjs'

import { getPrivateUser } from 'shared/utils'
import {
  MANIFOLD_AVATAR_URL,
  MANIFOLD_USER_NAME,
  MANIFOLD_USER_USERNAME,
  User,
} from 'common/user'
import { Notification } from 'common/notification'
import { STARTING_BONUS } from 'common/economy'
import { SignupBonusTxn } from 'common/txn'
import { APIError } from 'common/api'
import { userOptedOutOfBrowserNotifications } from 'common/user-notification-preferences'
import { runTxn, TxnData } from 'shared/run-txn'
import { secrets } from 'common/secrets'

// TODO: delete email mana signup bonus
export const manasignupbonus = functions
  .runWith({ secrets })
  .pubsub.schedule('0 9 * * 1-7')
  .onRun(async () => {
    await sendOneWeekManaBonuses()
  })

const firestore = admin.firestore()

export async function sendOneWeekManaBonuses() {
  const oneWeekAgo = dayjs().subtract(1, 'week').valueOf()
  const twoWeekAgo = dayjs().subtract(2, 'weeks').valueOf()

  const userDocs = await firestore
    .collection('users')
    .where('createdTime', '>', twoWeekAgo)
    .get()
  const users = userDocs.docs
    .map((d) => d.data() as User)
    .filter((u) => u.createdTime <= oneWeekAgo)

  console.log(
    'Users created older than 1 week, younger than 2 weeks:',
    users.length
  )
  await Promise.all(
    users.map(async (user) => {
      const privateUser = await getPrivateUser(user.id)
      if (!privateUser || privateUser.manaBonusSent) return

      await firestore
        .collection('private-users')
        .doc(user.id)
        .update({ manaBonusSent: true })

      console.log('sending m$ bonus to', user.username)
      const signupBonusTxn: TxnData = {
        fromId: 'BANK',
        fromType: 'BANK',
        amount: STARTING_BONUS,
        category: 'SIGNUP_BONUS',
        toId: user.id,
        token: 'M$',
        toType: 'USER',
        description: 'Signup bonus',
        data: {},
      } as SignupBonusTxn

      const result = await firestore.runTransaction(async (transaction) => {
        const result = await runTxn(transaction, signupBonusTxn)
        if (result.status == 'error') {
          throw new APIError(
            500,
            result.message ?? 'An unknown error occurred.'
          )
        }
        return result
      })
      if (!result.txn) throw new Error(`txn not created ${result.message}`)

      // Only don't send if opted out, otherwise they'll wonder where the 500 mana came from
      if (userOptedOutOfBrowserNotifications(privateUser)) return

      const notificationRef = firestore
        .collection(`/users/${user.id}/notifications`)
        .doc()
      const notification: Notification = {
        id: notificationRef.id,
        userId: user.id,
        reason: 'onboarding_flow',
        createdTime: Date.now(),
        isSeen: false,
        sourceId: result.txn.id,
        sourceType: 'signup_bonus',
        sourceUpdateType: 'created',
        sourceUserName: MANIFOLD_USER_NAME,
        sourceUserUsername: MANIFOLD_USER_USERNAME,
        sourceUserAvatarUrl: MANIFOLD_AVATAR_URL,
        sourceText: STARTING_BONUS.toString(),
      }
      return await notificationRef.set(notification)
    })
  )
}
