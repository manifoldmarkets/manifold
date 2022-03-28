import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'

import { Binary, CPMM, FullContract } from '../../common/contract'
import { User } from '../../common/user'
import { getCpmmSellBetInfo } from '../../common/sell-bet'
import { addObjects, removeUndefinedProps } from '../../common/util/object'

export const sellShares = functions.runWith({ minInstances: 1 }).https.onCall(
  async (
    data: {
      contractId: string
      shares: number
      outcome: 'YES' | 'NO'
    },
    context
  ) => {
    const userId = context?.auth?.uid
    if (!userId) return { status: 'error', message: 'Not authorized' }

    const { contractId, shares, outcome } = data

    // Run as transaction to prevent race conditions.
    return await firestore.runTransaction(async (transaction) => {
      const userDoc = firestore.doc(`users/${userId}`)
      const userSnap = await transaction.get(userDoc)
      if (!userSnap.exists)
        return { status: 'error', message: 'User not found' }
      const user = userSnap.data() as User

      const contractDoc = firestore.doc(`contracts/${contractId}`)
      const contractSnap = await transaction.get(contractDoc)
      if (!contractSnap.exists)
        return { status: 'error', message: 'Invalid contract' }
      const contract = contractSnap.data() as FullContract<CPMM, Binary>
      const { closeTime, mechanism, collectedFees, volume } = contract

      if (mechanism !== 'cpmm-1')
        return {
          status: 'error',
          message: 'Sell shares only works with mechanism cpmm-1',
        }

      if (closeTime && Date.now() > closeTime)
        return { status: 'error', message: 'Trading is closed' }

      const newBetDoc = firestore
        .collection(`contracts/${contractId}/bets`)
        .doc()

      const { newBet, newPool, newBalance, fees } = getCpmmSellBetInfo(
        user,
        shares,
        outcome,
        contract,
        newBetDoc.id
      )

      if (!isFinite(newBalance)) {
        throw new Error('Invalid user balance for ' + user.username)
      }
      transaction.update(userDoc, { balance: newBalance })
      transaction.create(newBetDoc, newBet)
      transaction.update(
        contractDoc,
        removeUndefinedProps({
          pool: newPool,
          collectedFees: addObjects(fees ?? {}, collectedFees ?? {}),
          volume: volume + Math.abs(newBet.amount),
        })
      )

      return { status: 'success' }
    })
  }
)

const firestore = admin.firestore()
