import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'

import { Contract } from './types/contract'
import { User } from './types/user'
import { Bet } from './types/bet'

export const placeBet = functions.runWith({ minInstances: 1 }).https.onCall(
  async (
    data: {
      amount: number
      outcome: string
      contractId: string
    },
    context
  ) => {
    const userId = context?.auth?.uid
    if (!userId) return { status: 'error', message: 'Not authorized' }

    const { amount, outcome, contractId } = data

    if (outcome !== 'YES' && outcome !== 'NO')
      return { status: 'error', message: 'Invalid outcome' }

    // run as transaction to prevent race conditions
    return await firestore.runTransaction(async (transaction) => {
      const userDoc = firestore.doc(`users/${userId}`)
      const userSnap = await transaction.get(userDoc)
      if (!userSnap.exists)
        return { status: 'error', message: 'User not found' }
      const user = userSnap.data() as User

      if (user.balance < amount)
        return { status: 'error', message: 'Insufficient balance' }

      const contractDoc = firestore.doc(`contracts/${contractId}`)
      const contractSnap = await transaction.get(contractDoc)
      if (!contractSnap.exists)
        return { status: 'error', message: 'Invalid contract' }
      const contract = contractSnap.data() as Contract

      const newBetDoc = firestore
        .collection(`contracts/${contractId}/bets`)
        .doc()

      const { newBet, newPool, newDpmWeights, newBalance } = getNewBetInfo(
        user,
        outcome,
        amount,
        contract,
        newBetDoc.id
      )

      transaction.create(newBetDoc, newBet)
      transaction.update(contractDoc, {
        pool: newPool,
        dpmWeights: newDpmWeights,
      })
      transaction.update(userDoc, { balance: newBalance })

      return { status: 'success' }
    })
  }
)

const firestore = admin.firestore()

const getNewBetInfo = (
  user: User,
  outcome: 'YES' | 'NO',
  amount: number,
  contract: Contract,
  newBetId: string
) => {
  const { YES: yesPool, NO: noPool } = contract.pool

  const newPool =
    outcome === 'YES'
      ? { YES: yesPool + amount, NO: noPool }
      : { YES: yesPool, NO: noPool + amount }

  const dpmWeight =
    outcome === 'YES'
      ? (amount * noPool ** 2) / (yesPool ** 2 + amount * yesPool)
      : (amount * yesPool ** 2) / (noPool ** 2 + amount * noPool)

  const { YES: yesWeight, NO: noWeight } = contract.dpmWeights || {
    YES: 0,
    NO: 0,
  } // only nesc for old contracts

  const newDpmWeights =
    outcome === 'YES'
      ? { YES: yesWeight + dpmWeight, NO: noWeight }
      : { YES: yesWeight, NO: noWeight + dpmWeight }

  const probBefore = yesPool ** 2 / (yesPool ** 2 + noPool ** 2)

  const probAverage =
    (amount +
      noPool * Math.atan(yesPool / noPool) -
      noPool * Math.atan((amount + yesPool) / noPool)) /
    amount

  const probAfter = newPool.YES ** 2 / (newPool.YES ** 2 + newPool.NO ** 2)

  const newBet: Bet = {
    id: newBetId,
    userId: user.id,
    contractId: contract.id,
    amount,
    dpmWeight,
    outcome,
    probBefore,
    probAverage,
    probAfter,
    createdTime: Date.now(),
  }

  const newBalance = user.balance - amount

  return { newBet, newPool, newDpmWeights, newBalance }
}
