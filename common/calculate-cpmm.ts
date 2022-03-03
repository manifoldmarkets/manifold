import * as _ from 'lodash'
import { Bet } from './bet'
import { deductFixedFees } from './calculate-fixed-payouts'
import { Binary, CPMM, FullContract } from './contract'
import { CREATOR_FEE } from './fees'

export function getCpmmProbability(pool: { [outcome: string]: number }) {
  // For binary contracts only.
  const { YES, NO } = pool
  return NO / (YES + NO)
}

export function getCpmmOutcomeProbabilityAfterBet(
  contract: FullContract<CPMM, Binary>,
  outcome: string,
  bet: number
) {
  const { newPool } = calculateCpmmPurchase(contract, bet, outcome)
  const p = getCpmmProbability(newPool)
  return outcome === 'NO' ? 1 - p : p
}

export function calculateCpmmShares(
  pool: {
    [outcome: string]: number
  },
  k: number,
  bet: number,
  betChoice: string
) {
  const { YES: y, NO: n } = pool
  const numerator = bet ** 2 + bet * (y + n) - k + y * n
  const denominator = betChoice === 'YES' ? bet + n : bet + y
  const shares = numerator / denominator
  return shares
}

export function calculateCpmmPurchase(
  contract: FullContract<CPMM, Binary>,
  bet: number,
  outcome: string
) {
  const { pool, k } = contract

  const shares = calculateCpmmShares(pool, k, bet, outcome)
  const { YES: y, NO: n } = pool

  const [newY, newN] =
    outcome === 'YES'
      ? [y - shares + bet, n + bet]
      : [y + bet, n - shares + bet]

  const newPool = { YES: newY, NO: newN }

  return { shares, newPool }
}

export function calculateCpmmShareValue(
  contract: FullContract<CPMM, Binary>,
  shares: number,
  outcome: string
) {
  const { pool, k } = contract
  const { YES: y, NO: n } = pool

  const poolChange = outcome === 'YES' ? shares + y - n : shares + n - y

  const shareValue = 0.5 * (shares + y + n - Math.sqrt(4 * k + poolChange ** 2))
  return shareValue
}

export function calculateCpmmSale(
  contract: FullContract<CPMM, Binary>,
  bet: Bet
) {
  const { shares, outcome } = bet

  const saleValue = calculateCpmmShareValue(contract, shares, outcome)

  const { pool } = contract
  const { YES: y, NO: n } = pool

  const [newY, newN] =
    outcome === 'YES'
      ? [y + shares - saleValue, n - saleValue]
      : [y - saleValue, n + shares - saleValue]

  const newPool = { YES: newY, NO: newN }

  const profit = saleValue - bet.amount
  const creatorFee = CREATOR_FEE * Math.max(0, profit)
  const saleAmount = deductFixedFees(bet.amount, saleValue)

  return { saleValue, newPool, creatorFee, saleAmount }
}

export function getCpmmProbabilityAfterSale(
  contract: FullContract<CPMM, Binary>,
  bet: Bet
) {
  const { newPool } = calculateCpmmSale(contract, bet)
  return getCpmmProbability(newPool)
}
