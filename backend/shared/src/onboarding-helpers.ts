import * as admin from 'firebase-admin'
import * as dayjs from 'dayjs'

import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTxnFromBank } from 'shared/txn/run-txn'
import { STARTING_BONUS } from 'common/economy'
import { getUser, log } from 'shared/utils'
import { SignupBonusTxn } from 'common/txn'
import { PrivateUser } from 'common/user'
import { createSignupBonusNotification } from 'shared/create-notification'
import { sendCreatorGuideEmail } from 'shared/emails'

const LAST_TIME_ON_CREATE_USER_SCHEDULED_EMAIL = 1690810713000

/*
D1 send mana bonus email
[deprecated] D2 send creator guide email
*/
export async function sendOnboardingNotificationsInternal(
  firestore: admin.firestore.Firestore
) {
  const { recentUserIds } = await getRecentUserIds()

  console.log(
    'Users created older than 1 day, younger than 1 week:',
    recentUserIds.length
  )

  await Promise.all(
    recentUserIds.map((userId) =>
      sendNotifications(
        firestore,
        userId,
        false // userIdsToReceiveCreatorGuideEmail.includes(userId)
      )
    )
  )
}

const getRecentUserIds = async () => {
  const pg = createSupabaseDirectClient()

  const userDetails = await pg.map(
    `select id, (data->'createdTime') as created_time from users 
          where 
              millis_to_ts(((data->'createdTime')::bigint)) < now() - interval '23 hours' and
              millis_to_ts(((data->'createdTime')::bigint)) > now() - interval '1 week'`,
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

const sendNotifications = async (
  firestore: admin.firestore.Firestore,
  userId: string,
  shouldSendCreatorEmail: boolean
) => {
  const { privateUser, txn } = await processManaBonus(firestore, userId)
  if (!privateUser) return
  if (!txn && !shouldSendCreatorEmail) return

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

  if (shouldSendCreatorEmail) {
    await sendCreatorGuideEmail(user, privateUser)
  }
}
