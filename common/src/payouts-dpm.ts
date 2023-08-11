import { sum, groupBy, sumBy, mapValues } from 'lodash'

import { Bet } from './bet'
import { DPMContract, StillOpenDPMContract } from './contract'
import { DPM_CREATOR_FEE, DPM_FEES, DPM_PLATFORM_FEE } from './fees'
import { addObjects } from './util/object'

export const getDpmCancelPayouts = (contract: DPMContract, bets: Bet[]) => {
  const { pool } = contract
  const poolTotal = sum(Object.values(pool))

  const betSum = sumBy(bets, (b) => b.amount)

  const payouts = bets.map((bet) => ({
    userId: bet.userId,
    payout: (bet.amount / betSum) * poolTotal,
  }))

  return {
    payouts,
    creatorPayout: 0,
    liquidityPayouts: [],
    collectedFees: contract.collectedFees,
  }
}

export const getDpmStandardPayouts = (
  outcome: string,
  contract: DPMContract,
  bets: Bet[]
) => {
  const winningBets = bets.filter((bet) => bet.outcome === outcome)

  const poolTotal = sum(Object.values(contract.pool))
  const totalShares = sumBy(winningBets, (b) => b.shares)

  const payouts = winningBets.map(({ userId, amount, shares }) => {
    const winnings = (shares / totalShares) * poolTotal
    const profit = winnings - amount

    // profit can be negative if using phantom shares
    const payout = amount + (1 - DPM_FEES) * Math.max(0, profit)
    return { userId, profit, payout }
  })

  const profits = sumBy(payouts, (po) => Math.max(0, po.profit))
  const creatorFee = DPM_CREATOR_FEE * profits
  const platformFee = DPM_PLATFORM_FEE * profits
  const collectedFees = addObjects(contract.collectedFees, {
    creatorFee,
    platformFee,
    liquidityFee: 0,
  })

  return {
    payouts: payouts.map(({ userId, payout }) => ({ userId, payout })),
    creatorPayout: creatorFee,
    liquidityPayouts: [],
    collectedFees,
  }
}

export const getPayoutsMultiOutcome = (
  resolutions: { [outcome: string]: number },
  contract: StillOpenDPMContract,
  bets: Bet[]
) => {
  const poolTotal = sum(Object.values(contract.pool))
  const winningBets = bets.filter((bet) => resolutions[bet.outcome])

  const betsByOutcome = groupBy(winningBets, (bet) => bet.outcome)
  const sharesByOutcome = mapValues(betsByOutcome, (bets) =>
    sumBy(bets, (bet) => bet.shares)
  )

  const probTotal = sum(Object.values(resolutions))

  const payouts = winningBets.map(({ userId, outcome, amount, shares }) => {
    const prob = resolutions[outcome] / probTotal
    const winnings = (shares / sharesByOutcome[outcome]) * prob * poolTotal
    const profit = winnings - amount

    const payout = amount + (1 - DPM_FEES) * profit
    return { userId, profit, payout }
  })

  const profits = sumBy(payouts, (po) => po.profit)

  const creatorFee = DPM_CREATOR_FEE * profits
  const platformFee = DPM_PLATFORM_FEE * profits
  const collectedFees = addObjects(contract.collectedFees, {
    creatorFee,
    platformFee,
    liquidityFee: 0,
  })

  return {
    payouts: payouts.map(({ userId, payout }) => ({ userId, payout })),
    creatorPayout: creatorFee,
    liquidityPayouts: [],
    collectedFees,
  }
}
