import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { User } from '../../common/user'

export const buyLeaderboardSlot = functions
  .runWith({ minInstances: 1 })
  .https.onCall(
    async (
      data: {
        slotId: string
        reassessValue: number
      },
      context
    ) => {
      const userId = context?.auth?.uid
      if (!userId) return { status: 'error', message: 'Not authorized' }

      // Run as transaction to prevent race conditions.
      return await firestore.runTransaction(async (transaction) => {
        const userDoc = firestore.doc(`users/${userId}`)
        const userSnap = await transaction.get(userDoc)
        if (!userSnap.exists)
          return { status: 'error', message: 'User not found' }
        const user = userSnap.data() as User

        const { slotId, reassessValue } = data

        // TODO: find most recent purchase of slotId.
        // Fake data below:
        const prevSlotPurchase = {
          id: slotId,
          reassessValue: 100,
          userId: '',
          timestamp: 0,
        }

        if (prevSlotPurchase) {
          const prevSlotUserDoc = firestore.doc(
            `users/${prevSlotPurchase.userId}`
          )
          const prevSlotUserSnap = await transaction.get(prevSlotUserDoc)
          if (!prevSlotUserSnap.exists)
            return { status: 'error', message: 'Previous slot owner not found' }
          const prevSlotUser = prevSlotUserSnap.data() as User

          const timeSinceLastPurchase = Date.now() - prevSlotPurchase.timestamp
          const hoursSinceLastPurchase =
            timeSinceLastPurchase / (1000 * 60 * 60)

          const harbergerTax =
            prevSlotPurchase.reassessValue * 0.1 * hoursSinceLastPurchase
          const prevSlotUserBalance = prevSlotUser.balance - harbergerTax
          if (!isFinite(prevSlotUserBalance)) {
            throw new Error(
              'Invalid user balance for previous slot owner ' +
                prevSlotUser.username
            )
          }
          transaction.update(prevSlotUserDoc, { balance: prevSlotUserBalance })
        }

        // TODO: If no prevSlotPurchase, use a default purchase price?
        const newBalance = user.balance - prevSlotPurchase.reassessValue
        if (!isFinite(newBalance)) {
          throw new Error('Invalid user balance for ' + user.username)
        }
        transaction.update(userDoc, { balance: newBalance })

        const newSlotPurchase = {
          id: slotId,
          reassessValue,
          userId,
          timestamp: Date.now(),
        }

        // TODO: save doc newSlotPurchase in some collection.

        return { status: 'success', slotPurchase: newSlotPurchase }
      })
    }
  )

const firestore = admin.firestore()
