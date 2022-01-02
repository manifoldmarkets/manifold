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

const getSellBetInfo = (
  user: User,
  bet: Bet,
  contract: Contract,
  newBetId: string
) => {
  const { id: betId, amount, shares, outcome } = bet

  const { YES: yesPool, NO: noPool } = contract.pool
  const { YES: yesStart, NO: noStart } = contract.startPool
  const { YES: yesShares, NO: noShares } = contract.totalShares
  const { YES: yesBets, NO: noBets } = contract.totalBets

  const [y, n, s] = [yesPool, noPool, shares]

  const shareValue =
    outcome === 'YES'
      ? // https://www.wolframalpha.com/input/?i=b+%2B+%28b+n%5E2%29%2F%28y+%28-b+%2B+y%29%29+%3D+c+solve+b
        (n ** 2 +
          s * y +
          y ** 2 -
          Math.sqrt(
            n ** 4 + (s - y) ** 2 * y ** 2 + 2 * n ** 2 * y * (s + y)
          )) /
        (2 * y)
      : (y ** 2 +
          s * n +
          n ** 2 -
          Math.sqrt(
            y ** 4 + (s - n) ** 2 * n ** 2 + 2 * y ** 2 * n * (s + n)
          )) /
        (2 * n)

  const startPool = yesStart + noStart
  const pool = yesPool + noPool - startPool

  const probBefore = yesPool ** 2 / (yesPool ** 2 + noPool ** 2)

  const f = pool / (probBefore * yesShares + (1 - probBefore) * noShares)

  const myPool = outcome === 'YES' ? yesPool - yesStart : noPool - noStart

  const adjShareValue = Math.min(Math.min(1, f) * shareValue, myPool)

  const newPool =
    outcome === 'YES'
      ? { YES: yesPool - adjShareValue, NO: noPool }
      : { YES: yesPool, NO: noPool - adjShareValue }

  const newTotalShares =
    outcome === 'YES'
      ? { YES: yesShares - shares, NO: noShares }
      : { YES: yesShares, NO: noShares - shares }

  const newTotalBets =
    outcome === 'YES'
      ? { YES: yesBets - amount, NO: noBets }
      : { YES: yesBets, NO: noBets - amount }

  const probAfter = newPool.YES ** 2 / (newPool.YES ** 2 + newPool.NO ** 2)

  const creatorFee = CREATOR_FEE * adjShareValue
  const saleAmount = (1 - CREATOR_FEE - PLATFORM_FEE) * adjShareValue

  console.log(
    'SELL M$',
    amount,
    outcome,
    'for M$',
    saleAmount,
    'M$/share:',
    f,
    'creator fee: M$',
    creatorFee
  )

  const newBet: Bet = {
    id: newBetId,
    userId: user.id,
    contractId: contract.id,
    amount: -adjShareValue,
    shares: -shares,
    outcome,
    probBefore,
    probAfter,
    createdTime: Date.now(),
    sale: {
      amount: saleAmount,
      betId,
    },
  }

  const newBalance = user.balance + saleAmount

  return {
    newBet,
    newPool,
    newTotalShares,
    newTotalBets,
    newBalance,
    creatorFee,
  }
}
