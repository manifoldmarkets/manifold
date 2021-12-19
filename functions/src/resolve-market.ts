import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import * as _ from 'lodash'

import { Contract } from './types/contract'
import { User } from './types/user'
import { Bet } from './types/bet'

export const PLATFORM_FEE = 0.01 // 1%
export const CREATOR_FEE = 0.01 // 1%

export const resolveMarket = functions
  .runWith({ minInstances: 1 })
  .https.onCall(
    async (
      data: {
        outcome: string
        contractId: string
      },
      context
    ) => {
      const userId = context?.auth?.uid
      if (!userId) return { status: 'error', message: 'Not authorized' }

      const { outcome, contractId } = data

      if (!['YES', 'NO', 'CANCEL'].includes(outcome))
        return { status: 'error', message: 'Invalid outcome' }

      const contractDoc = firestore.doc(`contracts/${contractId}`)
      const contractSnap = await contractDoc.get()
      if (!contractSnap.exists)
        return { status: 'error', message: 'Invalid contract' }
      const contract = contractSnap.data() as Contract

      if (contract.creatorId !== userId)
        return { status: 'error', message: 'User not creator of contract' }

      if (contract.resolution)
        return { status: 'error', message: 'Contract already resolved' }

      await contractDoc.update({
        isResolved: true,
        resolution: outcome,
        resolutionTime: Date.now(),
      })

      console.log('contract ', contractId, 'resolved to:', outcome)

      const betsSnap = await firestore
        .collection(`contracts/${contractId}/bets`)
        .get()
      const bets = betsSnap.docs.map((doc) => doc.data() as Bet)

      const payouts =
        outcome === 'CANCEL'
          ? bets.map((bet) => ({
              userId: bet.userId,
              payout: bet.amount,
            }))
          : getPayouts(outcome, contract, bets)

      console.log('payouts:', payouts)

      const groups = _.groupBy(payouts, (payout) => payout.userId)
      const userPayouts = _.mapValues(groups, (group) =>
        _.sumBy(group, (g) => g.payout)
      )

      const payoutPromises = Object.entries(userPayouts).map(payUser)

      return await Promise.all(payoutPromises)
        .catch((e) => ({ status: 'error', message: e }))
        .then(() => ({ status: 'success' }))
    }
  )

const firestore = admin.firestore()

const getPayouts = (outcome: string, contract: Contract, bets: Bet[]) => {
  const [yesBets, noBets] = _.partition(bets, (bet) => bet.outcome === 'YES')

  const [pool, winningBets] =
    outcome === 'YES'
      ? [contract.pool.NO - contract.startPool.NO, yesBets]
      : [contract.pool.YES - contract.startPool.YES, noBets]

  const finalPool = (1 - PLATFORM_FEE - CREATOR_FEE) * pool
  const creatorPayout = CREATOR_FEE * pool
  console.log('final pool:', finalPool, 'creator fee:', creatorPayout)

  const sumWeights = _.sumBy(winningBets, (bet) => bet.dpmWeight)

  const winnerPayouts = winningBets.map((bet) => ({
    userId: bet.userId,
    payout: bet.amount + (bet.dpmWeight / sumWeights) * finalPool,
  }))

  return winnerPayouts.concat([
    { userId: contract.creatorId, payout: creatorPayout },
  ]) // add creator fee
}

export const payUser = ([userId, payout]: [string, number]) => {
  return firestore.runTransaction(async (transaction) => {
    const userDoc = firestore.doc(`users/${userId}`)
    const userSnap = await transaction.get(userDoc)
    if (!userSnap.exists) return
    const user = userSnap.data() as User

    const newUserBalance = user.balance + payout
    transaction.update(userDoc, { balance: newUserBalance })
  })
}
