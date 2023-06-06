import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import * as dayjs from 'dayjs'

import { getPrivateUser, isProd } from 'shared/utils'
import { User } from 'common/user'
import { STARTING_BONUS } from 'common/economy'
import { SignupBonusTxn } from 'common/txn'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { APIError } from 'common/api'
import { runTxn, TxnData } from 'shared/run-txn'
import { secrets } from 'common/secrets'
import { createSignupBonusNotification } from 'shared/create-notification'

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
        fromType: 'BANK',
        amount: STARTING_BONUS,
        category: 'SIGNUP_BONUS',
        toId: user.id,
        token: 'M$',
        toType: 'USER',
        fromId: isProd()
          ? HOUSE_LIQUIDITY_PROVIDER_ID
          : DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
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

      await createSignupBonusNotification(user, result.txn.id, STARTING_BONUS)
    })
  )
}
