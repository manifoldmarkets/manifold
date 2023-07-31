import * as admin from 'firebase-admin'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTxn, TxnData } from 'shared/txn/run-txn'
import { STARTING_BONUS } from 'common/economy'
import { getUser, isProd, log } from 'shared/utils'
import {
  DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
  HOUSE_LIQUIDITY_PROVIDER_ID,
} from 'common/antes'
import { SignupBonusTxn } from 'common/txn'
import { PrivateUser } from 'common/user'
import { createSignupBonusNotification } from 'shared/create-notification'
import * as dayjs from 'dayjs'
import { sendCreatorGuideEmail } from 'shared/emails'
const LAST_TIME_ON_CREATE_USER_SCHEDULED_EMAIL = 1690810713000

export async function sendOnboardingNotificationsInternal(
  firestore: admin.firestore.Firestore
) {
  const pg = createSupabaseDirectClient()

  const userDetails = await pg.map(
    `select id, (data->'createdTime') as created_time from users 
          where 
              millis_to_ts(((data->'createdTime')::bigint)) < now() - interval '23 hours' and
              millis_to_ts(((data->'createdTime')::bigint)) > now() - interval '2 week'
--             and username like '%manifoldtestnewuser%'
            `,
    [],
    (r) => ({
      id: r.id,
      createdTime: r.created_time,
    })
  )
  const userIds = userDetails.map((u) => u.id)
  const userIdsToReceiveCreatorGuideEmail = userDetails
    .filter(
      (u) =>
        dayjs().diff(dayjs(u.createdTime), 'day') >= 2 &&
        dayjs().diff(dayjs(u.createdTime), 'day') < 3 &&
        u.createdTime > LAST_TIME_ON_CREATE_USER_SCHEDULED_EMAIL
    )
    .map((u) => u.id)

  let manaBonuses = 0
  let skipped = 0
  console.log(
    'Users created older than 1 day, younger than 2 weeks:',
    userIds.length
  )
  await Promise.all(
    userIds.map(async (userId) => {
      const transactionResult = await firestore.runTransaction(
        async (transaction) => {
          const toDoc = firestore.doc(`private-users/${userId}`)
          const toUserSnap = await transaction.get(toDoc)
          if (!toUserSnap.exists) {
            return {
              status: 'error',
              message: 'User not found',
              txn: null,
              privateUser: null,
            }
          }
          const privateUser = toUserSnap.data() as PrivateUser
          let manaBonusTxn
          if (!privateUser.manaBonusSent) {
            const signupBonusTxn: TxnData = {
              fromType: 'BANK',
              amount: STARTING_BONUS,
              category: 'SIGNUP_BONUS',
              toId: userId,
              token: 'M$',
              toType: 'USER',
              fromId: isProd()
                ? HOUSE_LIQUIDITY_PROVIDER_ID
                : DEV_HOUSE_LIQUIDITY_PROVIDER_ID,
              description: 'Signup bonus',
              data: {},
            } as SignupBonusTxn
            manaBonusTxn = await runTxn(transaction, signupBonusTxn)
            if (manaBonusTxn.status != 'error' && manaBonusTxn.txn)
              transaction.update(toDoc, {
                manaBonusSent: true,
                weeklyTrendingEmailSent: true, // not yet, but about to!
              })
          }
          return { ...manaBonusTxn, privateUser }
        }
      )
      if (transactionResult.status === 'error' || !transactionResult.txn) {
        log(
          `No mana bonus sent to user ${userId}: ${transactionResult.message}`
        )
        skipped++
      }
      const privateUser = transactionResult.privateUser
      if (transactionResult.txn && privateUser) {
        manaBonuses++
        const user = await getUser(privateUser.id)
        if (!user) return
        await createSignupBonusNotification(
          user,
          privateUser,
          transactionResult.txn.id,
          STARTING_BONUS
        )
      }
      if (privateUser && userIdsToReceiveCreatorGuideEmail.includes(userId)) {
        const user = await getUser(privateUser.id)
        if (!user) return
        await sendCreatorGuideEmail(user, privateUser)
      }
    })
  )
  log(`Sent mana bonuses to ${manaBonuses} users.`)
  log(`Skipped ${skipped} users.`)
}
