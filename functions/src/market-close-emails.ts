import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { Contract } from 'common/contract'
import { getPrivateUser, getUserByUsername } from './utils'
import { sendMarketCloseEmail } from './emails'

export const marketCloseEmails = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async () => {
    await sendMarketCloseEmails()
  })

const firestore = admin.firestore()

async function sendMarketCloseEmails() {
  const contracts = await firestore.runTransaction(async (transaction) => {
    const snap = await transaction.get(
      firestore.collection('contracts').where('isResolved', '!=', true)
    )

    return snap.docs
      .map((doc) => {
        const contract = doc.data() as Contract

        if (
          contract.resolution ||
          (contract.closeEmailsSent ?? 0) >= 1 ||
          contract.closeTime === undefined ||
          (contract.closeTime ?? 0) > Date.now()
        )
          return undefined

        transaction.update(doc.ref, {
          closeEmailsSent: (contract.closeEmailsSent ?? 0) + 1,
        })

        return contract
      })
      .filter((x) => !!x) as Contract[]
  })

  for (let contract of contracts) {
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

    await sendMarketCloseEmail(user, privateUser, contract)
  }
}
