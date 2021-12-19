import * as admin from 'firebase-admin'
import * as functions from 'firebase-functions'

import { CREATOR_FEE, PLATFORM_FEE } from './resolve-market'
import { Bet } from './types/bet'
import { Contract } from './types/contract'
import { User } from './types/user'

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

      const betDoc = firestore.doc(`contracts/${contractId}/bets/${betId}`)
      const betSnap = await transaction.get(betDoc)
      if (!betSnap.exists)
        return { status: 'error', message: 'Invalid bet' }
      const bet = betSnap.data() as Bet

      if (bet.isSold)
        return { status: 'error', message: 'Bet already sold' }

      const newBetDoc = firestore
        .collection(`contracts/${contractId}/bets`)
        .doc()

      const { newBet, newPool, newDpmWeights, newBalance, creatorFee } = getSellBetInfo(
        user,
        bet,
        contract,
        newBetDoc.id
      )

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
        dpmWeights: newDpmWeights,
      })
      transaction.update(userDoc, { balance: newBalance })

      return { status: 'success' }
    })
  }
)

const firestore = admin.firestore()

const getSellBetInfo = (
  user: User,
  bet: Bet,
  contract: Contract,
  newBetId: string
) => {
  const { id: betId, amount, dpmWeight, outcome } = bet

  const { YES: yesPool, NO: noPool } = contract.pool
  const { YES: yesWeights, NO: noWeights } = contract.dpmWeights

  // average implied probability after selling bet position
  const p = outcome === 'YES'
    ? (amount +
      noPool * Math.atan((yesPool - amount) / noPool) -
      noPool * Math.atan(yesPool / noPool)) /
    amount

    : yesPool * (Math.atan((amount - noPool) / yesPool) + Math.atan(noPool / yesPool)) /
    amount


  const [sellYesAmount, sellNoAmount] = outcome === 'YES'
    ? [
      p * amount,
      p * dpmWeight / yesWeights * noPool,
    ]
    : [
      p * dpmWeight / noWeights * yesPool,
      p * amount,
    ]

  const newPool = { YES: yesPool - sellYesAmount, NO: noPool - sellNoAmount }

  const newDpmWeights =
    outcome === 'YES'
      ? { YES: yesWeights - dpmWeight, NO: noWeights }
      : { YES: yesWeights, NO: noWeights - dpmWeight }

  const probBefore = yesPool ** 2 / (yesPool ** 2 + noPool ** 2)
  const probAverage = p
  const probAfter = newPool.YES ** 2 / (newPool.YES ** 2 + newPool.NO ** 2)

  const keep = 1 - CREATOR_FEE - PLATFORM_FEE

  const [saleAmount, creatorFee] = outcome === 'YES'
    ? [{ YES: sellYesAmount, NO: keep * sellNoAmount }, CREATOR_FEE * sellNoAmount]
    : [{ YES: keep * sellYesAmount, NO: sellNoAmount }, CREATOR_FEE * sellYesAmount]

  console.log('SELL M$', amount, outcome, 'at', p, 'prob', 'for M$', saleAmount.YES + saleAmount.NO, 'creator fee: M$', creatorFee)

  const newBet: Bet = {
    id: newBetId,
    userId: user.id,
    contractId: contract.id,
    amount: -amount,
    dpmWeight: -dpmWeight,
    outcome,
    probBefore,
    probAverage,
    probAfter,
    createdTime: Date.now(),
    sale: {
      amount: saleAmount,
      betId
    }
  }

  const newBalance = user.balance + sellYesAmount + sellNoAmount

  return { newBet, newPool, newDpmWeights, newBalance, creatorFee }
}
