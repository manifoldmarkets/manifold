import * as _ from 'lodash'

import { Bet } from './bet'
import { getProbability } from './calculate'
import { deductFixedFees } from './calculate-fixed-payouts'
import { Binary, CPMM, FixedPayouts, FullContract } from './contract'
import { CREATOR_FEE } from './fees'

export const getFixedCancelPayouts = (bets: Bet[]) => {
  return bets.map((bet) => ({
    userId: bet.userId,
    payout: bet.amount,
  }))
}

export const getStandardFixedPayouts = (
  outcome: string,
  contract: FullContract<FixedPayouts, Binary>,
  bets: Bet[]
) => {
  const winningBets = bets.filter((bet) => bet.outcome === outcome)

  const payouts = winningBets.map(({ userId, amount, shares }) => {
    const winnings = shares
    const profit = winnings - amount
    const payout = deductFixedFees(amount, winnings)
    return { userId, profit, payout }
  })

  const profits = _.sumBy(payouts, (po) => Math.max(0, po.profit))
  const creatorPayout = CREATOR_FEE * profits

  console.log(
    'resolved',
    outcome,
    'pool',
    contract.pool,
    'profits',
    profits,
    'creator fee',
    creatorPayout
  )

  return payouts
    .map(({ userId, payout }) => ({ userId, payout }))
    .concat([{ userId: contract.creatorId, payout: creatorPayout }]) // add creator fee
    .concat(getLiquidityPoolPayouts(contract, outcome))
}

export const getLiquidityPoolPayouts = (
  contract: FullContract<CPMM, Binary>,
  outcome: string
) => {
  const { creatorId, pool } = contract
  return [{ userId: creatorId, payout: pool[outcome] }]
}

export const getMktFixedPayouts = (
  contract: FullContract<FixedPayouts, Binary>,
  bets: Bet[],
  resolutionProbability?: number
) => {
  const p =
    resolutionProbability === undefined
      ? getProbability(contract)
      : resolutionProbability

  const payouts = bets.map(({ userId, outcome, amount, shares }) => {
    const betP = outcome === 'YES' ? p : 1 - p
    const winnings = betP * shares
    const profit = winnings - amount
    const payout = deductFixedFees(amount, winnings)
    return { userId, profit, payout }
  })

  const profits = _.sumBy(payouts, (po) => Math.max(0, po.profit))
  const creatorPayout = CREATOR_FEE * profits

  console.log(
    'resolved MKT',
    p,
    'pool',
    contract.pool,
    'profits',
    profits,
    'creator fee',
    creatorPayout
  )

  return payouts
    .map(({ userId, payout }) => ({ userId, payout }))
    .concat([{ userId: contract.creatorId, payout: creatorPayout }]) // add creator fee
    .concat(getLiquidityPoolProbPayouts(contract, p))
}

export const getLiquidityPoolProbPayouts = (
  contract: FullContract<CPMM, Binary>,
  p: number
) => {
  const { creatorId, pool } = contract
  const payout = p * pool.YES + (1 - p) * pool.NO
  return [{ userId: creatorId, payout }]
}
