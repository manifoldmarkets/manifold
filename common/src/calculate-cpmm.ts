import { groupBy, mapValues, minBy, omitBy, sortBy, sum, sumBy } from 'lodash'
import { fill, isOpenLimitOrder, LimitBet } from './bet'
import { Fees, getFeesSplit, getTakerFee, noFees } from './fees'
import { LiquidityProvision } from './liquidity-provision'
import { BINARY_SEARCH_NAN_ERROR, binarySearch } from './util/algos'
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
import { Answer, answerP } from './answer'
import { MarketContract, MAX_CPMM_PROB, MIN_CPMM_PROB } from 'common/contract'
import { addObjects } from 'common/util/object'

// (GPnn labels cite machine-checked proofs: https://github.com/evand/manifold-math/tree/main/cpmm-multi-2/proofs)
export const CPMM_ARBITRAGE_ERROR_PREFIX =
  'calculateAmountToBuySharesFixedP only works for p = 0.5, got '

// Whether an error came from pricing a degenerate pool state: a NaN p (the
// prefix above, kept so existing log searches still match), or a NaN reaching a
// binary search. Sells log the pool state for these, and the bet panel explains
// them instead of showing the raw message.
export const isCpmmDegenerateStateError = (e: unknown): e is Error =>
  e instanceof Error &&
  (e.message.startsWith(CPMM_ARBITRAGE_ERROR_PREFIX) ||
    e.message.startsWith(BINARY_SEARCH_NAN_ERROR))

// Whether a trade left a pool with a side that isn't a positive, finite number:
// drained outright, as its residual underflows at a p far from 0.5. The answers
// table refuses to store these. A small side alone is fine: a cpmm-multi-2 long
// shot's NO side opens at about 0.001 of the ante.
export const isDrainedPool = (pool: { [outcome: string]: number }) =>
  Object.values(pool).some((side) => !(side > 0 && isFinite(side)))

// Whether a lossless add can deepen a cpmm-multi-2 answer at this probability:
// within the 1%-99% band bets are held to. Floating p to hold the probability
// moves p toward it as the pool fills, so adds only there keep every answer's p
// within [0.01, 0.99], where creation puts it (trades never move p). Beyond, p
// would follow an answer to 1e-6 or 0.999, and at such a p the pool has next to
// no depth on one side: a trade the size of the pool leaves a side below what a
// double can hold. The subsidy waits instead; resolution pays it out.
export const isDeepenableProb = (prob: number) =>
  prob >= MIN_CPMM_PROB && prob <= MAX_CPMM_PROB

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
    // A bet too small for the pool's floating point to register buys exactly 0
    // shares, at an average price of x/0. Charge it no fee rather than a NaN
    // one, which failed the whole trade: a sale next to a resting order probes
    // such fills. A drained pool at p = 0.5 keeps the NaN, one of the ways
    // cpmm-multi-1's arbitrage reports a degenerate pool, which its sell
    // diagnostics look for.
    fee =
      isFinite(averageProb) ||
      (floatingEqual(state.p, 0.5) && isDrainedPool(state.pool))
        ? getTakerFee(shares, averageProb)
        : 0
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

// The side of the pool a purchase takes its shares from, after the purchase.
// That's side + amount - shares, but the subtraction cancels when the trade
// leaves the side many orders of magnitude below the amount, as it does when an
// answer is pushed far toward 0% or 100% at a p far from 0.5: it rounds a small
// positive side to 0, or to a few ulps of noise that later trades can't price.
// There, take the side straight from the invariant instead:
// side' = side * (other / (other + amount)) ^ ((1 - pSide) / pSide), where pSide
// is the side's exponent in it (p for YES, 1 - p for NO). Anywhere the
// subtraction keeps its precision, it's what this returns, bit for bit, and it
// always is at p = 0.5 (give or take the few ulps a fill can move p), so
// cpmm-multi-1 pools come out exactly as they did.
const poolSideAfterPurchase = (
  side: number,
  other: number,
  pSide: number,
  amount: number,
  shares: number
) => {
  const subtracted = side - shares + amount
  if (floatingEqual(pSide, 0.5) || subtracted > 1e-6 * (side + amount))
    return subtracted
  return side * Math.exp(-((1 - pSide) / pSide) * Math.log1p(amount / other))
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
      ? [
          poolSideAfterPurchase(y, n, p, remainingBet, shares) + fee,
          n + remainingBet + fee,
        ]
      : [
          y + remainingBet + fee,
          poolSideAfterPurchase(n, y, 1 - p, remainingBet, shares) + fee,
        ]

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

  // A NaN p only comes from a degenerate pool. Fail the way this always has
  // for it, rather than bisect on NaN.
  if (!isFinite(state.p)) throw new Error(CPMM_ARBITRAGE_ERROR_PREFIX + state.p)

  // General p (cpmm-multi-2): shares -> cost has no closed form. Trading `a`
  // mana for `shares` (s) of an outcome leaves the side it's paid from at
  // own + a - s and the other side at other + a, with own^pOwn *
  // other^(1 - pOwn) unchanged (pOwn is p for YES, 1 - p for NO), so the cost is
  // the root of
  //   h(a) = pOwn * log1p((a - s) / own) + (1 - pOwn) * log1p(a / other).
  // In log1p form h keeps its precision at extreme prices, where the cost is a
  // sliver of the shares. h rises and is concave in a, so Newton's method
  // started below the root climbs to it without overshooting, in a handful of
  // steps; a bracket catches any step that would leave it. A trade of s shares
  // costs, or pays, less than s mana, and a sale can't take more than the other
  // side.
  if (shares === 0) return 0
  const { p } = state
  const [own, other, pOwn] = outcome === 'YES' ? [y, n, p] : [n, y, 1 - p]
  let lo = shares > 0 ? Math.max(0, shares - own) : Math.max(shares, -other)
  let hi = shares > 0 ? shares : 0
  // Where the bracket is a single float, that's the cost: a mana a share when
  // the side the shares come from is below one ulp of them, and nothing for a
  // sale against an empty side.
  if (!(hi > lo)) return hi
  const h = (a: number) =>
    pOwn * Math.log1p((a - shares) / own) + (1 - pOwn) * Math.log1p(a / other)
  const slope = (a: number) =>
    pOwn / (own + a - shares) + (1 - pOwn) / (other + a)
  // Every share at the current price: below the root, buying or selling.
  const price = (pOwn * other) / ((1 - pOwn) * own + pOwn * other)
  let cost = shares * price
  if (!(cost > lo && cost < hi)) cost = lo + (hi - lo) / 2
  for (let i = 0; i < 100; i++) {
    // When the side the shares come from is below one ulp of them, the bracket's
    // low end can round to a cost that would take more than the side holds,
    // where log1p's argument passes -1: that cost is too low.
    const value = cost - shares <= -own ? -Infinity : h(cost)
    // Only a degenerate pool gets here; fail the way the bisection this
    // replaced did, which the sell diagnostics recognize.
    if (isNaN(value))
      throw new Error(
        BINARY_SEARCH_NAN_ERROR + ' at ' + JSON.stringify({ cost, lo, hi })
      )
    if (value === 0) return cost
    if (value < 0) lo = cost
    else hi = cost
    let next = value === -Infinity ? NaN : cost - value / slope(cost)
    if (!(next > lo && next < hi)) next = lo + (hi - lo) / 2
    // Down to adjacent floats: the high end is the least cost known to cover it.
    if (!(next > lo && next < hi)) return hi
    if (Math.abs(next - cost) <= 1e-15 * Math.abs(next)) return next
    cost = next
  }
  return cost
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
    // Callers are meant to hand us only open orders, but a client's cached
    // order book can lag behind a cancel or a fill. Never quote a price
    // against an order that isn't there any more.
    unfilledBets.filter(
      (bet) => bet.outcome !== outcome && isOpenLimitOrder(bet, now)
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
  // Each fill takes the next resting order or moves the pool up to one, so a bet
  // needs about two fills per order. Only a pool too degenerate to price keeps
  // returning fills that go nowhere; stop there rather than loop forever.
  const maxFills = 2 * sortedBets.length + 100
  for (let fills = 0; fills < maxFills; fills++) {
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

  // Recompute up to currAmount to get the current cpmmState. With nothing
  // filled yet that's the state itself: a fill of nothing would re-derive p from
  // the pool's probability, which within 1e-11 of 100% keeps only a few digits
  // of it, and price the shares at a p the purchase itself doesn't use.
  const { cpmmState } =
    currAmount === 0
      ? { cpmmState: state }
      : computeFills(
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
  // Snap floating-point dust (e.g. -4.44e-16) to an exact zero no-op so it
  // can't invert the arbitrage binary search into NaN. Zero must stay legal:
  // the sell panel previews with 0 shares while its input is empty.
  if (floatingEqual(shares, 0)) {
    shares = 0
  } else if (shares < 0) {
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
  const sharesFor = (amount: number) => {
    const { takers } = computeFills(
      state,
      outcome,
      amount,
      undefined,
      unfilledBets,
      balanceByUserId
    )
    return sumBy(takers, (taker) => taker.shares)
  }

  // Search for amount between bounds.
  // Min share price is based on current probability, and max is Ṁ1 each.
  const amount = binarySearch(
    minAmount,
    shares,
    (amount) => sharesFor(amount) - shares
  )
  // Within an ulp or so of 0% or 100%, the cost of the cheap side's shares is
  // a sliver of that bracket, finer than bisecting it resolves: selling 0.05
  // shares at 1 - 4e-15 costs 2e-16, and the amount found could buy a fifth
  // more shares than asked. Where it misses by more than a millionth, search
  // again on the log of the amount, which resolves it relative to its own size,
  // and take that if it buys the shares asked. (A miss can also be a jump no
  // amount lands in, where a maker's balance runs out; that stays as it was.)
  const missBy = (amount: number) => Math.abs(sharesFor(amount) - shares)
  if (!(missBy(amount) > 1e-6 * shares)) return amount
  const refined = Math.exp(
    binarySearch(
      Math.log(Math.max(minAmount, Number.MIN_VALUE)),
      Math.log(shares),
      (logAmount) => sharesFor(Math.exp(logAmount)) - shares,
      100
    )
  )
  return missBy(refined) <= 1e-9 * shares ? refined : amount
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
          p: answerP(answer!),
          collectedFees: contract.collectedFees,
        }

  const unfilledBets = answer?.id
    ? allUnfilledBets.filter((b) => b.answerId === answer.id)
    : allUnfilledBets

  // cpmm-multi-2 answers carry a general (non-0.5) p, so they take the same
  // general-p inverse as cpmm-1 (the startCpmmState above already supplies
  // answer.p). cpmm-multi-1 stays on the p=0.5 FixedP path (byte-identical).
  if (
    contract.mechanism === 'cpmm-1' ||
    contract.mechanism === 'cpmm-multi-2'
  ) {
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
  // Snap floating-point dust (e.g. -4.44e-16) to an exact zero no-op so it
  // can't invert the arbitrage binary search into NaN. Zero must stay legal:
  // the sell panel previews with 0 shares while its input is empty.
  if (floatingEqual(shares, 0)) {
    shares = 0
  } else if (shares < 0) {
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
  // (residual k^{1/(1-p)}/(pool+b)^{p/(1-p)} below one ulp), making prob and hence
  // both terms 0 when this is called with amount = 0 (calculateCpmmPurchase's
  // post-bet re-price). A zero add leaves p unchanged. Guarded on non-finiteness so
  // every well-conditioned call keeps the formula bit-for-bit. Not at p = 0.5:
  // cpmm-multi-1 pools reach this too when a trade exhausts a shallow pool, and
  // there the NaN is how the arbitrage reports the degenerate state (the sell
  // diagnostics and the bet panel's "buy NO in other answers first" match it).
  if (amount === 0 && !isFinite(newP) && !floatingEqual(p, 0.5)) {
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

// cpmm-multi-2: the depth W_i = (1−p_i)Y_i + p_iN_i the √variance rule below aims to give each
// answer: the uniform-optimum depth, reweighted by √(q_i(1−q_i)). Exact funding then moves the
// realized depths off these targets (see D below), furthest for the long shots of skewed
// many-answer markets. Needs n ≥ 2.
export function cpmmMulti2SumToOneTargetDepths(q: number[], ante: number) {
  const n = q.length
  const sqrtC = q.map((qi) => Math.sqrt(qi * (1 - qi)))
  const meanSqrtC = sqrtC.reduce((s, x) => s + x, 0) / n
  const Wbar = (ante * n) / (4 * (n - 1)) // uniform-optimum depth
  return sqrtC.map((c) => (Wbar * c) / meanSqrtC)
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
  const D0 = (ante * (n - 2)) / (2 * (n - 1)) // uniform-optimum D (closed form)
  const W = cpmmMulti2SumToOneTargetDepths(q, ante)
  // Realize the depth profile W_i at the assumed D0:
  //   W_i = N_i(N_i + D0)/(N_i + q_i D0)  ⇒  N_i² + N_i(D0 − W_i) − W_i q_i D0 = 0.
  const N = q.map((qi, i) => {
    const Wi = W[i]
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

// The p that makes pool (Y, N) display probability q — the GP6a weight
// p(q) = qY / (qY + (1 - q)N), the inverse of getCpmmProbability in p. Used by v2
// creation, the whole-market add re-price, and the "Other" split. If p ever needs
// clamping away from {0,1} (float64 representability, GP19b caveat), this is the
// single home for it.
export function pForProbability(pool: { YES: number; NO: number }, q: number) {
  return (q * pool.YES) / (q * pool.YES + (1 - q) * pool.NO)
}

// GP19a creation-feasibility guard. The √variance construction above is NOT total: for
// skewed prob vectors the funding term D goes negative enough that some poolYes < 0 and
// p ∉ (0,1). With one dominant answer and an even tail that first happens at n = 21
// (e.g. n = 30 with a 0.90 dominant answer), but two front-runners with a few long shots
// at the 1% floor hit it from n = 7 (e.g. 50.2/43.5/2/1.3/1/1/1). Exact characterization (GP19a, proofs/sanity_closure.py): sane ⟺
// Σⱼ Nⱼ(q,1) − minᵢ Nᵢ(q,1) < 1. The construction is homogeneous degree-1 in ante, so
// feasibility depends only on q — we test by constructing at ante = 1 and checking
// sanity directly (no duplicated algebra to drift). The small margin keeps p (and via
// re-pricing, reserves) representably far from {0,1} — float64 underflows exact-boundary
// states (GP19b caveat).
const CPMM_MULTI_2_SANITY_EPS = 1e-9
const isSanePool = (x: { poolYes: number; poolNo: number; p: number }) =>
  x.poolYes > 0 &&
  x.poolNo > 0 &&
  x.p > CPMM_MULTI_2_SANITY_EPS &&
  x.p < 1 - CPMM_MULTI_2_SANITY_EPS

export function cpmmMulti2SumToOneFeasible(q: number[]) {
  return cpmmMulti2SumToOnePools(q, 1).every(isSanePool)
}

// cpmm-multi-2: balanced creation pools. Every answer gets YES = NO = ante/n, with
// its own p set to its target so it reads back prob_i = q_i. If exactly one answer
// wins, the pools pay ante/n + (n − 1)·ante/n = ante whichever it is, and an
// independent answer pays ante/n either way, so none of the ante is thrown away.
// Unlike the √variance shape this exists for every probability vector. Independent
// answers open this way, each its own binary market, and the exact solve below uses
// it for a single answer.
export function cpmmMulti2BalancedPools(
  q: number[],
  ante: number
): { poolYes: number; poolNo: number; p: number; prob: number }[] {
  const amount = ante / q.length
  return q.map((qi) => ({ poolYes: amount, poolNo: amount, p: qi, prob: qi }))
}

// cpmm-multi-2: the √variance shape solved exactly, for odds the closed form above
// can't open (cpmmMulti2SumToOneCreationPools). Every answer gets depth
// c·√(q_i(1 − q_i)), every winning scenario pays back exactly the ante, and c is
// the largest any shared D = Y_i − N_i allows. D = 0 (balanced pools, N_i = W_i)
// funds any q, so there is always a solution; searching D only deepens it. At
// uniform q the best D is D0, which makes these v1's pools.
export function cpmmMulti2MaxDepthPools(
  q: number[],
  ante: number
): { poolYes: number; poolNo: number; p: number; prob: number }[] {
  const n = q.length
  if (n < 2) return cpmmMulti2BalancedPools(q, ante)
  const shape = q.map((qi) => Math.sqrt(qi * (1 - qi)))
  // The N giving depth W at shared D: the positive root of N² + (D − W)N − WqD = 0,
  // written to avoid cancellation when D ≫ W.
  const noAt = (W: number, qi: number, D: number) => {
    const b = D - W
    const r = Math.sqrt(b * b + 4 * W * qi * D)
    return b > 0 ? (2 * W * qi * D) / (b + r) : (r - b) / 2
  }
  const fundingAt = (c: number, D: number) =>
    D + sum(q.map((qi, i) => noAt(c * shape[i], qi, D)))
  // Funding rises with c, so bisect for the c that spends exactly the ante.
  const scaleAt = (D: number) => {
    let hi = ante / sum(shape)
    while (fundingAt(hi, D) < ante) hi *= 2
    return binarySearch(0, hi, (c) => fundingAt(c, D) - ante)
  }
  // c rises with D while the shared D deepens answers more cheaply than their
  // own N, then falls to 0 at D = ante. Find the peak on a grid, then refine it.
  const grid = Array.from({ length: 32 }, (_, k) => (ante * k) / 32)
  const scales = grid.map(scaleAt)
  const best = scales.indexOf(Math.max(...scales))
  let left = grid[Math.max(0, best - 1)]
  let right = grid[Math.min(grid.length - 1, best + 1)]
  const golden = (Math.sqrt(5) - 1) / 2
  for (let i = 0; i < 60; i++) {
    const a = right - golden * (right - left)
    const b = left + golden * (right - left)
    if (scaleAt(a) < scaleAt(b)) left = a
    else right = b
  }
  const D = (left + right) / 2
  const c = scaleAt(D)
  const N = q.map((qi, i) => noAt(c * shape[i], qi, D))
  // Fund exactly: every winning scenario pays shared + ΣN = ante.
  const shared = Math.max(0, ante - sum(N))
  return q.map((qi, i) => {
    const pool = { YES: N[i] + shared, NO: N[i] }
    return {
      poolYes: pool.YES,
      poolNo: pool.NO,
      p: pForProbability(pool, qi),
      prob: qi,
    }
  })
}

// cpmm-multi-2 creation pools for answers that sum to one. The √variance closed form
// where it gives every answer at least half the depth it aims for
// (cpmmMulti2SumToOneTargetDepths; point liquidity is q(1 − q)/W, GP13), and the exact
// solution of the same shape otherwise, including where the closed form doesn't exist
// at all (GP19a). Its exact funding starves the long shots well before any pool goes
// negative: at 30 answers with a 58.5% favourite each 1.4% answer gets 0.2% of its
// target depth, and Ṁ1 moves it to 36% on a Ṁ1,000 market. Two front-runners near 50%
// with a few 1% long shots already leave those long shots about 5% of their target at 6
// answers, and can have no closed-form pools at all at 7. Either way every answer opens
// at its target and every winning scenario pays exactly the ante.
export function cpmmMulti2SumToOneCreationPools(q: number[], ante: number) {
  const n = q.length
  if (n >= 2 && cpmmMulti2SumToOneFeasible(q)) {
    const pools = cpmmMulti2SumToOnePools(q, ante)
    const target = cpmmMulti2SumToOneTargetDepths(q, ante)
    const depth = (x: { poolYes: number; poolNo: number; p: number }) =>
      (1 - x.p) * x.poolYes + x.p * x.poolNo
    if (pools.every((x, i) => depth(x) >= target[i] / 2)) return pools
  }
  return cpmmMulti2MaxDepthPools(q, ante)
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
// probs; don't rearrange existing depth") is to MERGE a Δ = amount ante creation
// (cpmmMulti2SumToOneCreationPools, so the exact √variance shape wherever the closed form would
// starve an answer) computed at the CURRENT probabilities into the existing reserves, then re-price
// each answer's p to hold its probability. Properties (proofs/liquidity_add_split.py, GP17): each prob is preserved (unique
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
  const delta = cpmmMulti2SumToOneCreationPools(probs, amount)
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
  // √variance closed form's delta has dY_i < 0 on some answers, and a large enough add (or
  // drizzle, which accumulates to the same bound) drives a merged poolYes < 0. The delta
  // now comes from creation's rule, which solves the shape exactly wherever the closed
  // form fails, so it's positive everywhere; the sanity check stays as a backstop. Rather
  // than cap or reject (drizzle must never brick), the fallback is per-answer lossless
  // adds (GP19e: floated p is the GP6a weight — sane and prob-preserving for ANY positive
  // reserves; the same op as a per-answer addLiquidity, so conservation is inherited),
  // weighted by the depth creation would give each answer.
  // The per-answer adds also stand in whenever some answer is outside the 1%-99% band
  // bets are held to (isDeepenableProb), or merging the creation shape would carry some
  // answer's p out of [0.01, 0.99] (further out than it already was), where it would be
  // left with next to no depth on one side. The merge re-derives every answer's p, and
  // for an answer near 0% or 100% that can move p toward the answer's price while the
  // pool stays lopsided: an answer at 1e-17 with p = 0.05 is priced by 1e-13 of NO, so a
  // trillionth of a mana moves it to 70%, below what the arbitrage's arithmetic can
  // resolve. Only answers inside the band take the per-answer adds, which keeps their p
  // inside too; the rest keep their pools and p. Callers leave the subsidy pending if no
  // answer can take it (canDeployCpmmMulti2Liquidity).
  const keepsPInBand = (id: string) => {
    const p = result[id].p
    return (
      (p >= MIN_CPMM_PROB && p <= MAX_CPMM_PROB) ||
      Math.abs(p - 0.5) <= Math.abs(poolsByAnswer[id].p - 0.5)
    )
  }
  const deepenable = deepenableAnswerIds(poolsByAnswer)
  if (
    deepenable.length < answerIds.length ||
    !answerIds.every(
      (id) => isSanePoolYesNo(result[id].pool, result[id].p) && keepsPInBand(id)
    )
  ) {
    const depth = (id: string) => {
      const q = probs[answerIds.indexOf(id)]
      return Math.sqrt(q * (1 - q))
    }
    const totalDepth = sumBy(deepenable, depth)
    answerIds.forEach((id) => {
      const { pool, p } = poolsByAnswer[id]
      if (!deepenable.includes(id)) {
        result[id] = { pool, p, liquidity: 0 }
        return
      }
      const share = (amount * depth(id)) / totalDepth
      const { newPool, newP } = addCpmmLiquidity(pool, p, share)
      const liquidity =
        getCpmmLiquidity(newPool, newP) - getCpmmLiquidity(pool, newP)
      result[id] = { pool: newPool, p: newP, liquidity }
    })
  }
  return result
}

const odds = (q: number) => q / (1 - q)

// cpmm-multi-2: grows a listed answer's YES − NO by `delta`, as splitting Other
// asks (addAnswerToCpmmMulti2Pools), holding its price wherever its p can stay
// in [0.01, 0.99]. `cost` is the NO it adds, which comes out of the liquidity
// budget, or frees into it when negative. In order of preference:
// 1. Add delta YES, or remove delta NO, and float p up to hold the price.
//    Adding YES keeps the pool deeper; removing NO, where NO is the bigger
//    side, moves p less. Raising p keeps a pool well-conditioned below 99%.
// 2. Shrink the pool in proportion, by at most half, which holds both the price
//    and p; only an answer with more NO than YES grows YES − NO this way.
// 3. Add delta YES and as much liquidity on both sides as brings p to 0.99,
//    within the budget.
// 4. Otherwise the price gives a little: keep p, or raise it to 0.99 below 99%,
//    and remove delta NO or add delta YES, whichever moves the price less. The
//    new Other takes up what the price gave, so the answers still sum to one.
// `upTo` is the last of these to try.
const foldIntoListedAnswer = (
  pool: { YES: number; NO: number },
  p: number,
  delta: number,
  budget: number,
  upTo: 'free' | 'budget' | 'any'
):
  | { pool: { YES: number; NO: number }; p: number; cost: number }
  | undefined => {
  const { YES: y, NO: n } = pool
  if (!(delta > 0)) return { pool, p, cost: 0 }
  const prob = getCpmmProbability(pool, p)
  const grown = { pool: { YES: y + delta, NO: n }, cost: 0 }
  const trimmed =
    n - delta > y
      ? { pool: { YES: y, NO: n - delta }, cost: -delta }
      : undefined
  if (prob <= MAX_CPMM_PROB)
    for (const option of trimmed ? [grown, trimmed] : [grown]) {
      const newP = pForProbability(option.pool, prob)
      if (newP <= MAX_CPMM_PROB) return { ...option, p: newP }
    }
  if (n - y >= 2 * delta) {
    const scale = 1 - delta / (n - y)
    return {
      pool: { YES: y * scale, NO: n * scale },
      p,
      cost: -n * (1 - scale),
    }
  }
  if (upTo === 'free') return undefined
  if (prob < MAX_CPMM_PROB) {
    const m = odds(MAX_CPMM_PROB) / odds(prob)
    const topUp = (y + delta - m * n) / (m - 1)
    if (topUp <= budget)
      return {
        pool: { YES: y + delta + topUp, NO: n + topUp },
        p: MAX_CPMM_PROB,
        cost: topUp,
      }
  }
  if (upTo === 'budget') return undefined
  return {
    ...(trimmed ?? grown),
    p: prob <= MAX_CPMM_PROB ? Math.max(p, MAX_CPMM_PROB) : p,
  }
}

// cpmm-multi-2: the least an answer opens at when it's added to a sum-to-one
// market. Nobody picks it. A contender worth more gets bought up from there,
// and a long shot barely moves anything.
export const NEW_ANSWER_PROB = 0.02

// What an added answer opens at: half of what Other has, as cpmm-multi-1's
// split gives it (createAnswerAndSumAnswersToOne), and never less than
// NEW_ANSWER_PROB. Other priced every unlisted answer together, and halving it
// claims nothing about which of them the new answer is. It also bounds what
// the first buyer can take from the pools by Other's own price. A fixed 2%
// opening didn't: an Other at 99% is a near-certain NO at 1%, so on a market
// opened with Other alone, a Ṁ100 buy of the first answer added took 1,184
// shares and left the pools paying Ṁ15 if it won. Opening at half, the same
// buy takes 192, as it does on cpmm-multi-1. Below 4% Other the floor applies,
// and Other gives what it can toward it, down to 1%.
export const newAnswerOpeningProb = (otherProb: number) =>
  Math.max(NEW_ANSWER_PROB, otherProb / 2)

const clampP = (p: number, [lo, hi] = [MIN_CPMM_PROB, MAX_CPMM_PROB]) =>
  Math.min(hi, Math.max(lo, p))

// cpmm-multi-2: the pools after adding an answer to a sum-to-one market, which
// splits "Other" into the new answer and a new Other. Other's pool belongs to
// every liquidity provider, so the split pays them exactly what Other's pool
// did, whichever answer wins, plus the fee for adding the answer. It splits the
// shares as cpmm-multi-1 does (createAnswerAndSumAnswersToOne):
// - Other's YES beyond its NO goes into both parts, as YES in Other pays
//   whichever of them wins.
// - Its NO beyond its YES, δ, becomes YES in every listed answer, as NO in
//   Other pays exactly when one of them wins. Each listed answer takes it
//   holding its price (foldIntoListedAnswer), paying for any liquidity that
//   needs out of the new Other's share, up to half of it.
// - The rest of Other's pool, as many YES as NO, is mana, and so is the fee.
//   The new answer's NO side takes the fee's worth, or half if there's less,
//   and the new Other's the rest. The fee is tiered by the market's liquidity
//   per answer, so the new answer gets a pool of its own about as deep as the
//   others', not a sliver of Other's.
// Every outcome then pays the fee more than it did, and nothing else changes.
// A pool's p sets its prices without moving any value, so the prices come
// last. The new answer opens at newAnswerOpeningProb(what Other has), which
// comes out of the new Other down to 1%. The listed answers keep their prices unless that leaves
// some still to find, which they give up in proportion to their prices. An
// answer's p falls with its price and stays in [0.01, 0.99]. Where one
// couldn't give its share, every pool first takes the same YES out of the new
// Other's NO, which pays the same whichever answer wins and leaves each p more
// room. Undefined if even that can't make room, which takes an answer above
// 99%.
export function addAnswerToCpmmMulti2Pools(
  poolsByAnswer: {
    [answerId: string]: { pool: { YES: number; NO: number }; p: number }
  },
  otherAnswerId: string,
  newAnswerId: string,
  answerCost: number
) {
  const { YES: y, NO: n } = poolsByAnswer[otherAnswerId].pool
  const fee = Math.max(0, answerCost)
  const delta = Math.max(0, n - y)
  const mana = fee + Math.min(y, n)
  if (!(mana > 0)) return undefined
  const newNo = fee > 0 ? Math.min(fee, mana / 2) : mana / 2

  // Listed answers that hold their price without the budget go first; the rest
  // take it cheapest first, and any it can't cover gives a little of its price.
  const listed: {
    [answerId: string]: { pool: { YES: number; NO: number }; p: number }
  } = {}
  let budget = (mana - newNo) / 2
  let cost = 0
  const pending: string[] = []
  for (const [id, { pool, p }] of Object.entries(poolsByAnswer)) {
    if (id === otherAnswerId) continue
    const folded = foldIntoListedAnswer(pool, p, delta, 0, 'free')
    if (!folded) {
      pending.push(id)
      continue
    }
    cost += folded.cost
    budget -= folded.cost
    listed[id] = { pool: folded.pool, p: folded.p }
  }
  const topUpCost = (id: string) => {
    const { pool, p } = poolsByAnswer[id]
    const m = odds(MAX_CPMM_PROB) / odds(getCpmmProbability(pool, p))
    return m > 1 ? (pool.YES + delta - m * pool.NO) / (m - 1) : Infinity
  }
  for (const id of sortBy(pending, topUpCost)) {
    const { pool, p } = poolsByAnswer[id]
    const folded = foldIntoListedAnswer(pool, p, delta, budget, 'any')!
    cost += folded.cost
    budget -= folded.cost
    listed[id] = { pool: folded.pool, p: folded.p }
  }

  const yesOver = Math.max(0, y - n)
  const otherNo = mana - newNo - cost
  const listedIds = Object.keys(listed)
  const probs = mapValues(listed, ({ pool, p }) => getCpmmProbability(pool, p))
  // What Other had, plus whatever a listed price gave.
  const room = 1 - sum(Object.values(probs))
  // A listed answer's p stays in [0.01, 0.99], or no further out than it was.
  const bounds = (id: string): [number, number] => {
    const { p } = poolsByAnswer[id]
    return [Math.min(MIN_CPMM_PROB, p), Math.max(MAX_CPMM_PROB, p)]
  }

  // What Other has sets what the new answer opens at. A market opened with
  // Other alone sums to one only from this split, so its first answer and its
  // new Other open at 50% each.
  const openAt = newAnswerOpeningProb(room)

  // The new answer's and the new Other's pools and prices with `sets` YES
  // added to every pool, out of the new Other's NO, and what that leaves the
  // listed answers to keep between them.
  const partsAt = (sets: number) => {
    const newPool = { YES: yesOver + sets + newNo, NO: newNo }
    const otherPool = { YES: yesOver + otherNo, NO: otherNo - sets }
    const newProb = getCpmmProbability(
      newPool,
      clampP(pForProbability(newPool, openAt))
    )
    // The new Other gives what it can toward the new answer, down to 1%.
    const otherTarget =
      room < MIN_CPMM_PROB ? room : Math.max(MIN_CPMM_PROB, room - newProb)
    const otherP = clampP(pForProbability(otherPool, otherTarget))
    const keep = 1 - newProb - getCpmmProbability(otherPool, otherP)
    return { newPool, otherPool, otherP, keep }
  }

  const splitAt = (sets: number) => {
    const { newPool, otherPool, otherP, keep } = partsAt(sets)
    const withSets = (pool: { YES: number; NO: number }) => ({
      YES: pool.YES + sets,
      NO: pool.NO,
    })
    // Each listed answer at s of its price, as near as its p allows.
    const pAt = (id: string, s: number) =>
      s === 1 && sets === 0
        ? listed[id].p
        : clampP(
            pForProbability(withSets(listed[id].pool), s * probs[id]),
            bounds(id)
          )
    const keptAt = (s: number) =>
      sumBy(listedIds, (id) =>
        getCpmmProbability(withSets(listed[id].pool), pAt(id, s))
      )
    if (keptAt(0) > keep) return undefined
    let [lo, hi] = [0, 1]
    // Within rounding of keeping every price, they keep them exactly.
    if (keptAt(1) <= keep + 1e-12) lo = 1
    else
      for (let i = 0; i < 100; i++) {
        const mid = (lo + hi) / 2
        if (keptAt(mid) > keep) hi = mid
        else lo = mid
      }
    const pools: {
      [answerId: string]: { pool: { YES: number; NO: number }; p: number }
    } = {}
    for (const id of listedIds)
      pools[id] = { pool: withSets(listed[id].pool), p: pAt(id, lo) }
    pools[otherAnswerId] = { pool: otherPool, p: otherP }
    // The new answer takes exactly what's left, so the answers sum to one.
    const left =
      1 -
      sumBy(Object.values(pools), ({ pool, p }) => getCpmmProbability(pool, p))
    // Rounding in what's left can carry its p a hair past an edge it was held
    // at, where it stays, leaving the sum off by no more than the rounding.
    const newP = clampP(pForProbability(newPool, left))
    if (!(Math.abs(getCpmmProbability(newPool, newP) - left) <= 1e-12))
      return undefined
    pools[newAnswerId] = { pool: newPool, p: newP }
    return pools
  }

  // The share of its price every listed answer keeps, if each can.
  const { keep } = partsAt(0)
  const share = keep >= 1 - room - 1e-12 ? 1 : keep / (1 - room)
  // An answer's p falls with its price, so one near the bottom of its bounds
  // can't give its share. YES added to its pool raises the p any price needs,
  // so every pool takes the same YES, the fewest that let each give its share,
  // out of the new Other's NO, which keeps at least half.
  const setsNeeded = (id: string) => {
    const target = share * probs[id]
    const { YES, NO } = listed[id].pool
    const [lo] = bounds(id)
    const sets = (odds(lo) * NO) / odds(target) - YES
    return isFinite(sets) ? sets : 0
  }
  const most = Math.max(0, otherNo / 2)
  const sets =
    share >= 1 ? 0 : Math.min(most, Math.max(0, ...listedIds.map(setsNeeded)))
  return splitAt(sets) ?? (sets < most ? splitAt(most) : undefined)
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
  // Every answer takes an equal share, as on cpmm-multi-1: resolution credits
  // each whole-market provider with amount / n of every answer
  // (getIndependentMultiFixedPayouts), so any other split would move value
  // between providers. An answer outside 1%-99% can't be deepened
  // (isDeepenableProb), so its share waits as that answer's pending subsidy,
  // which drizzleAnswer adds once it's back in the band and resolution pays out.
  // Callers leave the whole subsidy pending when no answer can take any
  // (canDeployCpmmMulti2Liquidity).
  const deepenable = deepenableAnswerIds(poolsByAnswer)
  const amountPerAnswer =
    amount / Math.max(1, Object.keys(poolsByAnswer).length)
  return mapValues(poolsByAnswer, ({ pool, p }, id) => {
    if (!deepenable.includes(id))
      return { pool, p, liquidity: 0, pendingSubsidy: amountPerAnswer }
    const { newPool, liquidity, newP } = addCpmmLiquidity(
      pool,
      p,
      amountPerAnswer
    )
    return { pool: newPool, p: newP, liquidity, pendingSubsidy: 0 }
  })
}

const deepenableAnswerIds = (poolsByAnswer: {
  [answerId: string]: { pool: { YES: number; NO: number }; p: number }
}) =>
  Object.keys(poolsByAnswer).filter((id) =>
    isDeepenableProb(
      getCpmmProbability(poolsByAnswer[id].pool, poolsByAnswer[id].p)
    )
  )

// Whether a cpmm-multi-2 liquidity add has any answer it can deepen. With none,
// every answer outside 1%-99%, the subsidy stays pending; resolution pays
// pending subsidy out.
export const canDeployCpmmMulti2Liquidity = (poolsByAnswer: {
  [answerId: string]: { pool: { YES: number; NO: number }; p: number }
}) => deepenableAnswerIds(poolsByAnswer).length > 0

// The pool for a single answer at `prob`, minted out of `amount` mana worth of
// shares. 1 mana mints one YES and one NO share, but holding both sides equally
// would put the answer at 50%, so the excess on the cheap side is thrown away.
export const getPoolAtProb = (prob: number, amount: number) =>
  prob < 0.5
    ? { YES: amount, NO: (prob / (1 - prob)) * amount }
    : { YES: ((1 - prob) / prob) * amount, NO: amount }

// Seed pools for a brand new cpmm-multi-1 market whose answers start at `probs`,
// backed by exactly `ante` mana.
//
// When exactly one answer resolves YES, `amount` mana mints `amount` YES shares
// of *every* answer (a full set), and a NO share of one answer is a YES share of
// each other answer. So we spread the ante over the answers, keep only the
// shares that hold each answer at its target probability, and then recombine the
// leftovers into full sets to add back — the same recycling
// addCpmmMultiLiquidityAnswersSumToOne does when subsidising a live market.
export const getInitialAnswerPools = (
  probs: number[],
  ante: number,
  shouldAnswersSumToOne: boolean
) => {
  const n = probs.length
  // Independent answers are each their own binary market with their own ante.
  if (!shouldAnswersSumToOne || n === 1)
    return probs.map((prob) => getPoolAtProb(prob, ante / n))

  const pools = probs.map(() => ({ YES: 0, NO: 0 }))
  let amountRemaining = ante
  // Each round recovers a fraction of the previous one, so this converges
  // geometrically; the cap is just a guard against a pathological ratio.
  for (let round = 0; round < 1000 && amountRemaining > EPSILON; round++) {
    const amount = amountRemaining / n
    // Shares minted this round that the target probability left unused.
    const unusedYes = probs.map(() => 0)
    const unusedNo = probs.map(() => 0)
    probs.forEach((prob, i) => {
      const pool = getPoolAtProb(prob, amount)
      pools[i].YES += pool.YES
      pools[i].NO += pool.NO
      unusedYes[i] = amount - pool.YES
      unusedNo[i] = amount - pool.NO
    })
    // An unused NO share of one answer is a YES share of every other answer, so
    // we can rebuild (and re-spend) as many full sets as the scarcest answer has.
    const totalUnusedNo = sum(unusedNo)
    amountRemaining = Math.min(
      ...probs.map((_, i) => unusedYes[i] + totalUnusedNo - unusedNo[i])
    )
  }
  return pools
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
