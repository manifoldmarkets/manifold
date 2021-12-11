import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { Contract } from './types/contract'
import { User } from './types/user'
import { Bet } from './types/bet'

export const placeBet = functions
  .runWith({ minInstances: 1 })
  .https.onCall(async (data: {
    amount: number
    outcome: string
    contractId: string
  }, context) => {
    const userId = context?.auth?.uid
    if (!userId)
      return { status: 'error', message: 'Not authorized' }

    const { amount, outcome, contractId } = data

    if (outcome !== 'YES' && outcome !== 'NO')
      return { status: 'error', message: 'Invalid outcome' }

    // run as transaction to prevent race conditions
    return await firestore.runTransaction(async transaction => {
      const userDoc = firestore.doc(`users/${userId}`)
      const userSnap = await transaction.get(userDoc)
      if (!userSnap.exists) return { status: 'error', message: 'User not found' }
      const user = userSnap.data() as User

      if (user.balanceUsd < amount)
        return { status: 'error', message: 'Insufficient balance' }

      const contractDoc = firestore.doc(`contracts/${contractId}`)
      const contractSnap = await transaction.get(contractDoc)
      if (!contractSnap.exists) return { status: 'error', message: 'Invalid contract' }
      const contract = contractSnap.data() as Contract

      const newBetDoc = firestore.collection(`contracts/${contractId}/bets`).doc()

      const { newBet, newPot, newBalance } = getNewBetInfo(user, outcome, amount, contract, newBetDoc.id)

      transaction.create(newBetDoc, newBet)
      transaction.update(contractDoc, { pot: newPot })
      transaction.update(userDoc, { balanceUsd: newBalance })

      return { status: 'success' }
    })
  })

const firestore = admin.firestore()

const getNewBetInfo = (user: User, outcome: 'YES' | 'NO', amount: number, contract: Contract, newBetId: string) => {
  const { YES: yesPot, NO: noPot } = contract.pot

  const dpmWeight = outcome === 'YES'
    ? amount * Math.pow(noPot, 2) / (Math.pow(yesPot, 2) + amount * yesPot)
    : amount * Math.pow(yesPot, 2) / (Math.pow(noPot, 2) + amount * noPot)

  const newBet: Bet = {
    id: newBetId,
    userId: user.id,
    contractId: contract.id,
    amount,
    dpmWeight,
    outcome,
    createdTime: Date.now()
  }

  const newPot = outcome === 'YES'
    ? { YES: yesPot + amount, NO: noPot }
    : { YES: yesPot, NO: noPot + amount }

  const newBalance = user.balanceUsd - amount

  return { newBet, newPot, newBalance }
}