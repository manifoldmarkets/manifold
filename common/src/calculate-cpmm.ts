import { groupBy, mapValues, sumBy } from 'lodash'
import { LimitBet } from './bet'

import { CREATOR_FEE, Fees, LIQUIDITY_FEE, PLATFORM_FEE } from './fees'
import { LiquidityProvision } from './liquidity-provision'
import { computeFills } from './new-bet'
import { binarySearch } from './util/algos'

export type CpmmState = {
  pool: { [outcome: string]: number }
  p: number
}

export function getCpmmProbability(
  pool: { [outcome: string]: number },
  p: number
) {
  const { YES, NO } = pool
  return (p * NO) / ((1 - p) * YES + p * NO)
}

export function getCpmmProbabilityAfterBetBeforeFees(
  state: CpmmState,
  outcome: string,
  bet: number
) {
  const { pool, p } = state
  const shares = calculateCpmmShares(pool, p, bet, outcome)
  const { YES: y, NO: n } = pool

  const [newY, newN] =
    outcome === 'YES'
      ? [y - shares + bet, n + bet]
      : [y + bet, n - shares + bet]

  return getCpmmProbability({ YES: newY, NO: newN }, p)
}

export function getCpmmOutcomeProbabilityAfterBet(
  state: CpmmState,
  outcome: string,
  bet: number
) {
  const { newPool } = calculateCpmmPurchase(state, bet, outcome)
  const p = getCpmmProbability(newPool, state.p)
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

export function getCpmmFees(state: CpmmState, bet: number, outcome: string) {
  const prob = getCpmmProbabilityAfterBetBeforeFees(state, outcome, bet)
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
  state: CpmmState,
  bet: number,
  outcome: string
) {
  const { pool, p } = state
  const { remainingBet } = getCpmmFees(state, bet, outcome)

  return calculateCpmmShares(pool, p, remainingBet, outcome)
}

export function calculateCpmmPurchase(
  state: CpmmState,
  bet: number,
  outcome: string
) {
  const { pool, p } = state
  const { remainingBet, fees } = getCpmmFees(state, bet, outcome)

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

export function calculateCpmmAmountToProb(
  state: CpmmState,
  prob: number,
  outcome: 'YES' | 'NO'
) {
  if (prob <= 0 || prob >= 1 || isNaN(prob)) return Infinity
  if (outcome === 'NO') prob = 1 - prob

  const { pool, p } = state
  const { YES: y, NO: n } = pool
  const k = y ** p * n ** (1 - p)
  return outcome === 'YES'
    ? // https://www.wolframalpha.com/input?i=-1+%2B+t+-+((-1+%2B+p)+t+(k%2F(n+%2B+b))^(1%2Fp))%2Fp+solve+b
      ((p * (prob - 1)) / ((p - 1) * prob)) ** (-p)*(k - n * ((p * (prob - 1)) / ((p - 1) * prob)) ** p)
    : (((1 - p) * (prob - 1)) / ((-p) * prob)) ** (p-1)*(k - y * (((1 - p) * (prob - 1)) / ((-p) * prob)) ** (1 - p))
}

function calculateAmountToBuyShares(
  state: CpmmState,
  shares: number,
  outcome: 'YES' | 'NO',
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number }
) {
  // Search for amount between bounds (0, shares).
  // Min share price is Ṁ0, and max is Ṁ1 each.
  return binarySearch(0, shares, (amount) => {
    const { takers } = computeFills(
      outcome,
      amount,
      state,
      undefined,
      unfilledBets,
      balanceByUserId
    )

    const totalShares = sumBy(takers, (taker) => taker.shares)
    return totalShares - shares
  })
}

export function calculateCpmmSale(
  state: CpmmState,
  shares: number,
  outcome: 'YES' | 'NO',
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number }
) {
  if (Math.round(shares) < 0) {
    throw new Error('Cannot sell non-positive shares')
  }

  const oppositeOutcome = outcome === 'YES' ? 'NO' : 'YES'
  const buyAmount = calculateAmountToBuyShares(
    state,
    shares,
    oppositeOutcome,
    unfilledBets,
    balanceByUserId
  )

  const { cpmmState, makers, takers, totalFees, ordersToCancel } = computeFills(
    oppositeOutcome,
    buyAmount,
    state,
    undefined,
    unfilledBets,
    balanceByUserId
  )

  // Transform buys of opposite outcome into sells.
  const saleTakers = takers.map((taker) => ({
    ...taker,
    // You bought opposite shares, which combine with existing shares, removing them.
    shares: -taker.shares,
    // Opposite shares combine with shares you are selling for Ṁ of shares.
    // You paid taker.amount for the opposite shares.
    // Take the negative because this is money you gain.
    amount: -(taker.shares - taker.amount),
    isSale: true,
  }))

  const saleValue = -sumBy(saleTakers, (taker) => taker.amount)

  return {
    saleValue,
    cpmmState,
    fees: totalFees,
    makers,
    takers: saleTakers,
    ordersToCancel,
  }
}

export function getCpmmProbabilityAfterSale(
  state: CpmmState,
  shares: number,
  outcome: 'YES' | 'NO',
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number }
) {
  const { cpmmState } = calculateCpmmSale(
    state,
    shares,
    outcome,
    unfilledBets,
    balanceByUserId
  )
  return getCpmmProbability(cpmmState.pool, cpmmState.p)
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

export function getCpmmLiquidityPoolWeights(liquidities: LiquidityProvision[]) {
  const userAmounts = groupBy(liquidities, (w) => w.userId)
  const totalAmount = sumBy(liquidities, (w) => w.amount)

  return mapValues(
    userAmounts,
    (amounts) => sumBy(amounts, (w) => w.amount) / totalAmount
  )
}

export function getUserLiquidityShares(
  userId: string,
  pool: { [outcome: string]: number },
  liquidities: LiquidityProvision[]
) {
  const weights = getCpmmLiquidityPoolWeights(liquidities)
  const userWeight = weights[userId] ?? 0

  return mapValues(pool, (shares) => userWeight * shares)
}
