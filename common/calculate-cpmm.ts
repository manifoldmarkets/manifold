import * as _ from 'lodash'

import { Bet } from './bet'
import { Binary, CPMM, FullContract } from './contract'
import { CREATOR_FEE, Fees, LIQUIDITY_FEE, PLATFORM_FEE } from './fees'

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

// before liquidity fee
function calculateCpmmShares(
  pool: {
    [outcome: string]: number
  },
  bet: number,
  betChoice: string
) {
  const { YES: y, NO: n } = pool
  const numerator = bet ** 2 + bet * (y + n)
  const denominator = betChoice === 'YES' ? bet + n : bet + y
  const shares = numerator / denominator
  return shares
}

export function getCpmmLiquidityFee(
  contract: FullContract<CPMM, Binary>,
  bet: number,
  outcome: string
) {
  const p = getCpmmProbability(contract.pool)
  const betP = outcome === 'YES' ? 1 - p : p

  const liquidityFee = LIQUIDITY_FEE * betP * bet
  const platformFee = PLATFORM_FEE * betP * bet
  const creatorFee = CREATOR_FEE * betP * bet
  const fees: Fees = { liquidityFee, platformFee, creatorFee }

  const totalFees = liquidityFee + platformFee + creatorFee
  const remainingBet = bet - totalFees

  return { remainingBet, fees }
}

export function calculateCpmmSharesAfterFee(
  contract: FullContract<CPMM, Binary>,
  bet: number,
  outcome: string
) {
  const { pool } = contract
  const { remainingBet } = getCpmmLiquidityFee(contract, bet, outcome)

  return calculateCpmmShares(pool, remainingBet, outcome)
}

export function calculateCpmmPurchase(
  contract: FullContract<CPMM, Binary>,
  bet: number,
  outcome: string
) {
  const { pool } = contract
  const { remainingBet, fees } = getCpmmLiquidityFee(contract, bet, outcome)

  const shares = calculateCpmmShares(pool, remainingBet, outcome)
  const { YES: y, NO: n } = pool

  const [newY, newN] =
    outcome === 'YES'
      ? [y - shares + bet, n + bet]
      : [y + bet, n - shares + bet]

  const newPool = { YES: newY, NO: newN }

  return { shares, newPool, fees }
}

export function calculateCpmmShareValue(
  contract: FullContract<CPMM, Binary>,
  shares: number,
  outcome: string
) {
  const { pool } = contract
  const { YES: y, NO: n } = pool

  const poolChange = outcome === 'YES' ? shares + y - n : shares + n - y
  const k = y * n
  const shareValue = 0.5 * (shares + y + n - Math.sqrt(4 * k + poolChange ** 2))
  return shareValue
}

export function calculateCpmmSale(
  contract: FullContract<CPMM, Binary>,
  bet: Bet
) {
  const { shares, outcome } = bet

  const rawSaleValue = calculateCpmmShareValue(contract, shares, outcome)

  const { fees, remainingBet: saleValue } = getCpmmLiquidityFee(
    contract,
    rawSaleValue,
    outcome === 'YES' ? 'NO' : 'YES'
  )

  const { pool } = contract
  const { YES: y, NO: n } = pool

  const { liquidityFee: fee } = fees

  const [newY, newN] =
    outcome === 'YES'
      ? [y + shares - saleValue + fee, n - saleValue + fee]
      : [y - saleValue + fee, n + shares - saleValue + fee]

  const newPool = { YES: newY, NO: newN }

  return { saleValue, newPool, fees }
}

export function getCpmmProbabilityAfterSale(
  contract: FullContract<CPMM, Binary>,
  bet: Bet
) {
  const { newPool } = calculateCpmmSale(contract, bet)
  return getCpmmProbability(newPool)
}

export const calcCpmmInitialPool = (initialProbInt: number, ante: number) => {
  const p = initialProbInt / 100.0

  const [poolYes, poolNo] =
    p >= 0.5 ? [ante * (1 / p - 1), ante] : [ante, ante * (1 / (1 - p) - 1)]

  return { poolYes, poolNo }
}

export function getCpmmLiquidity(pool: { [outcome: string]: number }) {
  // For binary contracts only.
  const { YES, NO } = pool
  return Math.sqrt(YES * NO)
}

export function addCpmmLiquidity(
  contract: FullContract<CPMM, Binary>,
  amount: number
) {
  const { YES, NO } = contract.pool
  const p = getCpmmProbability({ YES, NO })

  const [newYes, newNo] =
    p >= 0.5
      ? [amount * (1 / p - 1), amount]
      : [amount, amount * (1 / (1 - p) - 1)]

  const betAmount = Math.abs(newYes - newNo)
  const betOutcome = p >= 0.5 ? 'YES' : 'NO'

  const poolLiquidity = getCpmmLiquidity({ YES, NO })
  const newPool = { YES: YES + newYes, NO: NO + newNo }
  const resultingLiquidity = getCpmmLiquidity(newPool)
  const liquidity = resultingLiquidity - poolLiquidity

  return { newPool, liquidity, betAmount, betOutcome }
}

export function removeCpmmLiquidity(
  contract: FullContract<CPMM, Binary>,
  liquidity: number
) {
  const { YES, NO } = contract.pool
  const poolLiquidity = getCpmmLiquidity({ YES, NO })
  const p = getCpmmProbability({ YES, NO })

  const f = liquidity / poolLiquidity
  const [payoutYes, payoutNo] = [f * YES, f * NO]

  const betAmount = Math.abs(payoutYes - payoutNo)
  const betOutcome = p >= 0.5 ? 'NO' : 'YES' // opposite side as adding liquidity
  const payout = Math.min(payoutYes, payoutNo)

  const newPool = { YES: YES - payoutYes, NO: NO - payoutNo }

  return { newPool, payout, betAmount, betOutcome }
}
