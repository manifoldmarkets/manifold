import * as admin from 'firebase-admin'
import * as dayjs from 'dayjs'

import { createSupabaseDirectClient } from 'shared/supabase/init'
import { runTxnFromBank } from 'shared/txn/run-txn'
import {
  MARKET_VISIT_BONUS,
  MARKET_VISIT_BONUS_TOTAL,
  NEXT_DAY_BONUS,
} from 'common/economy'
import { getUser, getUsers, log } from 'shared/utils'
import { SignupBonusTxn } from 'common/txn'
import {
  MANIFOLD_AVATAR_URL,
  MANIFOLD_USER_NAME,
  MANIFOLD_USER_USERNAME,
  PrivateUser,
  User,
  isVerified,
} from 'common/user'
import {
  getNotificationDestinationsForUser,
  userOptedOutOfBrowserNotifications,
} from 'common/user-notification-preferences'
import { Notification } from 'common/notification'
import * as crypto from 'crypto'
import { sendBonusWithInterestingMarketsEmail } from 'shared/emails'
import { insertNotificationToSupabase } from 'shared/supabase/notifications'
import { APIError } from 'common/api/utils'
import { getForYouMarkets } from 'shared/weekly-markets-emails'
import { updateUser } from './supabase/users'

const LAST_TIME_ON_CREATE_USER_SCHEDULED_EMAIL = 1690810713000

/*
D1 send mana bonus email
[deprecated] D2 send creator guide email
*/
export async function sendOnboardingNotificationsInternal() {
  const { recentUserIds } = await getRecentNonLoverUserIds()

  log(
    'Non love users created older than 1 day, younger than 1 week:' +
      recentUserIds.length
  )

  await sendBonusNotifications(recentUserIds)
}

const getRecentNonLoverUserIds = async () => {
  const pg = createSupabaseDirectClient()

  const userDetails = await pg.map(
    `select id, (data->'createdTime') as created_time from users
          where
              millis_to_ts(((data->'createdTime')::bigint)) < now() - interval '23 hours' and
              millis_to_ts(((data->'createdTime')::bigint)) > now() - interval '1 week'and
              (data->>'verifiedPhone')::boolean = true and
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

const sendNextDayManaBonus = async (
  firestore: admin.firestore.Firestore,
  user: User
) => {
  const pg = createSupabaseDirectClient()

  const privateUser = await firestore.runTransaction(async (transaction) => {
    const toDoc = firestore.doc(`private-users/${user.id}`)
    const toUserSnap = await transaction.get(toDoc)
    if (!toUserSnap.exists) return null

    const privateUser = toUserSnap.data() as PrivateUser
    if (privateUser.manaBonusSent) {
      log(`User ${user.id} already received mana bonus`)
      return null
    } else {
      transaction.update(toDoc, {
        manaBonusSent: true,
        weeklyTrendingEmailSent: true, // not yet, but about to!
      })
    }
    return privateUser
  })

  if (!privateUser) return

  const signupBonusTxn: Omit<SignupBonusTxn, 'fromId' | 'id' | 'createdTime'> =
    {
      fromType: 'BANK',
      amount: NEXT_DAY_BONUS,
      category: 'SIGNUP_BONUS',
      toId: user.id,
      token: 'M$',
      toType: 'USER',
      description: 'Next day signup bonus',
    }

  const txn = await pg
    .tx((tx) => runTxnFromBank(tx, signupBonusTxn))
    .catch((e) => {
      log.error(
        `User ${user.id} had initial signup bonus marked but may not have recieved mana! Must manually reconcile`
      )
      log.error(e && typeof e === 'object' && 'message' in e ? e.message : e)
      return null
    })

  if (!txn) return

  log(`Sent mana bonus to user ${user.id}`)

  await createSignupBonusNotification(user, privateUser, txn.id, NEXT_DAY_BONUS)
}

export const sendOnboardingMarketVisitBonus = async (userId: string) => {
  const pg = createSupabaseDirectClient()

  return await pg.tx(async (tx) => {
    const user = await getUser(userId, tx)

    if (!user) {
      throw new APIError(404, `User ${userId} not found`)
    }

    if (!isVerified(user)) {
      throw new APIError(403, 'User not yet verified phone number.')
    }

    if (user.signupBonusPaid === undefined) {
      throw new APIError(
        403,
        `User ${userId} not eligible for market visit bonus`
      )
    }

    if (user.signupBonusPaid >= MARKET_VISIT_BONUS_TOTAL) {
      throw new APIError(
        403,
        `User ${userId} already received ${
          MARKET_VISIT_BONUS_TOTAL / MARKET_VISIT_BONUS
        } market visit bonuses`
      )
    }

    await updateUser(tx, user.id, {
      signupBonusPaid: user.signupBonusPaid + MARKET_VISIT_BONUS,
    })

    const signupBonusTxn: Omit<
      SignupBonusTxn,
      'fromId' | 'id' | 'createdTime'
    > = {
      fromType: 'BANK',
      amount: MARKET_VISIT_BONUS,
      category: 'SIGNUP_BONUS',
      toId: userId,
      token: 'M$',
      toType: 'USER',
      description: 'New user market visit bonus',
    }

    const txn = await runTxnFromBank(tx, signupBonusTxn)
    log(`Sent mana bonus to user ${userId}`)
    return txn
  })
}

const sendBonusNotifications = async (userIds: string[]) => {
  const firestore = admin.firestore()
  const users = await getUsers(userIds)
  await Promise.all(users.map((user) => sendNextDayManaBonus(firestore, user)))
}

const createSignupBonusNotification = async (
  user: User,
  privateUser: PrivateUser,
  txnId: string,
  bonusAmount: number
) => {
  if (!userOptedOutOfBrowserNotifications(privateUser)) {
    const notification: Notification = {
      id: crypto.randomUUID(),
      userId: privateUser.id,
      reason: 'onboarding_flow',
      createdTime: Date.now(),
      isSeen: false,
      sourceId: txnId,
      sourceType: 'signup_bonus',
      sourceUpdateType: 'created',
      sourceUserName: MANIFOLD_USER_NAME,
      sourceUserUsername: MANIFOLD_USER_USERNAME,
      sourceUserAvatarUrl: MANIFOLD_AVATAR_URL,
      sourceText: bonusAmount.toString(),
    }
    const pg = createSupabaseDirectClient()
    await insertNotificationToSupabase(notification, pg)
  }

  // This is email is of both types, so try either
  const { sendToEmail } = getNotificationDestinationsForUser(
    privateUser,
    'onboarding_flow'
  )
  const { sendToEmail: trendingSendToEmail } =
    getNotificationDestinationsForUser(privateUser, 'trending_markets')

  if (!sendToEmail && !trendingSendToEmail) {
    log(
      `User opted out of onboarding email, onboarding_flow: ${sendToEmail} 'trending_markets:', ${trendingSendToEmail}`
    )
    return
  }

  const contractsToSend = await getForYouMarkets(privateUser.id, 6, privateUser)

  await sendBonusWithInterestingMarketsEmail(
    user,
    privateUser,
    contractsToSend,
    bonusAmount
  )
}
