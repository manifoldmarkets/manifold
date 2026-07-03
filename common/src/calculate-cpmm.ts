import { groupBy, mapValues, minBy, omitBy, sortBy, sum, sumBy } from 'lodash'
import { fill, LimitBet } from './bet'
import { Fees, getFeesSplit, getTakerFee, noFees } from './fees'
import { LiquidityProvision } from './liquidity-provision'
import { binarySearch } from './util/algos'
import {
  EPSILON,
  floatingEqual,
  floatingGreaterEqual,
  floatingLesserEqual,
} from './util/math'
import {
  calculateCpmmMultiArbitrageSellNo,
  calculateCpmmMultiArbitrageSellYes,
} from './calculate-cpmm-arbitrage'
import { Answer } from './answer'
import { MarketContract, MAX_CPMM_PROB, MIN_CPMM_PROB } from 'common/contract'
import { addObjects } from 'common/util/object'

// (GPnn labels cite machine-checked proofs: https://github.com/evand/manifold-math/tree/main/cpmm-multi-2/proofs)
export const CPMM_ARBITRAGE_ERROR_PREFIX =
  'calculateAmountToBuySharesFixedP only works for p = 0.5, got '
export type CpmmState = {
  pool: { [outcome: string]: number }
  p: number
  collectedFees: Fees
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
export function calculateCpmmShares(
  pool: {
    [outcome: string]: number
  },
  p: number,
  betAmount: number,
  betChoice: string
) {
  if (betAmount === 0) return 0

  const { YES: y, NO: n } = pool
  const k = y ** p * n ** (1 - p)

  return betChoice === 'YES'
    ? // https://www.wolframalpha.com/input?i=%28y%2Bb-s%29%5E%28p%29*%28n%2Bb%29%5E%281-p%29+%3D+k%2C+solve+s
      y + betAmount - (k * (betAmount + n) ** (p - 1)) ** (1 / p)
    : n + betAmount - (k * (betAmount + y) ** -p) ** (1 / (1 - p))
}

export function getCpmmFees(
  state: CpmmState,
  betAmount: number,
  outcome: string
) {
  // Do a few iterations toward average probability of the bet minus fees.
  // Charging fees means the bet amount is lower and the average probability moves slightly less far.
  let fee = 0
  for (let i = 0; i < 10; i++) {
    const betAmountAfterFee = betAmount - fee
    const shares = calculateCpmmShares(
      state.pool,
      state.p,
      betAmountAfterFee,
      outcome
    )
    const averageProb = betAmountAfterFee / shares
    fee = getTakerFee(shares, averageProb)
  }

  const totalFees = betAmount === 0 ? 0 : fee
  const fees = getFeesSplit(totalFees)

  const remainingBet = betAmount - totalFees

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
  outcome: string,
  freeFees?: boolean
) {
  const { pool, p } = state
  const { remainingBet, fees } = freeFees
    ? {
        remainingBet: bet,
        fees: noFees,
      }
    : getCpmmFees(state, bet, outcome)

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
      ((p * (prob - 1)) / ((p - 1) * prob)) ** -p *
        (k - n * ((p * (prob - 1)) / ((p - 1) * prob)) ** p)
    : (((1 - p) * (prob - 1)) / (-p * prob)) ** (p - 1) *
        (k - y * (((1 - p) * (prob - 1)) / (-p * prob)) ** (1 - p))
}

export function calculateCpmmAmountToProbIncludingFees(
  state: CpmmState,
  prob: number,
  outcome: 'YES' | 'NO'
) {
  const amount = calculateCpmmAmountToProb(state, prob, outcome)
  const shares = calculateCpmmShares(state.pool, state.p, amount, outcome)
  const averageProb = amount / shares
  const fees = getTakerFee(shares, averageProb)
  return amount + fees
}

export function calculateCpmmAmountToBuySharesFixedP(
  state: CpmmState,
  shares: number,
  outcome: 'YES' | 'NO'
) {
  const { YES: y, NO: n } = state.pool

  if (floatingEqual(state.p, 0.5)) {
    if (outcome === 'YES') {
      // https://www.wolframalpha.com/input?i=%28y%2Bb-s%29%5E0.5+*+%28n%2Bb%29%5E0.5+%3D+y+%5E+0.5+*+n+%5E+0.5%2C+solve+b
      return (
        (shares - y - n + Math.sqrt(4 * n * shares + (y + n - shares) ** 2)) / 2
      )
    }
    return (
      (shares - y - n + Math.sqrt(4 * y * shares + (y + n - shares) ** 2)) / 2
    )
  }

  // General p (cpmm-multi-2): shares -> cost has no closed form, so invert the
  // general-p forward map calculateCpmmShares by bisection. calculateCpmmShares is
  // monotone increasing in the bet amount, and a buy of `shares` costs < `shares`
  // mana, so [0, shares*10] brackets a buy; a sell (shares < 0) is bounded below by
  // draining the opposite pool side. Mirrors the proven Python oracle
  // amm_core.cost_for_shares (GP3); 50 iterations reach double precision.
  if (shares === 0) return 0
  let low: number
  let high: number
  if (shares > 0) {
    low = 0
    high = shares * 10
  } else {
    const otherPool = outcome === 'YES' ? n : y
    low = -otherPool * (1 - 1e-9)
    high = 0
  }
  // calculateCpmmShares is monotone increasing in the amount, so the signed shares
  // error is a monotone comparator (binarySearch also fail-fasts on NaN).
  return binarySearch(low, high, (mid) =>
    calculateCpmmShares(state.pool, state.p, mid, outcome) - shares
  )
}

export const computeFills = (
  state: CpmmState,
  outcome: 'YES' | 'NO',
  betAmount: number,
  initialLimitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number | undefined },
  limitProbs?: { max: number; min: number },
  freeFees?: boolean
) => {
  if (isNaN(betAmount)) {
    throw new Error('Invalid bet amount: ${betAmount}')
  }
  if (isNaN(initialLimitProb ?? 0)) {
    throw new Error('Invalid limitProb: ${limitProb}')
  }
  const now = Date.now()
  const { max, min } = limitProbs ?? {}
  const limit = initialLimitProb ?? (outcome === 'YES' ? max : min)
  const limitProb = !limit
    ? undefined
    : limit > MAX_CPMM_PROB
    ? MAX_CPMM_PROB
    : limit < MIN_CPMM_PROB
    ? MIN_CPMM_PROB
    : limit

  const sortedBets = sortBy(
    unfilledBets.filter(
      (bet) =>
        bet.outcome !== outcome && (bet.expiresAt ? bet.expiresAt > now : true)
    ),
    (bet) => (outcome === 'YES' ? bet.limitProb : -bet.limitProb),
    (bet) => bet.createdTime
  )

  const takers: fill[] = []
  const makers: {
    bet: LimitBet
    amount: number
    shares: number
    timestamp: number
  }[] = []
  const ordersToCancel: LimitBet[] = []

  let amount = betAmount
  let cpmmState = { ...state }
  let totalFees = noFees
  const currentBalanceByUserId = { ...balanceByUserId }

  let i = 0
  while (true) {
    const matchedBet: LimitBet | undefined = sortedBets[i]
    const fill = computeFill(
      amount,
      outcome,
      limitProb,
      cpmmState,
      matchedBet,
      currentBalanceByUserId[matchedBet?.userId ?? ''],
      freeFees
    )

    if (!fill) break

    const { taker, maker } = fill

    if (maker.matchedBetId === null) {
      // Matched against pool.
      cpmmState = maker.state
      takers.push(taker)
    } else {
      // Matched against bet.
      i++
      const { userId } = maker.bet
      const makerBalance = currentBalanceByUserId[userId]
      if (makerBalance !== undefined) {
        if (maker.amount > 0) {
          currentBalanceByUserId[userId] = makerBalance - maker.amount
        }
        const adjustedMakerBalance = currentBalanceByUserId[userId]
        if (adjustedMakerBalance !== undefined && adjustedMakerBalance <= 0) {
          // Now they've insufficient balance. Cancel maker bet.
          ordersToCancel.push(maker.bet)
        }
      }
      if (floatingEqual(maker.amount, 0)) continue

      takers.push(taker)
      makers.push(maker)
    }

    totalFees = addObjects(totalFees, taker.fees)
    amount -= taker.amount

    if (floatingEqual(amount, 0)) break
  }

  return { takers, makers, totalFees, cpmmState, ordersToCancel }
}

const computeFill = (
  amount: number,
  outcome: 'YES' | 'NO',
  limitProb: number | undefined,
  cpmmState: CpmmState,
  matchedBet: LimitBet | undefined,
  matchedBetUserBalance: number | undefined,
  freeFees?: boolean
) => {
  const prob = getCpmmProbability(cpmmState.pool, cpmmState.p)

  if (
    limitProb !== undefined &&
    (outcome === 'YES'
      ? floatingGreaterEqual(prob, limitProb) &&
        (matchedBet?.limitProb ?? 1) > limitProb
      : floatingLesserEqual(prob, limitProb) &&
        (matchedBet?.limitProb ?? 0) < limitProb)
  ) {
    // No fill.
    return undefined
  }

  const timestamp = Date.now()

  if (
    !matchedBet ||
    (outcome === 'YES'
      ? !floatingGreaterEqual(prob, matchedBet.limitProb)
      : !floatingLesserEqual(prob, matchedBet.limitProb))
  ) {
    // Fill from pool.
    const limit = !matchedBet
      ? limitProb
      : outcome === 'YES'
      ? Math.min(matchedBet.limitProb, limitProb ?? 1)
      : Math.max(matchedBet.limitProb, limitProb ?? 0)

    const buyAmount =
      limit === undefined
        ? amount
        : Math.min(
            amount,
            freeFees
              ? calculateCpmmAmountToProb(cpmmState, limit, outcome)
              : calculateCpmmAmountToProbIncludingFees(
                  cpmmState,
                  limit,
                  outcome
                )
          )

    const { shares, newPool, newP, fees } = calculateCpmmPurchase(
      cpmmState,
      buyAmount,
      outcome,
      freeFees
    )
    const newState = {
      pool: newPool,
      p: newP,
      collectedFees: addObjects(fees, cpmmState.collectedFees),
    }

    return {
      maker: {
        matchedBetId: null,
        shares,
        amount: buyAmount,
        state: newState,
        timestamp,
      },
      taker: {
        matchedBetId: null,
        shares,
        amount: buyAmount,
        timestamp,
        fees,
      },
    }
  }

  // Fill from matchedBet.
  const amountRemaining = matchedBet.orderAmount - matchedBet.amount
  const matchableUserBalance =
    matchedBetUserBalance && matchedBetUserBalance < 0
      ? 0
      : matchedBetUserBalance
  const amountToFill = Math.min(
    amountRemaining,
    matchableUserBalance ?? amountRemaining
  )

  const takerPrice =
    outcome === 'YES' ? matchedBet.limitProb : 1 - matchedBet.limitProb
  const makerPrice =
    outcome === 'YES' ? 1 - matchedBet.limitProb : matchedBet.limitProb

  const feesOnOneShare = freeFees ? 0 : getTakerFee(1, takerPrice)
  const maxTakerShares = amount / (takerPrice + feesOnOneShare)
  const maxMakerShares = amountToFill / makerPrice
  const shares = Math.min(maxTakerShares, maxMakerShares)

  const takerFee = freeFees ? 0 : getTakerFee(shares, takerPrice)
  const fees = getFeesSplit(takerFee)

  const maker = {
    bet: matchedBet,
    matchedBetId: 'taker',
    amount: shares * makerPrice,
    shares,
    timestamp,
  }
  const taker = {
    matchedBetId: matchedBet.id,
    amount: shares * takerPrice + takerFee,
    shares,
    timestamp,
    fees,
  }
  return { maker, taker }
}

// Faster version assuming p = 0.5
export function calculateAmountToBuySharesFixedP(
  state: CpmmState,
  shares: number,
  outcome: 'YES' | 'NO',
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  freeFees?: boolean
) {
  const { takers } = computeFills(
    state,
    outcome,
    // First, bet more than required to get shares.
    shares,
    undefined,
    unfilledBets,
    balanceByUserId,
    undefined,
    freeFees
  )

  let currShares = 0
  let currAmount = 0
  for (const fill of takers) {
    const { amount: fillAmount, shares: fillShares, matchedBetId } = fill

    if (floatingEqual(currShares + fillShares, shares)) {
      return currAmount + fillAmount
    }
    if (currShares + fillShares > shares) {
      // This is first fill that goes over the required shares.
      if (matchedBetId) {
        // Match a portion of the fill to get the exact shares.
        const remainingShares = shares - currShares
        const remainingAmount = fillAmount * (remainingShares / fillShares)
        return currAmount + remainingAmount
      }
      // Last fill was from AMM. Break to compute the cpmmState at this point.
      break
    }

    currShares += fillShares
    currAmount += fillAmount
  }

  const remaningShares = shares - currShares

  // Recompute up to currAmount to get the current cpmmState.
  const { cpmmState } = computeFills(
    state,
    outcome,
    currAmount,
    undefined,
    unfilledBets,
    balanceByUserId,
    undefined,
    freeFees
  )
  const fillAmount = calculateCpmmAmountToBuySharesFixedP(
    cpmmState,
    remaningShares,
    outcome
  )
  const fillAmountFees = freeFees
    ? 0
    : getTakerFee(remaningShares, fillAmount / remaningShares)
  return currAmount + fillAmount + fillAmountFees
}

export function calculateCpmmMultiSumsToOneSale(
  answers: Answer[],
  answerToSell: Answer,
  shares: number,
  outcome: 'YES' | 'NO',
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  collectedFees: Fees
) {
  if (Math.round(shares) < 0) {
    throw new Error('Cannot sell non-positive shares')
  }

  const { newBetResult, otherBetResults } =
    outcome === 'YES'
      ? calculateCpmmMultiArbitrageSellYes(
          answers,
          answerToSell,
          shares,
          limitProb,
          unfilledBets,
          balanceByUserId,
          collectedFees
        )
      : calculateCpmmMultiArbitrageSellNo(
          answers,
          answerToSell,
          shares,
          limitProb,
          unfilledBets,
          balanceByUserId,
          collectedFees
        )

  const buyAmount = sumBy(newBetResult.takers, (taker) => taker.amount)
  // Transform buys of opposite outcome into sells.
  const saleTakers = newBetResult.takers.map((taker) => ({
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

  const transformedNewBetResult = {
    ...newBetResult,
    takers: saleTakers,
    outcome,
  }

  return {
    saleValue,
    buyAmount,
    newBetResult: transformedNewBetResult,
    otherBetResults,
  }
}

export function calculateAmountToBuyShares(
  state: CpmmState,
  shares: number,
  outcome: 'YES' | 'NO',
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number }
) {
  const prob = getCpmmProbability(state.pool, state.p)
  const minAmount = shares * (outcome === 'YES' ? prob : 1 - prob)

  // Search for amount between bounds.
  // Min share price is based on current probability, and max is Ṁ1 each.
  return binarySearch(minAmount, shares, (amount) => {
    const { takers } = computeFills(
      state,
      outcome,
      amount,
      undefined,
      unfilledBets,
      balanceByUserId
    )

    const totalShares = sumBy(takers, (taker) => taker.shares)
    return totalShares - shares
  })
}

export function calculateCpmmAmountToBuyShares(
  contract: MarketContract,
  shares: number,
  outcome: 'YES' | 'NO',
  allUnfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  answer?: Answer
) {
  const startCpmmState =
    contract.mechanism === 'cpmm-1'
      ? contract
      : {
          pool: { YES: answer!.poolYes, NO: answer!.poolNo },
          p: answer!.p,
          collectedFees: contract.collectedFees,
        }

  const unfilledBets = answer?.id
    ? allUnfilledBets.filter((b) => b.answerId === answer.id)
    : allUnfilledBets

  // cpmm-multi-2 answers carry a general (non-0.5) p, so they take the same
  // general-p inverse as cpmm-1 (the startCpmmState above already supplies
  // answer.p). cpmm-multi-1 stays on the p=0.5 FixedP path (byte-identical).
  if (contract.mechanism === 'cpmm-1' || contract.mechanism === 'cpmm-multi-2') {
    return calculateAmountToBuyShares(
      startCpmmState,
      shares,
      outcome,
      unfilledBets,
      balanceByUserId
    )
  } else if (contract.mechanism === 'cpmm-multi-1') {
    return calculateAmountToBuySharesFixedP(
      startCpmmState,
      shares,
      outcome,
      unfilledBets,
      balanceByUserId
    )
  } else {
    throw new Error('Only works for cpmm-1, cpmm-multi-1, and cpmm-multi-2')
  }
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
    state,
    oppositeOutcome,
    buyAmount,
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
    buyAmount,
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

export function getMultiCpmmLiquidity(pool: { YES: number; NO: number }) {
  return getCpmmLiquidity(pool, 0.5)
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
  let newP = numerator / denominator
  // 0/0 rescue: at general p an extreme buy can underflow a pool side to EXACTLY 0
  // (residual k^{1/(1-p)}/(pool+b)^{p/(1-p)} below one ulp — possible at p far from
  // 0.5, never at v1's p = 0.5), making prob and hence both terms 0 when this is
  // called with amount = 0 (calculateCpmmPurchase's post-bet re-price). A zero add
  // leaves p unchanged. Guarded on non-finiteness so every well-conditioned call —
  // in particular every v1 call — keeps the formula bit-for-bit.
  if (amount === 0 && !isFinite(newP)) {
    newP = p
  }

  const newPool = { YES: y + amount, NO: n + amount }

  const oldLiquidity = getCpmmLiquidity(pool, newP)
  const newLiquidity = getCpmmLiquidity(newPool, newP)
  const liquidity = newLiquidity - oldLiquidity

  return { newPool, liquidity, newP }
}

export function addCpmmLiquidityFixedP(
  pool: { YES: number; NO: number },
  amount: number
) {
  const prob = getCpmmProbability(pool, 0.5)
  const newPool = { ...pool }
  const sharesThrownAway = { YES: 0, NO: 0 }

  // Throws away some shares so that prob is maintained.
  if (prob < 0.5) {
    newPool.YES += amount
    newPool.NO += (prob / (1 - prob)) * amount
    sharesThrownAway.NO = amount - (prob / (1 - prob)) * amount
  } else {
    newPool.NO += amount
    newPool.YES += ((1 - prob) / prob) * amount
    sharesThrownAway.YES = amount - ((1 - prob) / prob) * amount
  }

  const oldLiquidity = getMultiCpmmLiquidity(pool)
  const newLiquidity = getMultiCpmmLiquidity(newPool)
  const liquidity = newLiquidity - oldLiquidity

  return { newPool, liquidity, sharesThrownAway }
}

export function addCpmmMultiLiquidityToAnswersIndependently(
  pools: { [answerId: string]: { YES: number; NO: number } },
  amount: number
) {
  const amountPerAnswer = amount / Object.keys(pools).length
  return mapValues(
    pools,
    (pool) => addCpmmLiquidityFixedP(pool, amountPerAnswer).newPool
  )
}

export function addCpmmMultiLiquidityAnswersSumToOne(
  pools: { [answerId: string]: { YES: number; NO: number } },
  amount: number
) {
  const answerIds = Object.keys(pools)
  const numAnswers = answerIds.length

  const newPools = { ...pools }

  let amountRemaining = amount
  while (amountRemaining > EPSILON) {
    const yesSharesThrownAway: { [answerId: string]: number } =
      Object.fromEntries(answerIds.map((answerId) => [answerId, 0]))

    for (const [answerId, pool] of Object.entries(newPools)) {
      const { newPool, sharesThrownAway } = addCpmmLiquidityFixedP(
        pool,
        amountRemaining / numAnswers
      )
      newPools[answerId] = newPool

      yesSharesThrownAway[answerId] += sharesThrownAway.YES
      const otherAnswerIds = answerIds.filter((id) => id !== answerId)
      for (const otherAnswerId of otherAnswerIds) {
        // Convert NO shares into YES shares for each other answer.
        yesSharesThrownAway[otherAnswerId] += sharesThrownAway.NO
      }
    }

    const minSharesThrownAway = Math.min(...Object.values(yesSharesThrownAway))
    amountRemaining = minSharesThrownAway
  }
  return newPools
}

// cpmm-multi-2: the √variance sum-to-one CREATION pool rule (also used by new-contract.ts
// createAnswers). Given target probabilities q (Σ q = 1) and an `ante`, build per-answer pools whose
// effective depth W_i = (1−p_i)Y_i + p_iN_i ∝ √(q_i(1−q_i)) — the max-total-liquidity shape under
// the no-house-risk basket budget (every winning scenario pays exactly the ante). Structure: all
// answers share Y_i − N_i = D (all-winners-tight funding), p_i set so prob_i = q_i. Reduces to v1's
// asymmetric pool at uniform q and to a balanced pool at n = 2. See
// tasks/cpmm_multi_2/creation-liquidity-findings.md (GP13–GP15). It is HOMOGENEOUS degree-1 in ante
// (reserves ∝ ante, p invariant — GP17a), which is what makes the whole-market liquidity-add merge
// below well-defined.
export function cpmmMulti2SumToOnePools(
  q: number[],
  ante: number
): { poolYes: number; poolNo: number; p: number; prob: number }[] {
  const n = q.length
  if (n < 2) {
    return q.map((qi) => ({ poolYes: ante, poolNo: ante, p: qi, prob: qi }))
  }
  const sqrtC = q.map((qi) => Math.sqrt(qi * (1 - qi)))
  const meanSqrtC = sqrtC.reduce((s, x) => s + x, 0) / n
  const D0 = (ante * (n - 2)) / (2 * (n - 1)) // uniform-optimum D (closed form)
  const Wbar = (ante * n) / (4 * (n - 1)) // uniform-optimum depth
  // Realize the depth profile W_i at the assumed D0:
  //   W_i = N_i(N_i + D0)/(N_i + q_i D0)  ⇒  N_i² + N_i(D0 − W_i) − W_i q_i D0 = 0.
  const N = q.map((qi, i) => {
    const Wi = (Wbar * sqrtC[i]) / meanSqrtC
    const b = D0 - Wi
    return (-b + Math.sqrt(b * b + 4 * Wi * qi * D0)) / 2
  })
  // Force exact funding: Y_i = N_i + D with D = ante − ΣN_j makes every winning
  // scenario pay exactly the ante (all-winners-tight). p_i set so prob_i = q_i.
  const D = ante - N.reduce((s, x) => s + x, 0)
  return q.map((qi, i) => {
    const poolNo = N[i]
    const poolYes = poolNo + D
    const p = pForProbability({ YES: poolYes, NO: poolNo }, qi)
    return { poolYes, poolNo, p, prob: qi }
  })
}

// GP19a creation-feasibility guard. The √variance construction above is NOT total: for
// skewed many-answer prob vectors (first possible at n = 21; e.g. n = 30 with a 0.90
// dominant answer) the funding term D goes negative enough that some poolYes < 0 and
// p ∉ (0,1). Exact characterization (GP19a, proofs/sanity_closure.py): sane ⟺
// Σⱼ Nⱼ(q,1) − minᵢ Nᵢ(q,1) < 1. The construction is homogeneous degree-1 in ante, so
// feasibility depends only on q — we test by constructing at ante = 1 and checking
// sanity directly (no duplicated algebra to drift). The small margin keeps p (and via
// re-pricing, reserves) representably far from {0,1} — float64 underflows exact-boundary
// states (GP19b caveat).
// The p that makes pool (Y, N) display probability q — the GP6a weight
// p(q) = qY / (qY + (1 - q)N), the inverse of getCpmmProbability in p. Used by v2
// creation, the whole-market add re-price, and the "Other" split. If p ever needs
// clamping away from {0,1} (float64 representability, GP19b caveat), this is the
// single home for it.
export function pForProbability(
  pool: { YES: number; NO: number },
  q: number
) {
  return (q * pool.YES) / (q * pool.YES + (1 - q) * pool.NO)
}

const CPMM_MULTI_2_SANITY_EPS = 1e-9
const isSanePool = (x: { poolYes: number; poolNo: number; p: number }) =>
  x.poolYes > 0 &&
  x.poolNo > 0 &&
  x.p > CPMM_MULTI_2_SANITY_EPS &&
  x.p < 1 - CPMM_MULTI_2_SANITY_EPS

export function cpmmMulti2SumToOneFeasible(q: number[]) {
  return cpmmMulti2SumToOnePools(q, 1).every(isSanePool)
}

const isSanePoolYesNo = (pool: { YES: number; NO: number }, p: number) =>
  isSanePool({ poolYes: pool.YES, poolNo: pool.NO, p })

// cpmm-multi-2: lossless whole-market liquidity add — √variance MERGE rule (GP17).
//
// v1 (addCpmmMultiLiquidityAnswersSumToOne, above) pins p = 0.5 and DISCARDS shares to hold each
// answer's probability on a skewed pool. v2 is lossless: probability is the invariant we preserve,
// p is the degree of freedom that floats to absorb the mana. The QUESTION is how to split the
// subsidy across answers. The old implementation EQUAL-split (amount/n into each), which is
// LMSR/balanced-shaped at the margin — inconsistent with the √variance CREATION rule above.
//
// The creation-consistent rule (Evan: "apply creation's allocation to the *added* mana at current
// probs; don't rearrange existing depth") is to MERGE a Δ = amount ante √variance creation computed
// at the CURRENT probabilities into the existing reserves, then re-price each answer's p to hold its
// probability. Properties (proofs/liquidity_add_split.py, GP17): each prob is preserved (unique
// re-pricing, GP17b) so Σ prob = 1 is inherited; conservation holds because the Δ-creation is
// all-winners-tight (locks exactly Δ) and resolution payout is linear in reserves, so the merge
// superposes two conservative markets (GP17c); on an untraded market it equals create(A+Δ) and at
// n = 2 it reduces EXACTLY to the old equal-split (GP17a/d). It concentrates the added depth in the
// uncertain answers instead of spreading it flat. drizzleMarket inherits this (it calls this fn),
// keeping the market on the √variance manifold rather than drifting toward balanced.
//
// Returns the new pool, the floated p, and the liquidity (k) added per answer for LP accounting.
export function addCpmmMultiLiquidityAnswersSumToOneV2(
  poolsByAnswer: {
    [answerId: string]: { pool: { YES: number; NO: number }; p: number }
  },
  amount: number
) {
  const answerIds = Object.keys(poolsByAnswer)
  // Current probabilities (Σ = 1 for a sum-to-one market).
  const probs = answerIds.map((id) =>
    getCpmmProbability(poolsByAnswer[id].pool, poolsByAnswer[id].p)
  )
  // Allocate the ADDED mana exactly as creation would, at the current probs (√variance shape).
  const delta = cpmmMulti2SumToOnePools(probs, amount)
  const result: {
    [answerId: string]: {
      pool: { YES: number; NO: number }
      p: number
      liquidity: number
    }
  } = {}
  answerIds.forEach((id, i) => {
    const { pool } = poolsByAnswer[id]
    const prob = probs[i]
    const newPool = {
      YES: pool.YES + delta[i].poolYes,
      NO: pool.NO + delta[i].poolNo,
    }
    // Re-price p so prob(newPool, newP) == prob (unique; same form as creation's p).
    const newP = pForProbability(newPool, prob)
    const liquidity =
      getCpmmLiquidity(newPool, newP) - getCpmmLiquidity(pool, newP)
    result[id] = { pool: newPool, p: newP, liquidity }
  })

  // GP19c guard: a sane TRADED market can sit at creation-infeasible probs, where the
  // √variance delta has dY_i < 0 on some answers and a large enough add drives a merged
  // poolYes < 0 (p ∉ (0,1)) — the critical total is A*(state) = min_{i: dY_i<0}
  // Y_i/|dY_i(q,1)|, and drizzle accumulates to the same bound (homogeneity — dripping
  // does not evade it). Rather than cap or reject (drizzle must never brick), fall back
  // to the unconditionally-sane allocation: split the amount equally as per-answer
  // lossless adds (GP19e: floated p is the GP6a weight — sane and prob-preserving for
  // ANY positive reserves; this is exactly the shipped per-answer addLiquidity op, so
  // conservation is inherited). The √variance shape is an optimization, not an
  // invariant; on the GP19a-feasible set the merge is unconditionally sane (A* = ∞) and
  // this fallback never engages.
  const merged = answerIds.map((id) => result[id])
  if (!merged.every((x) => isSanePoolYesNo(x.pool, x.p))) {
    const equalAmount = amount / answerIds.length
    answerIds.forEach((id) => {
      const { pool, p } = poolsByAnswer[id]
      const { newPool, newP } = addCpmmLiquidity(pool, p, equalAmount)
      const liquidity =
        getCpmmLiquidity(newPool, newP) - getCpmmLiquidity(pool, newP)
      result[id] = { pool: newPool, p: newP, liquidity }
    })
  }
  return result
}

// cpmm-multi-2: lossless whole-market liquidity add for INDEPENDENT (non-sum-to-one / "Set")
// markets.
//
// An independent answer is literally its own standalone binary CPMM, so each answer takes the
// exact binary lossless add (addCpmmLiquidity — inject the subsidy into BOTH reserves and float
// that answer's p to hold its probability, discarding no shares). There is no Σ prob = 1 coupling
// between answers — each is independent — so unlike the v1 fixed-p path
// (addCpmmMultiLiquidityToAnswersIndependently → addCpmmLiquidityFixedP, which DISCARDS shares to
// pin p = 0.5 on a skewed pool and clobbers prob to N/(Y+N)) nothing is thrown away and each
// answer's true probability is preserved.
//
// Mathematically this is the same per-answer operation as addCpmmMultiLiquidityAnswersSumToOneV2
// (sum-to-one preserves Σ = 1 only as a *consequence* of each prob being individually preserved —
// GP6a); the two are kept as separate named functions to mirror the v1 sum-to-one / independent
// split and keep the drizzle call sites self-documenting. At p = 0.5 on a balanced pool both
// reserves get +amountPerAnswer, p stays 0.5, and prob is unchanged — i.e. it reduces to the v1
// fixed-p add with sharesThrownAway = 0.
export function addCpmmMultiLiquidityToAnswersIndependentlyV2(
  poolsByAnswer: {
    [answerId: string]: { pool: { YES: number; NO: number }; p: number }
  },
  amount: number
) {
  const amountPerAnswer = amount / Object.keys(poolsByAnswer).length
  return mapValues(poolsByAnswer, ({ pool, p }) => {
    const { newPool, liquidity, newP } = addCpmmLiquidity(pool, p, amountPerAnswer)
    return { pool: newPool, p: newP, liquidity }
  })
}

// Must be at least this many yes and no shares
export const MINIMUM_LIQUIDITY = 100

export function removeCpmmLiquidity(
  pool: { [outcome: string]: number },
  p: number,
  amount: number
) {
  const { newPool, liquidity, newP } = addCpmmLiquidity(pool, p, -1 * amount)

  const error =
    newPool.YES < MINIMUM_LIQUIDITY || newPool.NO < MINIMUM_LIQUIDITY

  return { newPool, liquidity, newP, error }
}

export function maximumRemovableLiquidity(pool: { [outcome: string]: number }) {
  const { YES: y, NO: n } = pool
  return Math.max(Math.min(y, n) - MINIMUM_LIQUIDITY, 0)
}

export function getCpmmLiquidityPoolWeights(liquidities: LiquidityProvision[]) {
  if (liquidities.length === 0) return {} // this should never happen

  const liquiditiesByUser = groupBy(liquidities, 'userId')

  // we don't clawback from users that took more liquidity than they gave
  // instead we count their contribution as 0 and split the rest
  const userAmounts = mapValues(liquiditiesByUser, (liquidities) =>
    Math.max(0, sumBy(liquidities, 'amount'))
  )
  const totalAmount = sum(Object.values(userAmounts))
  // ... unless they are all net liquidity leeches, in which case remaining liquidity goes to the first liquidizer (persumably the creator)
  if (totalAmount === 0) {
    const firstUser = minBy(liquidities, 'createdTime')!.userId
    return { [firstUser]: 1 }
  }
  const weights = mapValues(userAmounts, (amount) => amount / totalAmount)
  return omitBy(weights, (w) => w === 0)
}

const getK = (pool: { [outcome: string]: number }) => {
  const values = Object.values(pool)
  return sumBy(values, Math.log)
}

export const getLiquidity = (pool: { [outcome: string]: number }) => {
  return Math.exp(getK(pool) / Object.keys(pool).length)
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
