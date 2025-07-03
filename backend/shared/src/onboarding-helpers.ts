import {
  createSupabaseDirectClient,
  SupabaseTransaction,
} from 'shared/supabase/init'
import { TxnData, insertTxns } from 'shared/txn/run-txn'
import { NEXT_DAY_BONUS } from 'common/economy'
import { isProd, log } from 'shared/utils'
import {
  MANIFOLD_AVATAR_URL,
  MANIFOLD_USER_NAME,
  MANIFOLD_USER_USERNAME,
  PrivateUser,
  User,
} from 'common/user'
import {
  getNotificationDestinationsForUser,
  userOptedOutOfBrowserNotifications,
} from 'common/user-notification-preferences'
import { Notification } from 'common/notification'
import { sendBonusWithInterestingMarketsEmail } from 'shared/emails'
import { bulkInsertNotifications } from 'shared/supabase/notifications'
import { getForYouMarkets } from 'shared/weekly-markets-emails'
import { bulkIncrementBalances } from './supabase/users'
import { convertUser, convertPrivateUser } from 'common/supabase/users'
import { bulkUpdateData } from './supabase/utils'
import { nanoid } from 'common/util/random'
import { filterDefined } from 'common/util/array'

/*
D1 send mana bonus email
*/
export async function sendOnboardingNotificationsInternal() {
  if (!isProd()) return
  const pg = createSupabaseDirectClient()

  const recentUsers = await pg.map(
    `select * from users
          where
              -- adding padding in case the scheduler went down
              created_time < now() - interval '23 hours' and
              created_time > now() - interval '1 week' and
              (data->>'fromLove' is null or data->>'fromLove' = 'false')
              `,
    [],
    convertUser
  )

  log(
    'Non love users created older than 1 day, younger than 1 week:' +
      recentUsers.length
  )

  if (recentUsers.length === 0) return

  // Bulk fetch all private users
  const userIds = recentUsers.map((user) => user.id)
  const privateUsers = await pg.map(
    `select * from private_users where id = any($1)`,
    [userIds],
    convertPrivateUser
  )

  // Process all users and collect bulk operations
  const results = filterDefined(
    await Promise.all(
      recentUsers.map(async (user) => {
        const privateUser = privateUsers.find((p) => p.id === user.id)
        if (!privateUser) {
          log(`Could not find private user ${user.id}`)
          return undefined
        }
        return processUserForBonus(user, privateUser)
      })
    )
  )

  // Collect all operations for bulk execution
  const balanceIncrements = filterDefined(
    results.map((result) => result?.balanceIncrement)
  )

  const txnDatas = filterDefined(results.map((result) => result?.txnData))

  const privateUserUpdates = filterDefined(
    results.map((result) => result?.privateUserUpdate)
  )

  const notifications = filterDefined(
    results.map((result) => result?.notification)
  )

  const emailData = filterDefined(results.map((result) => result?.emailData))

  // Execute bulk operations
  await pg.tx(async (tx: SupabaseTransaction) => {
    if (balanceIncrements.length > 0) {
      await bulkIncrementBalances(tx, balanceIncrements)
      log(`Bulk updated ${balanceIncrements.length} user balances`)
    }

    if (txnDatas.length > 0) {
      await insertTxns(tx, txnDatas)
      log(`Bulk inserted ${txnDatas.length} transactions`)
    }

    if (privateUserUpdates.length > 0) {
      await bulkUpdateData(tx, 'private_users', privateUserUpdates)
      // Also update the weekly_trending_email_sent field for all users
      await tx.none(
        `update private_users set weekly_trending_email_sent = true where id = any($1)`,
        [privateUserUpdates.map((u) => u.id)]
      )
      log(`Bulk updated ${privateUserUpdates.length} private users`)
    }
  })

  // Bulk insert notifications
  if (notifications.length > 0) {
    await bulkInsertNotifications(notifications, pg, true)
    log(`Bulk inserted ${notifications.length} signup bonus notifications`)
  }

  // Send emails in parallel, chunked by 50
  if (emailData.length > 0) {
    const chunkSize = 50
    for (let i = 0; i < emailData.length; i += chunkSize) {
      const chunk = emailData.slice(i, i + chunkSize)
      await Promise.all(chunk.map(sendSignupBonusEmail))
      log(
        `Sent ${chunk.length} signup bonus emails (chunk ${
          Math.floor(i / chunkSize) + 1
        }/${Math.ceil(emailData.length / chunkSize)})`
      )
    }
    log(`Sent ${emailData.length} total signup bonus emails`)
  }

  // const unactivatedUsers = recentUsers.filter((user) => !user.lastBetTime)
  // const templateId = 'didnt-bet-new-user-survey'
  // const unactivatedUsersSentEmailAlready = await pg.map(
  //   `select distinct users.id from users
  //           join sent_emails on users.id = sent_emails.user_id
  //           where users.id = any($1)
  //           and sent_emails.email_template_id = $2`,
  //   [unactivatedUsers.map((user) => user.id), templateId],
  //   (row) => row.id
  // )

  // await Promise.all(
  //   unactivatedUsers
  //     .filter((user) => !unactivatedUsersSentEmailAlready.includes(user.id))
  //     .map(async (user) => {
  //       await sendUnactivatedNewUserEmail(user, templateId)
  //       await pg.none(
  //         `insert into sent_emails (user_id, email_template_id) values ($1, $2)`,
  //         [user.id, templateId]
  //       )
  //     })
  // )
}

interface SignupBonusResult {
  balanceIncrement?: {
    id: string
    balance: number
    totalDeposits: number
  }
  txnData?: TxnData
  privateUserUpdate?: {
    id: string
    manaBonusSent: boolean
  }
  notification?: Notification
  emailData?: {
    user: User
    privateUser: PrivateUser
    bonusAmount: number
  }
}

const processUserForBonus = async (
  user: User,
  privateUser: PrivateUser
): Promise<SignupBonusResult | undefined> => {
  // Check if user already received bonus
  if (privateUser.manaBonusSent) {
    log(`User ${user.id} already received mana bonus`)
    return undefined
  }

  const result: SignupBonusResult = {}

  // Prepare private user update
  result.privateUserUpdate = {
    id: user.id,
    manaBonusSent: true,
  }

  // Prepare balance increment
  result.balanceIncrement = {
    id: user.id,
    balance: NEXT_DAY_BONUS,
    totalDeposits: NEXT_DAY_BONUS,
  }

  // Prepare transaction data
  const txnId = nanoid()
  result.txnData = {
    fromId: 'BANK',
    fromType: 'BANK',
    amount: NEXT_DAY_BONUS,
    category: 'SIGNUP_BONUS',
    toId: user.id,
    token: 'M$',
    toType: 'USER',
    description: 'Next day signup bonus',
  }

  // Prepare notification if user hasn't opted out
  if (!userOptedOutOfBrowserNotifications(privateUser)) {
    result.notification = {
      id: nanoid(6),
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
      sourceText: NEXT_DAY_BONUS.toString(),
    }
  }

  // Prepare email data if user hasn't opted out
  const { sendToEmail } = getNotificationDestinationsForUser(
    privateUser,
    'onboarding_flow'
  )
  const { sendToEmail: trendingSendToEmail } =
    getNotificationDestinationsForUser(privateUser, 'trending_markets')

  if (sendToEmail || trendingSendToEmail) {
    result.emailData = {
      user,
      privateUser,
      bonusAmount: NEXT_DAY_BONUS,
    }
  } else {
    log(
      `User opted out of onboarding email, onboarding_flow: ${sendToEmail} 'trending_markets:', ${trendingSendToEmail}`
    )
  }

  log(`Prepared mana bonus for user ${user.id}`)
  return result
}

const sendSignupBonusEmail = async (emailData: {
  user: User
  privateUser: PrivateUser
  bonusAmount: number
}) => {
  const { user, privateUser, bonusAmount } = emailData
  const contractsToSend = await getForYouMarkets(privateUser.id, 6, privateUser)

  await sendBonusWithInterestingMarketsEmail(
    user,
    privateUser,
    contractsToSend,
    bonusAmount
  )
}

// export const sendOnboardingMarketVisitBonus = async (userId: string) => {
//   const pg = createSupabaseDirectClient()

//   return await pg.tx(async (tx) => {
//     const user = await getUser(userId, tx)

//     if (!user) {
//       throw new APIError(404, `User ${userId} not found`)
//     }

//     if (!humanish(user)) {
//       throw new APIError(403, 'User not yet verified phone number.')
//     }

//     if (user.signupBonusPaid === undefined) {
//       throw new APIError(
//         403,
//         `User ${userId} not eligible for market visit bonus`
//       )
//     }

//     if (user.signupBonusPaid >= MARKET_VISIT_BONUS_TOTAL) {
//       throw new APIError(
//         403,
//         `User ${userId} already received ${
//           MARKET_VISIT_BONUS_TOTAL / MARKET_VISIT_BONUS
//         } market visit bonuses`
//       )
//     }

//     await updateUser(tx, user.id, {
//       signupBonusPaid: user.signupBonusPaid + MARKET_VISIT_BONUS,
//     })

//     const signupBonusTxn: Omit<
//       SignupBonusTxn,
//       'fromId' | 'id' | 'createdTime'
//     > = {
//       fromType: 'BANK',
//       amount: MARKET_VISIT_BONUS,
//       category: 'SIGNUP_BONUS',
//       toId: userId,
//       token: 'M$',
//       toType: 'USER',
//       description: 'New user market visit bonus',
//     }

//     const txn = await runTxnFromBank(tx, signupBonusTxn)
//     log(`Sent mana bonus to user ${userId}`)
//     return txn
//   })
// }
