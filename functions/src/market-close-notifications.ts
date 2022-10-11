import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { Contract } from '../../common/contract'
import { getPrivateUser, getUserByUsername } from './utils'
import { createMarketClosedNotification } from './create-notification'
import { DAY_MS } from '../../common/util/time'

const SEND_NOTIFICATIONS_EVERY_DAYS = 5
export const marketCloseNotifications = functions
  .runWith({ secrets: ['MAILGUN_KEY'] })
  .pubsub.schedule('every 1 hours')
  .onRun(async () => {
    await sendMarketCloseEmails()
  })

const firestore = admin.firestore()

export async function sendMarketCloseEmails() {
  const contracts = await firestore.runTransaction(async (transaction) => {
    const snap = await transaction.get(
      firestore.collection('contracts').where('isResolved', '!=', true)
    )
    const contracts = snap.docs.map((doc) => doc.data() as Contract)
    const now = Date.now()
    const closeContracts = contracts.filter(
      (contract) =>
        contract.closeTime &&
        contract.closeTime < now &&
        shouldSendFirstOrFollowUpCloseNotification(contract)
    )

    await Promise.all(
      closeContracts.map(async (contract) => {
        await transaction.update(
          firestore.collection('contracts').doc(contract.id),
          {
            closeEmailsSent: admin.firestore.FieldValue.increment(1),
          }
        )
      })
    )
    return closeContracts
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
