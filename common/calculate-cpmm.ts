import { sum, groupBy, mapValues, sumBy } from 'lodash'

import { CPMMContract } from './contract'
import { CREATOR_FEE, Fees, LIQUIDITY_FEE, noFees, PLATFORM_FEE } from './fees'
import { LiquidityProvision } from './liquidity-provision'
import { addObjects } from './util/object'

export function getCpmmProbability(
  pool: { [outcome: string]: number },
  p: number
) {
  const { YES, NO } = pool
  return (p * NO) / ((1 - p) * YES + p * NO)
}

export function getCpmmProbabilityAfterBetBeforeFees(
  contract: CPMMContract,
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
  contract: CPMMContract,
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
  contract: CPMMContract,
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

  return { remainingBet, totalFees, fees }
}

export function calculateCpmmSharesAfterFee(
  contract: CPMMContract,
  bet: number,
  outcome: string
) {
  const { pool, p } = contract
  const { remainingBet } = getCpmmLiquidityFee(contract, bet, outcome)

  return calculateCpmmShares(pool, p, remainingBet, outcome)
}

export function calculateCpmmPurchase(
  contract: CPMMContract,
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

function computeK(y: number, n: number, p: number) {
  return y ** p * n ** (1 - p)
}

function sellSharesK(
  y: number,
  n: number,
  p: number,
  s: number,
  outcome: 'YES' | 'NO',
  b: number
) {
  return outcome === 'YES'
    ? computeK(y - b + s, n - b, p)
    : computeK(y - b, n - b + s, p)
}

function calculateCpmmShareValue(
  contract: CPMMContract,
  shares: number,
  outcome: 'YES' | 'NO'
) {
  const { pool, p } = contract

  // Find bet amount that preserves k after selling shares.
  const k = computeK(pool.YES, pool.NO, p)
  const otherPool = outcome === 'YES' ? pool.NO : pool.YES

  // Constrain the max sale value to the lessor of 1. shares and 2. the other pool.
  // This is because 1. the max value per share is M$ 1,
  // and 2. The other pool cannot go negative and the sale value is subtracted from it.
  // (Without this, there are multiple solutions for the same k.)
  let highAmount = Math.min(shares, otherPool)
  let lowAmount = 0
  let mid = 0
  let kGuess = 0
  while (true) {
    mid = lowAmount + (highAmount - lowAmount) / 2

    // Break once we've reached max precision.
    if (mid === lowAmount || mid === highAmount) break

    kGuess = sellSharesK(pool.YES, pool.NO, p, shares, outcome, mid)
    if (kGuess < k) {
      highAmount = mid
    } else {
      lowAmount = mid
    }
  }
  return mid
}

export function calculateCpmmSale(
  contract: CPMMContract,
  shares: number,
  outcome: string
) {
  if (Math.round(shares) < 0) {
    throw new Error('Cannot sell non-positive shares')
  }

  const saleValue = calculateCpmmShareValue(
    contract,
    shares,
    outcome as 'YES' | 'NO'
  )

  const fees = noFees

  // const { fees, remainingBet: saleValue } = getCpmmLiquidityFee(
  //   contract,
  //   rawSaleValue,
  //   outcome === 'YES' ? 'NO' : 'YES'
  // )

  const { pool } = contract
  const { YES: y, NO: n } = pool

  const { liquidityFee: fee } = fees

  const [newY, newN] =
    outcome === 'YES'
      ? [y + shares - saleValue + fee, n - saleValue + fee]
      : [y - saleValue + fee, n + shares - saleValue + fee]

  if (newY < 0 || newN < 0) {
    console.log('calculateCpmmSale', {
      newY,
      newN,
      y,
      n,
      shares,
      saleValue,
      fee,
      outcome,
    })
    throw new Error('Cannot sell more than in pool')
  }

  const postBetPool = { YES: newY, NO: newN }

  const { newPool, newP } = addCpmmLiquidity(postBetPool, contract.p, fee)

  return { saleValue, newPool, newP, fees }
}

export function getCpmmProbabilityAfterSale(
  contract: CPMMContract,
  shares: number,
  outcome: 'YES' | 'NO'
) {
  const { newPool } = calculateCpmmSale(contract, shares, outcome)
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

export function getCpmmLiquidityPoolWeights(
  contract: CPMMContract,
  liquidities: LiquidityProvision[]
) {
  const { p } = contract

  const liquidityShares = liquidities.map((l) => {
    const oldLiquidity = getCpmmLiquidity(l.pool, p)

    const newPool = addObjects(l.pool, { YES: l.amount, NO: l.amount })
    const newLiquidity = getCpmmLiquidity(newPool, p)

    const liquidity = newLiquidity - oldLiquidity
    return liquidity
  })

  const shareSum = sum(liquidityShares)

  const weights = liquidityShares.map((s, i) => ({
    weight: s / shareSum,
    providerId: liquidities[i].userId,
  }))

  const userWeights = groupBy(weights, (w) => w.providerId)
  const totalUserWeights = mapValues(userWeights, (userWeight) =>
    sumBy(userWeight, (w) => w.weight)
  )
  return totalUserWeights
}

export function getUserLiquidityShares(
  userId: string,
  contract: CPMMContract,
  liquidities: LiquidityProvision[]
) {
  const weights = getCpmmLiquidityPoolWeights(contract, liquidities)
  const userWeight = weights[userId]

  return mapValues(contract.pool, (shares) => userWeight * shares)
}

// export function removeCpmmLiquidity(
//   contract: CPMMContract,
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
