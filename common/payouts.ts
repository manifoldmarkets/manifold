import * as _ from 'lodash'

import { Bet } from './bet'
import { deductFees, getProbability } from './calculate'
import { Contract } from './contract'
import { CREATOR_FEE, FEES } from './fees'

export const getCancelPayouts = (contract: Contract, bets: Bet[]) => {
  const { pool } = contract
  const poolTotal = _.sum(Object.values(pool))
  console.log('resolved N/A, pool M$', poolTotal)

  const betSum = _.sumBy(bets, (b) => b.amount)

  return bets.map((bet) => ({
    userId: bet.userId,
    payout: (bet.amount / betSum) * poolTotal,
  }))
}

export const getStandardPayouts = (
  outcome: string,
  contract: Contract,
  bets: Bet[]
) => {
  const winningBets = bets.filter((bet) => bet.outcome === outcome)

  const poolTotal = _.sum(Object.values(contract.pool))
  const totalShares = _.sumBy(winningBets, (b) => b.shares)

  const payouts = winningBets.map(({ userId, amount, shares }) => {
    const winnings = (shares / totalShares) * poolTotal
    const profit = winnings - amount

    // profit can be negative if using phantom shares
    const payout = amount + (1 - FEES) * Math.max(0, profit)
    return { userId, profit, payout }
  })

  const profits = _.sumBy(payouts, (po) => Math.max(0, po.profit))
  const creatorPayout = CREATOR_FEE * profits

  console.log(
    'resolved',
    outcome,
    'pool',
    poolTotal,
    'profits',
    profits,
    'creator fee',
    creatorPayout
  )

  return payouts
    .map(({ userId, payout }) => ({ userId, payout }))
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

  const weightedShareTotal = _.sumBy(bets, (b) =>
    b.outcome === 'YES' ? p * b.shares : (1 - p) * b.shares
  )

  const pool = contract.pool.YES + contract.pool.NO

  const payouts = bets.map(({ userId, outcome, amount, shares }) => {
    const betP = outcome === 'YES' ? p : 1 - p
    const winnings = ((betP * shares) / weightedShareTotal) * pool
    const profit = winnings - amount
    const payout = deductFees(amount, winnings)
    return { userId, profit, payout }
  })

  const profits = _.sumBy(payouts, (po) => Math.max(0, po.profit))
  const creatorPayout = CREATOR_FEE * profits

  console.log(
    'resolved MKT',
    p,
    'pool',
    pool,
    'profits',
    profits,
    'creator fee',
    creatorPayout
  )

  return payouts
    .map(({ userId, payout }) => ({ userId, payout }))
    .concat([{ userId: contract.creatorId, payout: creatorPayout }]) // add creator fee
}

export const getPayouts = (
  outcome: string,
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
    default:
      // Multi outcome.
      return getStandardPayouts(outcome, contract, bets)
  }
}

export const getPayoutsMultiOutcome = (
  resolutions: { [outcome: string]: number },
  contract: Contract,
  bets: Bet[]
) => {
  const poolTotal = _.sum(Object.values(contract.pool))
  const winningBets = bets.filter((bet) => resolutions[bet.outcome])

  const betsByOutcome = _.groupBy(winningBets, (bet) => bet.outcome)
  const sharesByOutcome = _.mapValues(betsByOutcome, (bets) =>
    _.sumBy(bets, (bet) => bet.shares)
  )

  const probTotal = _.sum(Object.values(resolutions))

  const payouts = winningBets.map(({ userId, outcome, amount, shares }) => {
    const prob = resolutions[outcome] / probTotal
    const winnings = (shares / sharesByOutcome[outcome]) * prob * poolTotal
    const profit = winnings - amount

    const payout = amount + (1 - FEES) * Math.max(0, profit)
    return { userId, profit, payout }
  })

  const profits = _.sumBy(payouts, (po) => po.profit)
  const creatorPayout = CREATOR_FEE * profits

  console.log(
    'resolved',
    resolutions,
    'pool',
    poolTotal,
    'profits',
    profits,
    'creator fee',
    creatorPayout
  )

  return payouts
    .map(({ userId, payout }) => ({ userId, payout }))
    .concat([{ userId: contract.creatorId, payout: creatorPayout }]) // add creator fee
}
