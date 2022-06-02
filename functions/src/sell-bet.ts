import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'

import { Contract } from '../../common/contract'
import { User } from '../../common/user'
import { Bet } from '../../common/bet'
import { getSellBetInfo } from '../../common/sell-bet'
import { addObjects, removeUndefinedProps } from '../../common/util/object'
import { Fees } from '../../common/fees'

export const sellBet = functions.runWith({ minInstances: 1 }).https.onCall(
  async (
    data: {
      contractId: string
      betId: string
    },
    context
  ) => {
    const userId = context?.auth?.uid
    if (!userId) return { status: 'error', message: 'Not authorized' }

    const { contractId, betId } = data

    // run as transaction to prevent race conditions
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
      const contract = contractSnap.data() as Contract
      const { closeTime, mechanism, collectedFees, volume } = contract

      if (mechanism !== 'dpm-2')
        return {
          status: 'error',
          message: 'Sell shares only works with mechanism dpm-2',
        }

      if (closeTime && Date.now() > closeTime)
        return { status: 'error', message: 'Trading is closed' }

      const betDoc = firestore.doc(`contracts/${contractId}/bets/${betId}`)
      const betSnap = await transaction.get(betDoc)
      if (!betSnap.exists) return { status: 'error', message: 'Invalid bet' }
      const bet = betSnap.data() as Bet

      if (userId !== bet.userId) return { status: 'error', message: 'Not authorized' }
      if (bet.isSold) return { status: 'error', message: 'Bet already sold' }

      const newBetDoc = firestore
        .collection(`contracts/${contractId}/bets`)
        .doc()

      const {
        newBet,
        newPool,
        newTotalShares,
        newTotalBets,
        newBalance,
        fees,
      } = getSellBetInfo(user, bet, contract, newBetDoc.id)

      if (!isFinite(newBalance)) {
        throw new Error('Invalid user balance for ' + user.username)
      }
      transaction.update(userDoc, { balance: newBalance })

      transaction.update(betDoc, { isSold: true })
      transaction.create(newBetDoc, newBet)
      transaction.update(
        contractDoc,
        removeUndefinedProps({
          pool: newPool,
          totalShares: newTotalShares,
          totalBets: newTotalBets,
          collectedFees: addObjects(fees, collectedFees),
          volume: volume + Math.abs(newBet.amount),
        })
      )

      return { status: 'success' }
    })
  }
)

const firestore = admin.firestore()
