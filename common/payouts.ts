import * as _ from 'lodash'

import { Bet } from './bet'
import { deductFees, getProbability } from './calculate'
import { Contract, outcome } from './contract'
import { CREATOR_FEE } from './fees'

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

  const winnerPayouts = winningBets.map((bet) => ({
    userId: bet.userId,
    payout: deductFees(bet.amount, (bet.shares / totalShares) * pool),
  }))

  const creatorPayout = CREATOR_FEE * pool

  console.log(
    'resolved',
    outcome,
    'pool: M$',
    pool,
    'creator fee: M$',
    creatorPayout
  )

  return winnerPayouts.concat([
    { userId: contract.creatorId, payout: creatorPayout },
  ]) // add creator fee
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
