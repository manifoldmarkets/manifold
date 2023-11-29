import * as admin from 'firebase-admin'
import * as dayjs from 'dayjs'

import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTxnFromBank } from 'shared/txn/run-txn'
import { STARTING_BONUS } from 'common/economy'
import { GCPLog, getUser, log } from 'shared/utils'
import { SignupBonusTxn } from 'common/txn'
import { PrivateUser } from 'common/user'
import { createSignupBonusNotification } from 'shared/create-notification'

const LAST_TIME_ON_CREATE_USER_SCHEDULED_EMAIL = 1690810713000

/*
D1 send mana bonus email
[deprecated] D2 send creator guide email
*/
export async function sendOnboardingNotificationsInternal(log: GCPLog) {
  const firestore = admin.firestore()
  const { recentUserIds } = await getRecentNonLoverUserIds()

  log(
    'Non love users created older than 1 day, younger than 1 week:' +
      recentUserIds.length
  )

  await Promise.all(
    recentUserIds.map((userId) => sendBonusNotification(firestore, userId))
  )
}

const getRecentNonLoverUserIds = async () => {
  const pg = createSupabaseDirectClient()

  const userDetails = await pg.map(
    `select id, (data->'createdTime') as created_time from users 
          where 
              millis_to_ts(((data->'createdTime')::bigint)) < now() - interval '23 hours' and
              millis_to_ts(((data->'createdTime')::bigint)) > now() - interval '1 week'and
              (data->>'fromLove' is null or data->>'fromLove' = 'false')
              `,
    // + `and username like '%manifoldtestnewuser%'`,
    [],
    (r) => ({
      id: r.id,
      createdTime: r.created_time,
    })
  )

  const recentUserIds = userDetails.map((u) => u.id) as string[]

  const userIdsToReceiveCreatorGuideEmail = userDetails
    .filter(
      (u) =>
        dayjs().diff(dayjs(u.createdTime), 'day') >= 2 &&
        dayjs().diff(dayjs(u.createdTime), 'day') < 3 &&
        u.createdTime > LAST_TIME_ON_CREATE_USER_SCHEDULED_EMAIL
    )
    .map((u) => u.id) as string[]

  return { recentUserIds, userIdsToReceiveCreatorGuideEmail }
}

const processManaBonus = async (
  firestore: admin.firestore.Firestore,
  userId: string
) => {
  return await firestore.runTransaction(async (transaction) => {
    const toDoc = firestore.doc(`private-users/${userId}`)
    const toUserSnap = await transaction.get(toDoc)
    if (!toUserSnap.exists) return { txn: null, privateUser: null }

    const privateUser = toUserSnap.data() as PrivateUser
    if (privateUser.manaBonusSent) return { txn: null, privateUser }

    const signupBonusTxn: Omit<
      SignupBonusTxn,
      'fromId' | 'id' | 'createdTime'
    > = {
      fromType: 'BANK',
      amount: STARTING_BONUS,
      category: 'SIGNUP_BONUS',
      toId: userId,
      token: 'M$',
      toType: 'USER',
      description: 'Signup bonus',
      data: {},
    }
    const manaBonusTxn = await runTxnFromBank(transaction, signupBonusTxn)
    if (manaBonusTxn.status != 'error' && manaBonusTxn.txn) {
      transaction.update(toDoc, {
        manaBonusSent: true,
        weeklyTrendingEmailSent: true, // not yet, but about to!
      })
      log(`Sent mana bonus to user ${userId}`)
    } else {
      log(`No mana bonus sent to user ${userId}: ${manaBonusTxn.message}`)
    }
    return { ...manaBonusTxn, privateUser }
  })
}

const sendBonusNotification = async (
  firestore: admin.firestore.Firestore,
  userId: string
) => {
  const { privateUser, txn } = await processManaBonus(firestore, userId)
  if (!privateUser || !txn) return

  const user = await getUser(privateUser.id)
  if (!user) return

  if (txn) {
    await createSignupBonusNotification(
      user,
      privateUser,
      txn.id,
      STARTING_BONUS
    )
  }
}
