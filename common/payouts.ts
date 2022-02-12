import * as _ from 'lodash'

import { Bet } from './bet'
import { deductFees, getProbability } from './calculate'
import { Contract, outcome } from './contract'
import { CREATOR_FEE, FEES } from './fees'

export const getCancelPayouts = (contract: Contract, bets: Bet[]) => {
  const { pool } = contract
  const poolTotal = pool.YES + pool.NO
  console.log('resolved N/A, pool M$', poolTotal)

  const betSum = _.sumBy(bets, (b) => b.amount)

  return bets.map((bet) => ({
    userId: bet.userId,
    payout: (bet.amount / betSum) * poolTotal,
  }))
}

export const getStandardPayouts = (
  outcome: 'YES' | 'NO',
  contract: Contract,
  bets: Bet[]
) => {
  const [yesBets, noBets] = _.partition(bets, (bet) => bet.outcome === 'YES')
  const winningBets = outcome === 'YES' ? yesBets : noBets

  const pool = contract.pool.YES + contract.pool.NO
  const totalShares = _.sumBy(winningBets, (b) => b.shares)

  const winnerPayouts = winningBets.map((bet) => {
    const winnings = (bet.shares / totalShares) * pool

    return {
      userId: bet.userId,
      amount: bet.amount,
      profit: winnings - bet.amount,
    }
  })

  const [profitable, unprofitable] = _.partition(
    winnerPayouts,
    (wp) => wp.profit >= 0
  )

  const totalProfits = _.sumBy(profitable, (wp) => wp.profit)
  const totalFees = FEES * totalProfits
  const deficit = _.sumBy(unprofitable, (wp) => -wp.profit)
  const adjTotalFees = deficit >= totalFees ? 0 : totalFees - deficit
  const creatorPayout = Math.min(adjTotalFees, CREATOR_FEE * totalProfits)

  const w = deficit > totalFees ? totalFees / deficit : 1

  const adjUnprofitable = unprofitable.map((wp) => {
    const adjustment = w * -wp.profit

    return {
      ...wp,
      profit: wp.profit + adjustment,
    }
  })

  console.log(
    'resolved',
    outcome,
    'pool',
    pool,
    'profits',
    totalProfits,
    'deficit',
    deficit,
    'creator fee',
    creatorPayout
  )

  return _.union(profitable, adjUnprofitable)
    .map(({ userId, amount, profit }) => ({
      userId,
      payout: amount + (1 - FEES) * profit,
    }))
    .concat([{ userId: contract.creatorId, payout: creatorPayout }]) // add creator fee
}

export const getMktPayouts = (
  contract: Contract,
  bets: Bet[],
  resolutionProbability?: number
) => {
  const p =
    resolutionProbability === undefined
      ? getProbability(contract.totalShares)
      : resolutionProbability

  const pool = contract.pool.YES + contract.pool.NO
  console.log('Resolved MKT at p=', p, 'pool: $M', pool)

  const [yesBets, noBets] = _.partition(bets, (bet) => bet.outcome === 'YES')

  const weightedShareTotal =
    p * _.sumBy(yesBets, (b) => b.shares) +
    (1 - p) * _.sumBy(noBets, (b) => b.shares)

  const yesPayouts = yesBets.map((bet) => ({
    userId: bet.userId,
    payout: deductFees(
      bet.amount,
      ((p * bet.shares) / weightedShareTotal) * pool
    ),
  }))

  const noPayouts = noBets.map((bet) => ({
    userId: bet.userId,
    payout: deductFees(
      bet.amount,
      (((1 - p) * bet.shares) / weightedShareTotal) * pool
    ),
  }))

  const creatorPayout = CREATOR_FEE * pool

  return [
    ...yesPayouts,
    ...noPayouts,
    { userId: contract.creatorId, payout: creatorPayout },
  ]
}

export const getPayouts = (
  outcome: outcome,
  contract: Contract,
  bets: Bet[],
  resolutionProbability?: number
) => {
  switch (outcome) {
    case 'YES':
    case 'NO':
      return getStandardPayouts(outcome, contract, bets)
    case 'MKT':
      return getMktPayouts(contract, bets, resolutionProbability)
    case 'CANCEL':
      return getCancelPayouts(contract, bets)
  }
}
