import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import { sortBy, sum } from 'lodash'

import { PrivateUser } from '../../common/user'
import { getBestAndWorstUserContractMetrics } from '../../common/supabase/contract-metrics'
import { createWeeklyPortfolioUpdateNotification } from './create-notification'
import { getUsernameById } from '../../common/supabase/users'
import { createSupabaseClient } from './supabase/init'
import { WeeklyPortfolioUpdate } from '../../common/weekly-portfolio-update'
import { DAY_MS } from '../../common/util/time'
import { getPortfolioHistory } from '../../common/supabase/portfolio-metrics'

const firestore = admin.firestore()
const now = new Date()
const time = now.getTime()
const date = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`

export const saveWeeklyContractMetrics = functions
  .runWith({ memory: '4GB', timeoutSeconds: 540 })
  // every Friday at 11am PT (UTC -07:00)
  .pubsub.schedule('0 18 * * 5')
  .timeZone('Etc/UTC')
  .onRun(async () => {
    await saveWeeklyContractMetricsInternal()
  })

export const sendWeeklyPortfolioUpdate = functions
  .runWith({ memory: '4GB', timeoutSeconds: 540 })
  // every Friday at 12pm PT (UTC -07:00)
  .pubsub.schedule('* 19 * * 5')
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

  // If the function doesn't complete, filter by those who haven't had their weekly update saved yet
  const results = sortBy(
    await Promise.all(
      privateUsers.map(async (user) => {
        const contractMetrics = await getBestAndWorstUserContractMetrics(
          user.id,
          db,
          'week',
          10
        )

        const portfolioMetrics = (
          await getPortfolioHistory(user.id, time - 7 * DAY_MS, db)
        ).map((p) => ({
          x: p.timestamp,
          y: p.balance + p.investmentValue - p.totalDeposits,
        }))

        return {
          contractMetrics,
          userId: user.id,
          weeklyProfit: sum(
            contractMetrics.map((m) => m.from?.week.profit ?? 0)
          ),
          rangeEndDateSlug: date,
          profitPoints: portfolioMetrics,
        } as WeeklyPortfolioUpdate
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
}

export const sendWeeklyPortfolioUpdateNotifications = async () => {
  const db = createSupabaseClient()

  // get all users who have opted in to weekly portfolio updates
  const usersSnap = await firestore
    .collection('private-users')
    .where('id', '==', 'AJwLWoo3xue32XIiAVrL5SyR1WB2')
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

  await Promise.all(
    privateUsers.map(async (privateUser) => {
      const snap = await firestore
        .collection(`users/${privateUser.id}/weekly-update`)
        .where('rangeEndSlug', '==', date)
        .get()
      if (snap.empty) return
      const { weeklyProfit, rangeEndDateSlug } =
        snap.docs[0].data() as WeeklyPortfolioUpdate
      await createWeeklyPortfolioUpdateNotification(
        privateUser,
        userData[privateUser.id].username,
        weeklyProfit,
        rangeEndDateSlug
      )
    })
  )
}
