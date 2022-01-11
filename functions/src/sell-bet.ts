import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'

import { Contract } from '../../common/contract'
import { User } from '../../common/user'
import { Bet } from '../../common/bet'
import { getSellBetInfo } from '../../common/sell-bet'

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

      const { closeTime } = contract
      if (closeTime && Date.now() > closeTime)
        return { status: 'error', message: 'Trading is closed' }

      const betDoc = firestore.doc(`contracts/${contractId}/bets/${betId}`)
      const betSnap = await transaction.get(betDoc)
      if (!betSnap.exists) return { status: 'error', message: 'Invalid bet' }
      const bet = betSnap.data() as Bet

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
        creatorFee,
      } = getSellBetInfo(user, bet, contract, newBetDoc.id)

      const creatorDoc = firestore.doc(`users/${contract.creatorId}`)
      const creatorSnap = await transaction.get(creatorDoc)
      if (creatorSnap.exists) {
        const creator = creatorSnap.data() as User
        const creatorNewBalance = creator.balance + creatorFee
        transaction.update(creatorDoc, { balance: creatorNewBalance })
      }

      transaction.update(betDoc, { isSold: true })
      transaction.create(newBetDoc, newBet)
      transaction.update(contractDoc, {
        pool: newPool,
        totalShares: newTotalShares,
        totalBets: newTotalBets,
      })
      transaction.update(userDoc, { balance: newBalance })

      return { status: 'success' }
    })
  }
)

const firestore = admin.firestore()
