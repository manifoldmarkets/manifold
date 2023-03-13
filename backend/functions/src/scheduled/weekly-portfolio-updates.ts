import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { orderBy, sortBy, sum } from 'lodash'

import { getUsersContractMetricsOrderedByProfit } from 'common/supabase/contract-metrics'
import { createWeeklyPortfolioUpdateNotification } from 'shared/create-notification'
import { getUsernameById } from 'common/supabase/users'
import { createSupabaseClient } from 'shared/supabase/init'
import { getUser, log } from 'shared/utils'
import { WeeklyPortfolioUpdate } from 'common/weekly-portfolio-update'
import { PrivateUser } from 'common/user'

const firestore = admin.firestore()
const now = new Date()
const time = now.getTime()
const getDateSlug = () =>
  `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`
const USERS_TO_SAVE = 300
// Saving metrics should work until our users are greater than USERS_TO_SAVE * 2*60 users
export const saveWeeklyContractMetrics = functions
  .runWith({ memory: '4GB', secrets: ['SUPABASE_KEY'], timeoutSeconds: 60 })
  // every minute for 2 hours Friday 4am PT (UTC -08:00)
  .pubsub.schedule('* 13-14 * * 5')
  .timeZone('Etc/UTC')
  .onRun(async () => {
    await saveWeeklyContractMetricsInternal()
  })

export const sendWeeklyPortfolioUpdate = functions
  .runWith({ memory: '8GB', secrets: ['SUPABASE_KEY'], timeoutSeconds: 540 })
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

  // This is a lot of reads on firebase, we should save these in supabase instead
  const alreadyUpdatedSnap = await firestore
    .collectionGroup(`weekly-update`)
    .where('rangeEndDateSlug', '==', getDateSlug())
    .get()

  // The parent ref is the user id
  const weeklyUpdatedUsers = alreadyUpdatedSnap.docs.map(
    (doc) => doc.ref.parent.parent?.id
  )
  log('already updated users', weeklyUpdatedUsers.length, 'at', time)
  // filter out the users who have already had their weekly update saved
  const usersToSave = privateUsers
    .filter((user) => !weeklyUpdatedUsers.includes(user.id))
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

  const results = sortBy(
    await Promise.all(
      usersToSave.map(async (privateUser) => {
        const user = await getUser(privateUser.id)
        const contractMetrics = usersToContractMetrics[privateUser.id]
        return {
          contractMetrics,
          userId: privateUser.id,
          weeklyProfit:
            user?.profitCached.weekly ??
            sum(contractMetrics.map((m) => m.from?.week.profit ?? 0)),
          rangeEndDateSlug: getDateSlug(),
          createdTime: time,
        } as Omit<WeeklyPortfolioUpdate, 'id'>
      })
    ),
    (r) => -r.weeklyProfit
  )
  const batch = firestore.batch()
  results.forEach((result) => {
    const ref = firestore
      .collection(`users/${result.userId}/weekly-update`)
      .doc()
    batch.set(ref, {
      ...result,
      id: ref.id,
    } as WeeklyPortfolioUpdate)
  })
  await batch.commit()
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
  await Promise.all(
    privateUsers.map(async (privateUser) => {
      const data = await getUsersWeeklyUpdate(privateUser.id, getDateSlug())
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

const getUsersWeeklyUpdate = async (userId: string, dateSlug: string) => {
  const snap = await firestore
    .collection(`users/${userId}/weekly-update`)
    .where('rangeEndDateSlug', '==', dateSlug)
    .get()
  if (snap.empty) return
  const update = orderBy(snap.docs, (d) => -d.data().createdTime)[0]
  return update.data() as WeeklyPortfolioUpdate
}
