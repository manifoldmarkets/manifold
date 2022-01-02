import * as functions from 'firebase-functions'
import * as admin from 'firebase-admin'
import * as _ from 'lodash'

import { Contract } from './types/contract'
import { User } from './types/user'
import { Bet } from './types/bet'
import { getUser } from './utils'
import { sendMarketResolutionEmail } from './emails'

export const PLATFORM_FEE = 0.01 // 1%
export const CREATOR_FEE = 0.01 // 1%

export const resolveMarket = functions
  .runWith({ minInstances: 1 })
  .https.onCall(
    async (
      data: {
        outcome: 'YES' | 'NO' | 'CANCEL' | 'MKT'
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

      const creator = await getUser(contract.creatorId)
      if (!creator) return { status: 'error', message: 'Creator not found' }

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
      const openBets = bets.filter((b) => !b.isSold && !b.sale)

      const startPool = contract.startPool.YES + contract.startPool.NO
      const truePool = contract.pool.YES + contract.pool.NO - startPool

      const payouts =
        outcome === 'CANCEL'
          ? getCancelPayouts(truePool, openBets)
          : outcome === 'MKT'
          ? getMktPayouts(truePool, contract, openBets)
          : getStandardPayouts(outcome, truePool, contract, openBets)

      console.log('payouts:', payouts)

      const groups = _.groupBy(payouts, (payout) => payout.userId)
      const userPayouts = _.mapValues(groups, (group) =>
        _.sumBy(group, (g) => g.payout)
      )

      const payoutPromises = Object.entries(userPayouts).map(payUser)

      const result = await Promise.all(payoutPromises)
        .catch((e) => ({ status: 'error', message: e }))
        .then(() => ({ status: 'success' }))

      await sendResolutionEmails(
        openBets,
        userPayouts,
        creator,
        contract,
        outcome
      )

      return result
    }
  )

const sendResolutionEmails = async (
  openBets: Bet[],
  userPayouts: { [userId: string]: number },
  creator: User,
  contract: Contract,
  outcome: 'YES' | 'NO' | 'CANCEL' | 'MKT'
) => {
  const nonWinners = _.difference(
    _.uniq(openBets.map(({ userId }) => userId)),
    Object.keys(userPayouts)
  )
  const emailPayouts = [
    ...Object.entries(userPayouts),
    ...nonWinners.map((userId) => [userId, 0] as const),
  ]
  await Promise.all(
    emailPayouts.map(([userId, payout]) =>
      sendMarketResolutionEmail(userId, payout, creator, contract, outcome)
    )
  )
}

const firestore = admin.firestore()

const getCancelPayouts = (truePool: number, bets: Bet[]) => {
  console.log('resolved N/A, pool M$', truePool)

  const betSum = _.sumBy(bets, (b) => b.amount)

  return bets.map((bet) => ({
    userId: bet.userId,
    payout: (bet.amount / betSum) * truePool,
  }))
}

const getStandardPayouts = (
  outcome: string,
  truePool: number,
  contract: Contract,
  bets: Bet[]
) => {
  const [yesBets, noBets] = _.partition(bets, (bet) => bet.outcome === 'YES')
  const winningBets = outcome === 'YES' ? yesBets : noBets

  const betSum = _.sumBy(winningBets, (b) => b.amount)

  if (betSum >= truePool) return getCancelPayouts(truePool, winningBets)

  const creatorPayout = CREATOR_FEE * truePool
  console.log(
    'resolved',
    outcome,
    'pool: M$',
    truePool,
    'creator fee: M$',
    creatorPayout
  )

  const shareDifferenceSum = _.sumBy(winningBets, (b) => b.shares - b.amount)

  const winningsPool = truePool - betSum
  const fees = PLATFORM_FEE + CREATOR_FEE

  const winnerPayouts = winningBets.map((bet) => ({
    userId: bet.userId,
    payout:
      (1 - fees) *
      (bet.amount +
        ((bet.shares - bet.amount) / shareDifferenceSum) * winningsPool),
  }))

  return winnerPayouts.concat([
    { userId: contract.creatorId, payout: creatorPayout },
  ]) // add creator fee
}

const getMktPayouts = (truePool: number, contract: Contract, bets: Bet[]) => {
  const p =
    contract.pool.YES ** 2 / (contract.pool.YES ** 2 + contract.pool.NO ** 2)
  console.log('Resolved MKT at p=', p)

  return [
    ...getStandardPayouts('YES', p * truePool, contract, bets),
    ...getStandardPayouts('NO', (1 - p) * truePool, contract, bets),
  ]
}

const payUser = ([userId, payout]: [string, number]) => {
  return firestore.runTransaction(async (transaction) => {
    const userDoc = firestore.doc(`users/${userId}`)
    const userSnap = await transaction.get(userDoc)
    if (!userSnap.exists) return
    const user = userSnap.data() as User

    const newUserBalance = user.balance + payout
    transaction.update(userDoc, { balance: newUserBalance })
  })
}
