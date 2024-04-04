import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { sum } from 'lodash'

import { getUsersContractMetricsOrderedByProfit } from 'common/supabase/contract-metrics'
import { createWeeklyPortfolioUpdateNotification } from 'shared/create-notification'
import { getUsernameById } from 'common/supabase/users'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { getUser, log } from 'shared/utils'
import { PrivateUser } from 'common/user'
import { secrets } from 'common/secrets'
import { bulkInsert } from 'shared/supabase/utils'
import { APIError } from 'common/api/utils'

import * as dayjs from 'dayjs'

const firestore = admin.firestore()
const now = new Date()
const time = now.getTime()

const getDate = () => dayjs(now).format('YYYY-MM-DD')

const USERS_TO_SAVE = 300
// Saving metrics should work until our users are greater than USERS_TO_SAVE * 2*60 users
export const saveWeeklyContractMetrics = functions
  .runWith({ memory: '4GB', secrets, timeoutSeconds: 60 })
  // every minute for 2 hours Friday 4am PT (UTC -08:00)
  .pubsub.schedule('* 13-14 * * 5')
  .timeZone('Etc/UTC')
  .onRun(async () => {
    await saveWeeklyContractMetricsInternal()
  })

export const sendWeeklyPortfolioUpdate = functions
  .runWith({ memory: '8GB', secrets, timeoutSeconds: 540 })
  // every Friday at 12pm PT (UTC -08:00)
  .pubsub.schedule('0 20 * * 5')
  .timeZone('Etc/UTC')
  .onRun(async () => {
    await sendWeeklyPortfolioUpdateNotifications()
  })

export const saveWeeklyContractMetricsInternal = async () => {
  const db = createSupabaseClient()

  // users who have disabled browser notifications for profit/loss updates won't be able to see their portfolio updates in the past
  const users = await firestore
    .collection('private-users')
    .where(
      'notificationPreferences.profit_loss_updates',
      'array-contains',
      'browser'
    )
    .get()
  const privateUsers = users.docs.map((doc) => doc.data() as PrivateUser)

  const alreadyUpdatedQuery = await db
    .from('weekly_update')
    .select('user_id')
    .eq('range_end', getDate())

  if (alreadyUpdatedQuery.error) {
    throw new APIError(
      500,
      'Error getting already updated users: ',
      alreadyUpdatedQuery.error
    )
  }

  const alreadyUpdated = alreadyUpdatedQuery.data.map((r) => r.user_id)

  log('already updated users', alreadyUpdated.length, 'at', time)
  // filter out the users who have already had their weekly update saved
  const usersToSave = privateUsers
    .filter((user) => !alreadyUpdated.includes(user.id))
    .slice(0, USERS_TO_SAVE)

  log('usersToSave', usersToSave.length)
  if (usersToSave.length === 0) return

  // TODO: try out the new rpc call
  const usersToContractMetrics = await getUsersContractMetricsOrderedByProfit(
    usersToSave.map((u) => u.id),
    db,
    'week'
  )
  if (Object.keys(usersToContractMetrics).length === 0) {
    log('Error: no contract metrics to save')
    return
  }

  const results = await Promise.all(
    usersToSave.map(async (privateUser) => {
      const user = await getUser(privateUser.id)
      const contractMetrics = usersToContractMetrics[privateUser.id]
      return {
        contract_metrics: contractMetrics,
        user_id: privateUser.id,
        profit:
          user?.profitCached.weekly ??
          sum(contractMetrics.map((m) => m.from?.week.profit ?? 0)),
        range_end: getDate(),
      }
    })
  )

  const pg = createSupabaseDirectClient()
  bulkInsert(pg, 'weekly_update', results)

  log('saved weekly contract metrics for users:', usersToSave.length)
}

export const sendWeeklyPortfolioUpdateNotifications = async () => {
  const db = createSupabaseClient()

  // get all users who have opted in to weekly portfolio updates
  const usersSnap = await firestore
    .collection('private-users')
    .where(
      'notificationPreferences.profit_loss_updates',
      'array-contains',
      'browser'
    )
    .get()
  const privateUsers = usersSnap.docs.map((doc) => doc.data() as PrivateUser)
  const userData = await getUsernameById(
    privateUsers.map((u) => u.id),
    db
  )
  log('users to send weekly portfolio updates to', privateUsers.length)
  let count = 0
  const now = getDate()
  await Promise.all(
    privateUsers.map(async (privateUser) => {
      const data = await getUsersWeeklyUpdate(db, privateUser.id, now)
      if (!data) return
      const { weeklyProfit, rangeEndDateSlug, contractMetrics } = data
      // Don't send update if there are no contracts
      count++
      if (count % 100 === 0)
        log('sent weekly portfolio updates to', count, '/', privateUsers.length)
      if (contractMetrics.length === 0) return
      await createWeeklyPortfolioUpdateNotification(
        privateUser,
        userData[privateUser.id].username,
        weeklyProfit,
        rangeEndDateSlug
      )
    })
  )
}

const getUsersWeeklyUpdate = async (
  db: any,
  userId: string,
  rangeEnd: string
) => {
  const { data, error } = await db
    .from('weekly_update')
    .select('*')
    .eq('user_id', userId)
    .eq('range_end', rangeEnd)
    .orderBy('created_time', { ascending: false })
    .limit(1)

  if (error) {
    console.error(error)
    return
  }
  if (!data.length) {
    return
  }

  const update = data[0]
  return update
}
