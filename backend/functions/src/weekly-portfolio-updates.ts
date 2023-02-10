import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { orderBy, sortBy, sum } from 'lodash'

import { getUsersContractMetricsOrderedByProfit } from 'common/supabase/contract-metrics'
import { createWeeklyPortfolioUpdateNotification } from './create-notification'
import { getUsernameById } from 'common/supabase/users'
import { createSupabaseClient } from 'shared/supabase/init'
import { log } from 'shared/utils'
import { WeeklyPortfolioUpdate } from 'common/weekly-portfolio-update'
import { DAY_MS } from 'common/util/time'
import { getPortfolioHistories } from 'common/supabase/portfolio-metrics'
import { PrivateUser } from 'common/user'

const firestore = admin.firestore()
const now = new Date()
const time = now.getTime()
const date = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`

// Saving metrics should work until 60k users
export const saveWeeklyContractMetrics = functions
  .runWith({ memory: '4GB', secrets: ['SUPABASE_KEY'], timeoutSeconds: 60 })
  // every minute for 2 hours Friday 2am PT (UTC -08:00)
  .pubsub.schedule('* 10-12 * * 5')
  .timeZone('Etc/UTC')
  .onRun(async () => {
    await saveWeeklyContractMetricsInternal()
  })

export const sendWeeklyPortfolioUpdate = functions
  .runWith({ memory: '8GB', secrets: ['SUPABASE_KEY'], timeoutSeconds: 540 })
  // every Friday at 12pm PT (UTC -06:00)
  .pubsub.schedule('0 18 * * 5')
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
  const snap = await firestore
    .collectionGroup(`weekly-update`)
    .where('rangeEndDateSlug', '==', date)
    .get()

  // get the parent ref is the user id
  const weeklyUpdatedUsers = snap.docs.map((doc) => doc.ref.parent.parent?.id)
  log('already updated users', weeklyUpdatedUsers.length, 'at', time)
  // filter out the users who have already had their weekly update saved
  const usersToSave = privateUsers
    .filter((user) => !weeklyUpdatedUsers.includes(user.id))
    .slice(0, 500)

  log('usersToSave', usersToSave.length)
  if (usersToSave.length === 0) return

  const allContractMetricsByUsers =
    await getUsersContractMetricsOrderedByProfit(
      usersToSave.map((u) => u.id),
      db,
      'week'
    )
  const allPortfolioMetrics = await getPortfolioHistories(
    usersToSave.map((u) => u.id),
    time - 7 * DAY_MS,
    db
  )
  // If the function doesn't complete, filter by those who haven't had their weekly update saved yet
  const results = sortBy(
    await Promise.all(
      usersToSave.map(async (user) => {
        const portfolioMetrics = (allPortfolioMetrics[user.id] ?? []).map(
          (p) => ({
            x: p.timestamp,
            y: p.balance + p.investmentValue - p.totalDeposits,
          })
        )
        const contractMetrics = allContractMetricsByUsers[user.id]
        return {
          contractMetrics,
          userId: user.id,
          weeklyProfit: sum(
            contractMetrics.map((m) => m.from?.week.profit ?? 0)
          ),
          rangeEndDateSlug: date,
          profitPoints: portfolioMetrics,
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
      const snap = await firestore
        .collection(`users/${privateUser.id}/weekly-update`)
        .where('rangeEndDateSlug', '==', date)
        .get()
      if (snap.empty) return
      const update = orderBy(snap.docs, (d) => -d.data().createdTime)[0]
      const { weeklyProfit, rangeEndDateSlug, contractMetrics } =
        update.data() as WeeklyPortfolioUpdate
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
