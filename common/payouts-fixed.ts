import * as _ from 'lodash'

import { Bet } from './bet'
import { getProbability } from './calculate'
import { Binary, CPMM, FixedPayouts, FullContract } from './contract'
import { LiquidityProvision } from './liquidity-provision'

export const getFixedCancelPayouts = (
  bets: Bet[],
  liquidities: LiquidityProvision[]
) => {
  const liquidityPayouts = liquidities.map((lp) => ({
    userId: lp.userId,
    payout: lp.amount,
  }))

  return bets
    .filter((b) => !b.isAnte && !b.isLiquidityProvision)
    .map((bet) => ({
      userId: bet.userId,
      payout: bet.amount,
    }))
    .concat(liquidityPayouts)
}

export const getStandardFixedPayouts = (
  outcome: string,
  contract: FullContract<FixedPayouts, Binary>,
  bets: Bet[],
  liquidities: LiquidityProvision[]
) => {
  const winningBets = bets.filter((bet) => bet.outcome === outcome)

  const payouts = winningBets.map(({ userId, shares }) => ({
    userId,
    payout: shares,
  }))

  const creatorPayout = contract.collectedFees.creatorFee

  console.log(
    'resolved',
    outcome,
    'pool',
    contract.pool[outcome],
    'payouts',
    _.sum(payouts),
    'creator fee',
    creatorPayout
  )

  return payouts
    .map(({ userId, payout }) => ({ userId, payout }))
    .concat([{ userId: contract.creatorId, payout: creatorPayout }]) // add creator fee
    .concat(getLiquidityPoolPayouts(contract, outcome, liquidities))
}

export const getLiquidityPoolPayouts = (
  contract: FullContract<CPMM, Binary>,
  outcome: string,
  liquidities: LiquidityProvision[]
) => {
  const providedLiquidity = _.sumBy(liquidities, (lp) => lp.liquidity)

  const { pool } = contract
  const finalPool = pool[outcome]

  return liquidities.map((lp) => ({
    userId: lp.userId,
    payout: (lp.liquidity / providedLiquidity) * finalPool,
  }))
}

export const getMktFixedPayouts = (
  contract: FullContract<FixedPayouts, Binary>,
  bets: Bet[],
  liquidities: LiquidityProvision[],
  resolutionProbability?: number
) => {
  const p =
    resolutionProbability === undefined
      ? getProbability(contract)
      : resolutionProbability

  const payouts = bets.map(({ userId, outcome, shares }) => {
    const betP = outcome === 'YES' ? p : 1 - p
    return { userId, payout: betP * shares }
  })

  const creatorPayout = contract.collectedFees.creatorFee

  console.log(
    'resolved PROB',
    p,
    'pool',
    p * contract.pool.YES + (1 - p) * contract.pool.NO,
    'payouts',
    _.sum(payouts),
    'creator fee',
    creatorPayout
  )

  return payouts
    .map(({ userId, payout }) => ({ userId, payout }))
    .concat([{ userId: contract.creatorId, payout: creatorPayout }]) // add creator fee
    .concat(getLiquidityPoolProbPayouts(contract, p, liquidities))
}

export const getLiquidityPoolProbPayouts = (
  contract: FullContract<CPMM, Binary>,
  p: number,
  liquidities: LiquidityProvision[]
) => {
  const providedLiquidity = _.sumBy(liquidities, (lp) => lp.liquidity)

  const { pool } = contract
  const finalPool = p * pool.YES + (1 - p) * pool.NO

  return liquidities.map((lp) => ({
    userId: lp.userId,
    payout: (lp.liquidity / providedLiquidity) * finalPool,
  }))
}
