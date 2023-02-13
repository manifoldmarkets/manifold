import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { Contract } from 'common/contract'
import { getPrivateUser, getUserByUsername, isProd } from 'shared/utils'
import { createMarketClosedNotification } from '../create-notification'
import { DAY_MS } from 'common/util/time'

const SEND_NOTIFICATIONS_EVERY_DAYS = 5
export const marketCloseNotifications = functions
  .runWith({ secrets: ['MAILGUN_KEY'], memory: '4GB', timeoutSeconds: 540 })
  .pubsub.schedule('every 1 hours')
  .onRun(async () => {
    isProd()
      ? await sendMarketCloseEmails()
      : console.log('Not prod, not sending emails')
  })

const firestore = admin.firestore()

export async function sendMarketCloseEmails() {
  const contracts = await firestore.runTransaction(async (transaction) => {
    const now = Date.now()
    const snap = await transaction.get(
      firestore
        .collection('contracts')
        .where('isResolved', '==', false)
        .where('closeTime', '<', now)
    )
    const contracts = snap.docs.map((doc) => doc.data() as Contract)
    console.log(`Found ${contracts.length} closed contracts`)
    const needsNotification = contracts.filter((contract) =>
      shouldSendFirstOrFollowUpCloseNotification(contract)
    )
    console.log(`Found ${needsNotification.length} notifications to send`)

    needsNotification.map(async (contract) => {
      transaction.update(firestore.collection('contracts').doc(contract.id), {
        closeEmailsSent: admin.firestore.FieldValue.increment(1),
      })
    })
    return needsNotification
  })

  for (const contract of contracts) {
    console.log(
      'sending close email for',
      contract.slug,
      'closed',
      contract.closeTime
    )

    const user = await getUserByUsername(contract.creatorUsername)
    if (!user) continue

    const privateUser = await getPrivateUser(user.id)
    if (!privateUser) continue

    await createMarketClosedNotification(
      contract,
      user,
      privateUser,
      contract.id + '-closed-at-' + contract.closeTime
    )
  }
}

// The downside of this approach is if this function goes down for the entire
// day of a multiple of the time period after the market has closed, it won't
// keep sending them notifications bc when it comes back online the time period will have passed
function shouldSendFirstOrFollowUpCloseNotification(contract: Contract) {
  if (!contract.closeEmailsSent || contract.closeEmailsSent === 0) return true
  const { closedMultipleOfNDaysAgo, fullTimePeriodsSinceClose } =
    marketClosedMultipleOfNDaysAgo(contract)
  return (
    contract.closeEmailsSent > 0 &&
    closedMultipleOfNDaysAgo &&
    contract.closeEmailsSent === fullTimePeriodsSinceClose
  )
}

function marketClosedMultipleOfNDaysAgo(contract: Contract) {
  const now = Date.now()
  const closeTime = contract.closeTime
  if (!closeTime)
    return { closedMultipleOfNDaysAgo: false, fullTimePeriodsSinceClose: 0 }
  const daysSinceClose = Math.floor((now - closeTime) / DAY_MS)
  return {
    closedMultipleOfNDaysAgo:
      daysSinceClose % SEND_NOTIFICATIONS_EVERY_DAYS == 0,
    fullTimePeriodsSinceClose: Math.floor(
      daysSinceClose / SEND_NOTIFICATIONS_EVERY_DAYS
    ),
  }
}
