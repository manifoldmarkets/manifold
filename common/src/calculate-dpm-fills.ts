import { sortBy } from 'lodash'
import { fill, LimitBet, maker } from './bet'
import {
  dpmBuyShares,
  dpmCost,
  dpmPinnedStep,
  dpmSharesToReachProb,
  getDpmProbability,
} from './calculate-dpm'
import { MAX_CPMM_PROB, MIN_CPMM_PROB } from './contract'
import { noFees } from './fees'
import { floatingEqual } from './util/math'

export type DpmState = {
  pool: { YES: number; NO: number }
}

/**
 * Full Phase 1 / Phase 2 / Phase 3 matching for DPM markets, matching
 * the spec in `dpm-explainer.md`.
 *
 * Returns the same taker/maker/state shape as `computeFills` on CPMM
 * so callers can reuse the existing `executeNewBetResult` pipeline.
 *
 * - Price is clamped to [MIN_CPMM_PROB, MAX_CPMM_PROB] (1%..99%).
 *   Residual `amount` after hitting the cap is either rested as a
 *   synthetic limit at the cap price (if no explicit limitProb) or
 *   just truncated (already handled by clamp on limitProb).
 * - DPM has no platform/liquidity fees; every `fill.fees` is `noFees`.
 */
export const computeDpmFills = (
  state: DpmState,
  outcome: 'YES' | 'NO',
  betAmount: number,
  initialLimitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number | undefined }
) => {
  if (isNaN(betAmount)) {
    throw new Error(`Invalid bet amount: ${betAmount}`)
  }
  if (isNaN(initialLimitProb ?? 0)) {
    throw new Error(`Invalid limitProb: ${initialLimitProb}`)
  }

  const now = Date.now()

  const hardMax = MAX_CPMM_PROB
  const hardMin = MIN_CPMM_PROB
  // Clamp limit to the legal band.
  const clampedLimit =
    initialLimitProb === undefined
      ? undefined
      : Math.min(hardMax, Math.max(hardMin, initialLimitProb))

  // For a YES taker, the effective price ceiling is min(limit, hardMax).
  // For a NO taker, the effective price floor is max(limit, hardMin).
  const priceCeiling = outcome === 'YES' ? clampedLimit ?? hardMax : hardMax
  const priceFloor = outcome === 'NO' ? clampedLimit ?? hardMin : hardMin

  const sortedBets = sortBy(
    unfilledBets.filter(
      (b) =>
        b.outcome !== outcome &&
        !b.isCancelled &&
        !b.isFilled &&
        (b.expiresAt ? b.expiresAt > now : true)
    ),
    // Best prices first for the taker.
    //   YES taker wants to buy at the lowest maker NO-limit price (i.e.
    //   maker's `limitProb` is the price NO-taker is willing to provide YES at).
    //   NO taker wants the highest maker YES-limit price.
    (b) => (outcome === 'YES' ? b.limitProb : -b.limitProb),
    (b) => b.createdTime
  )

  const takers: fill[] = []
  const makers: maker[] = []
  const ordersToCancel: LimitBet[] = []

  let amount = betAmount
  let pool = { ...state.pool }
  const currentBalanceByUserId = { ...balanceByUserId }

  const pushTaker = (amt: number, shares: number) => {
    if (amt <= 0 || shares <= 0) return
    takers.push({
      matchedBetId: null,
      amount: amt,
      shares,
      timestamp: now,
      fees: noFees,
    })
  }

  const pushTakerAgainstMaker = (
    matched: LimitBet,
    amt: number,
    shares: number
  ) => {
    if (amt <= 0 || shares <= 0) return
    takers.push({
      matchedBetId: matched.id,
      amount: amt,
      shares,
      timestamp: now,
      fees: noFees,
    })
  }

  // Strictly beyond limit. Reaching exactly the limit price is fine: Phase 2
  // pinning at that price doesn't move the pool further, and Phase 3 stops
  // at the same cap via `fillAgainstPoolToTarget`'s no-op semantics.
  const probCrossesLimitForTaker = (prob: number) =>
    outcome === 'YES' ? prob > priceCeiling : prob < priceFloor

  // DPM-only fill up to a target probability p*.
  // Returns (sharesBought, costSpent) and mutates pool + amount.
  const fillAgainstPoolToTarget = (targetProb: number) => {
    if (amount <= 0) return
    const currentProb = getDpmProbability(pool)
    if (outcome === 'YES' && currentProb >= targetProb) return
    if (outcome === 'NO' && currentProb <= targetProb) return

    const { cost: maxCost } = dpmSharesToReachProb(pool, targetProb, outcome)
    const spend = Math.min(amount, maxCost)
    if (spend <= 0) return
    const { shares, newPool } = dpmBuyShares(pool, outcome, spend)
    pool = newPool
    amount -= spend
    pushTaker(spend, shares)
  }

  // Fill purely against the pool (no limit), up to either running out of
  // budget or hitting the global price cap.
  const fillAgainstPoolUnbounded = () => {
    if (amount <= 0) return
    const targetProb = outcome === 'YES' ? priceCeiling : priceFloor
    fillAgainstPoolToTarget(targetProb)
  }

  // Phase 2: pinned at makerPrice p*, alternating share accumulation between
  // maker and taker.
  const pinnedFillAgainstMaker = (matched: LimitBet) => {
    const pStar = matched.limitProb
    // Taker contributes (1 - p*) per unit pool for a YES taker on a NO-maker,
    // (symmetric) so the fractional split at fixed p* is:
    //   YES taker contributes (1 - p*) · ΔC, NO maker contributes p* · ΔC.
    //   (Inversely for a NO taker.)
    const takerShareOfDC = outcome === 'YES' ? 1 - pStar : pStar
    const makerShareOfDC = outcome === 'YES' ? pStar : 1 - pStar
    if (takerShareOfDC <= 0 || makerShareOfDC <= 0) return

    const remainingMakerBudget = matched.orderAmount - matched.amount
    const makerUserBalance = currentBalanceByUserId[matched.userId]
    const availableMakerBudget = Math.min(
      remainingMakerBudget,
      makerUserBalance !== undefined && makerUserBalance < 0
        ? 0
        : makerUserBalance ?? remainingMakerBudget
    )
    if (availableMakerBudget <= 0) {
      ordersToCancel.push(matched)
      return
    }

    // ΔC such that taker spends all of `amount` OR maker spends all of its budget.
    const dcFromTaker = amount / takerShareOfDC
    const dcFromMaker = availableMakerBudget / makerShareOfDC
    const dC = Math.min(dcFromTaker, dcFromMaker)
    if (dC <= 0) return

    const takerSpend = takerShareOfDC * dC
    const makerSpend = makerShareOfDC * dC
    const { newPool, dy, dn } = dpmPinnedStep(pool, pStar, dC)
    const takerShares = outcome === 'YES' ? dy : dn
    const makerShares = outcome === 'YES' ? dn : dy
    pool = newPool
    amount -= takerSpend

    if (takerShares > 0) {
      pushTakerAgainstMaker(matched, takerSpend, takerShares)
      makers.push({
        bet: matched,
        amount: makerSpend,
        shares: makerShares,
        timestamp: now,
      })
    }

    if (makerUserBalance !== undefined) {
      currentBalanceByUserId[matched.userId] =
        makerUserBalance - Math.max(0, makerSpend)
      const adjusted = currentBalanceByUserId[matched.userId]
      if (adjusted !== undefined && adjusted <= 0) {
        ordersToCancel.push(matched)
      }
    }
  }

  for (const matched of sortedBets) {
    if (amount <= 0) break
    const pStar = matched.limitProb
    const pStarClamped = Math.min(hardMax, Math.max(hardMin, pStar))
    // Maker's limit is strictly outside our acceptable price range — we would
    // cross the global 99/1 cap or the taker's limit before matching. Skip.
    // Matching at exactly the limit price is allowed (and required for
    // same-price order crossing).
    if (outcome === 'YES' && pStarClamped > priceCeiling) break
    if (outcome === 'NO' && pStarClamped < priceFloor) break

    // Phase 1: DPM-only up to maker's price.
    fillAgainstPoolToTarget(pStarClamped)
    if (amount <= 0) break
    if (probCrossesLimitForTaker(getDpmProbability(pool))) break

    // Phase 2: pinned at p*, co-filling maker + taker.
    pinnedFillAgainstMaker(matched)
    // We may have the exhausted maker (its orderAmount <= filled). In that case
    // continue to the next maker at the same pinned price (Phase 3 is just
    // the next loop iteration).
    if (amount <= 0) break
  }

  // Phase 3: DPM continues against the pool to the global price cap.
  if (amount > 0 && !probCrossesLimitForTaker(getDpmProbability(pool))) {
    fillAgainstPoolUnbounded()
  }

  // If there's residual amount and no explicit limit, the residual is simply
  // refunded (we never push past the 1/99% cap).
  const probBefore = getDpmProbability(state.pool)
  const probAfter = getDpmProbability(pool)

  return {
    takers,
    makers,
    ordersToCancel,
    newPool: pool,
    probBefore,
    probAfter,
    amountRemaining: Math.max(0, amount),
    totalFees: noFees,
  }
}

/**
 * Convenience wrapper: same signature as `computeCpmmBet` but for DPM.
 * Produces the fields needed to build a Bet row + return to client.
 */
export const computeDpmBet = (
  state: DpmState,
  outcome: 'YES' | 'NO',
  initialBetAmount: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number }
) => {
  const result = computeDpmFills(
    state,
    outcome,
    initialBetAmount,
    limitProb,
    unfilledBets,
    balanceByUserId
  )
  const { takers, makers, ordersToCancel, newPool, probBefore, probAfter } =
    result

  const takerAmount = takers.reduce((s, t) => s + t.amount, 0)
  const takerShares = takers.reduce((s, t) => s + t.shares, 0)
  // If the user placed a limit order (and we didn't fill it entirely),
  // the order rests for `initialBetAmount`. Otherwise only the filled
  // portion is the bet (same rule CPMM uses).
  const orderAmount = limitProb !== undefined ? initialBetAmount : takerAmount
  const isFilled = floatingEqual(orderAmount, takerAmount)

  return {
    orderAmount,
    amount: takerAmount,
    shares: takerShares,
    isFilled,
    fills: takers,
    probBefore,
    probAfter,
    makers,
    ordersToCancel,
    newPool,
    C: dpmCost(newPool.YES, newPool.NO),
  }
}
