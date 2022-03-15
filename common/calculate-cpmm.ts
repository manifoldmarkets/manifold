import * as _ from 'lodash'

import { Bet } from './bet'
import { Binary, CPMM, FullContract } from './contract'
import { CREATOR_FEE, Fees, LIQUIDITY_FEE, noFees, PLATFORM_FEE } from './fees'

export function getCpmmProbability(
  pool: { [outcome: string]: number },
  p: number
) {
  const { YES, NO } = pool
  return (p * NO) / ((1 - p) * YES + p * NO)
}

export function getCpmmProbabilityAfterBetBeforeFees(
  contract: FullContract<CPMM, Binary>,
  outcome: string,
  bet: number
) {
  const { pool, p } = contract
  const shares = calculateCpmmShares(pool, p, bet, outcome)
  const { YES: y, NO: n } = pool

  const [newY, newN] =
    outcome === 'YES'
      ? [y - shares + bet, n + bet]
      : [y + bet, n - shares + bet]

  return getCpmmProbability({ YES: newY, NO: newN }, p)
}

export function getCpmmOutcomeProbabilityAfterBet(
  contract: FullContract<CPMM, Binary>,
  outcome: string,
  bet: number
) {
  const { newPool } = calculateCpmmPurchase(contract, bet, outcome)
  const p = getCpmmProbability(newPool, contract.p)
  return outcome === 'NO' ? 1 - p : p
}

// before liquidity fee
function calculateCpmmShares(
  pool: {
    [outcome: string]: number
  },
  p: number,
  bet: number,
  betChoice: string
) {
  const { YES: y, NO: n } = pool
  const k = y ** p * n ** (1 - p)

  return betChoice === 'YES'
    ? // https://www.wolframalpha.com/input?i=%28y%2Bb-s%29%5E%28p%29*%28n%2Bb%29%5E%281-p%29+%3D+k%2C+solve+s
      y + bet - (k * (bet + n) ** (p - 1)) ** (1 / p)
    : n + bet - (k * (bet + y) ** -p) ** (1 / (1 - p))
}

export function getCpmmLiquidityFee(
  contract: FullContract<CPMM, Binary>,
  bet: number,
  outcome: string
) {
  const prob = getCpmmProbabilityAfterBetBeforeFees(contract, outcome, bet)
  const betP = outcome === 'YES' ? 1 - prob : prob

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
  const { pool, p } = contract
  const { remainingBet } = getCpmmLiquidityFee(contract, bet, outcome)

  return calculateCpmmShares(pool, p, remainingBet, outcome)
}

export function calculateCpmmPurchase(
  contract: FullContract<CPMM, Binary>,
  bet: number,
  outcome: string
) {
  const { pool, p } = contract
  const { remainingBet, fees } = getCpmmLiquidityFee(contract, bet, outcome)
  // const remainingBet = bet
  // const fees = noFees

  const shares = calculateCpmmShares(pool, p, remainingBet, outcome)
  const { YES: y, NO: n } = pool

  const { liquidityFee: fee } = fees

  const [newY, newN] =
    outcome === 'YES'
      ? [y - shares + remainingBet + fee, n + remainingBet + fee]
      : [y + remainingBet + fee, n - shares + remainingBet + fee]

  const postBetPool = { YES: newY, NO: newN }

  const { newPool, newP } = addCpmmLiquidity(postBetPool, p, fee)

  return { shares, newPool, newP, fees }
}

export function calculateCpmmShareValue(
  contract: FullContract<CPMM, Binary>,
  shares: number,
  outcome: string
) {
  const { pool } = contract
  const { YES: y, NO: n } = pool

  // TODO: calculate using new function
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
  return getCpmmProbability(newPool, contract.p)
}

export function getCpmmLiquidity(
  pool: { [outcome: string]: number },
  p: number
) {
  const { YES, NO } = pool
  return YES ** p * NO ** (1 - p)
}

export function addCpmmLiquidity(
  pool: { [outcome: string]: number },
  p: number,
  amount: number
) {
  const prob = getCpmmProbability(pool, p)

  //https://www.wolframalpha.com/input?i=p%28n%2Bb%29%2F%28%281-p%29%28y%2Bb%29%2Bp%28n%2Bb%29%29%3Dq%2C+solve+p
  const { YES: y, NO: n } = pool
  const numerator = prob * (amount + y)
  const denominator = amount - n * (prob - 1) + prob * y
  const newP = numerator / denominator

  const newPool = { YES: y + amount, NO: n + amount }

  const oldLiquidity = getCpmmLiquidity(pool, newP)
  const newLiquidity = getCpmmLiquidity(newPool, newP)
  const liquidity = newLiquidity - oldLiquidity

  return { newPool, liquidity, newP }
}

// export function removeCpmmLiquidity(
//   contract: FullContract<CPMM, Binary>,
//   liquidity: number
// ) {
//   const { YES, NO } = contract.pool
//   const poolLiquidity = getCpmmLiquidity({ YES, NO })
//   const p = getCpmmProbability({ YES, NO }, contract.p)

//   const f = liquidity / poolLiquidity
//   const [payoutYes, payoutNo] = [f * YES, f * NO]

//   const betAmount = Math.abs(payoutYes - payoutNo)
//   const betOutcome = p >= 0.5 ? 'NO' : 'YES' // opposite side as adding liquidity
//   const payout = Math.min(payoutYes, payoutNo)

//   const newPool = { YES: YES - payoutYes, NO: NO - payoutNo }

//   return { newPool, payout, betAmount, betOutcome }
// }
