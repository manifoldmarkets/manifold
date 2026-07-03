import { MAX_CPMM_PROB, MIN_CPMM_PROB } from 'common/contract'
import { Dictionary, first, groupBy, mapValues, sum, sumBy } from 'lodash'
import { Answer } from './answer'
import { Bet, LimitBet, maker } from './bet'
import {
  calculateAmountToBuySharesFixedP,
  computeFills,
  getCpmmProbability,
} from './calculate-cpmm'
import { Fees, getFeesSplit, getTakerFee, noFees, sumAllFees } from './fees'
import { binarySearch } from './util/algos'
import { floatingEqual } from './util/math'
import { addObjects } from './util/object'

const DEBUG = false
export type ArbitrageBetArray = ReturnType<typeof combineBetsOnSameAnswers>
const noFillsReturn = (
  outcome: string,
  answer: Answer,
  collectedFees: Fees
) => ({
  newBetResult: {
    outcome,
    answer,
    takers: [],
    makers: [] as maker[],
    ordersToCancel: [] as LimitBet[],
    cpmmState: {
      pool: { YES: answer.poolYes, NO: answer.poolNo },
      p: answer.p,
      collectedFees,
    },
    totalFees: { creatorFee: 0, liquidityFee: 0, platformFee: 0 },
  },
  otherBetResults: [] as ArbitrageBetArray,
})
export function calculateCpmmMultiArbitrageBet(
  answers: Answer[],
  answerToBuy: Answer,
  outcome: 'YES' | 'NO',
  betAmount: number,
  initialLimitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  collectedFees: Fees
) {
  const limitProb =
    initialLimitProb !== undefined
      ? initialLimitProb
      : outcome === 'YES'
      ? MAX_CPMM_PROB
      : MIN_CPMM_PROB
  if (
    (answerToBuy.prob < MIN_CPMM_PROB && outcome === 'NO') ||
    (answerToBuy.prob > MAX_CPMM_PROB && outcome === 'YES') ||
    // Fixes limit order fills at current price when limitProb is set to a diff price and user has shares to redeem
    (answerToBuy.prob > limitProb && outcome === 'YES') ||
    (answerToBuy.prob < limitProb && outcome === 'NO')
  ) {
    return noFillsReturn(outcome, answerToBuy, collectedFees)
  }
  const result =
    outcome === 'YES'
      ? calculateCpmmMultiArbitrageBetYes(
          answers,
          answerToBuy,
          betAmount,
          limitProb,
          unfilledBets,
          balanceByUserId,
          collectedFees
        )
      : calculateCpmmMultiArbitrageBetNo(
          answers,
          answerToBuy,
          betAmount,
          limitProb,
          unfilledBets,
          balanceByUserId,
          collectedFees
        )
  if (floatingEqual(sumBy(result.newBetResult.takers, 'amount'), 0)) {
    // No trades matched.
    const { outcome, answer } = result.newBetResult
    return noFillsReturn(outcome, answer, collectedFees)
  }
  return result
}

export function calculateCpmmMultiArbitrageYesBets(
  answers: Answer[],
  answersToBuy: Answer[],
  betAmount: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  collectedFees: Fees,
  // cpmm-multi-2 (per-answer p + reversible-limit auto-arb) routes the basket buy through the
  // direct, non-overshooting "Approach C" solve; cpmm-multi-1 keeps the frozen v1 nested
  // search byte-identically. REQUIRED — pass contract.mechanism. Deliberately no default:
  // a silent v1 default let a preview path (numeric-bet-panel) show v1 fills for a v2
  // market; the compiler now forces every caller to say which market it is pricing.
  arbVersion: 'cpmm-multi-1' | 'cpmm-multi-2'
) {
  const result = calculateCpmmMultiArbitrageBetsYes(
    answers,
    answersToBuy,
    betAmount,
    limitProb,
    unfilledBets,
    balanceByUserId,
    collectedFees,
    arbVersion
  )
  if (
    floatingEqual(
      sumBy(
        result.newBetResults.map((r) => r.takers),
        'amount'
      ),
      0
    )
  ) {
    // No trades matched.
    result.newBetResults.map((r) => {
      return {
        newBetResult: {
          outcome: r.outcome,
          answer: r.answer,
          takers: [],
          makers: [],
          ordersToCancel: [],
          cpmmState: {
            pool: { YES: r.answer.poolYes, NO: r.answer.poolNo },
            p: r.answer.p,
            collectedFees,
          },
          totalFees: noFees,
        },
        otherBetResults: [],
      }
    })
  }
  return result
}

export type PreliminaryBetResults = ReturnType<typeof computeFills> & {
  answer: Answer
  // iteration index within a multi-buy cycle; 0 is paid with user's amount,
  // >0 iterations are funded by arbitrage extraMana and should be free for the taker.
  iteration?: number
}

// Mutate working state to reflect maker fills and cancellations, so subsequent legs
// cannot reuse the same maker order capacity or balances.
const applyMakersToWorkingState = (
  makers: maker[],
  ordersToCancel: LimitBet[],
  workingUnfilledBetsByAnswer: Dictionary<LimitBet[]>,
  workingBalanceByUserId: { [userId: string]: number }
) => {
  for (const maker of makers) {
    const { bet, amount, shares } = maker
    if (!bet.answerId) {
      throw new Error('Multi-bet has no answerId')
    }
    if (amount > 0) {
      const prev = workingBalanceByUserId[bet.userId]
      if (prev !== undefined) workingBalanceByUserId[bet.userId] = prev - amount
    }
    // Update the bet's filled amount in-place inside our working unfilled bets map
    const arr = workingUnfilledBetsByAnswer[bet.answerId] ?? []
    const idx = arr.findIndex((b) => b.id === bet.id)
    if (idx >= 0) {
      const updated = { ...arr[idx] }
      updated.amount = (updated.amount ?? 0) + amount
      updated.shares = (updated.shares ?? 0) + shares
      arr[idx] = updated
      workingUnfilledBetsByAnswer[bet.answerId] = arr
    }
  }
  if (ordersToCancel.length) {
    const cancelIds = new Set(ordersToCancel.map((b) => b.id))
    for (const [answerId, arr] of Object.entries(workingUnfilledBetsByAnswer)) {
      workingUnfilledBetsByAnswer[answerId] = arr.filter(
        (b) => !cancelIds.has(b.id)
      )
    }
  }
}

function calculateCpmmMultiArbitrageBetsYes(
  initialAnswers: Answer[],
  initialAnswersToBuy: Answer[],
  initialBetAmount: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  collectedFees: Fees,
  arbVersion: 'cpmm-multi-1' | 'cpmm-multi-2'
) {
  if (arbVersion === 'cpmm-multi-2') {
    return calculateCpmmMultiArbitrageBetsYesV2(
      initialAnswers,
      initialAnswersToBuy,
      initialBetAmount,
      limitProb,
      unfilledBets,
      balanceByUserId,
      collectedFees
    )
  }
  // Maintain mutable snapshots of unfilled orders and maker balances across the whole multi-buy
  let workingUnfilledBetsByAnswer = groupBy(unfilledBets, (bet) => bet.answerId)
  let workingBalanceByUserId = { ...balanceByUserId }
  const noBetResults: PreliminaryBetResults[] = []
  const yesBetResults: PreliminaryBetResults[] = []

  let updatedAnswers = initialAnswers
  let amountToBet = initialBetAmount
  let iteration = 0
  while (amountToBet > 0.01) {
    const answersToBuy = updatedAnswers.filter((a) =>
      initialAnswersToBuy.map((an) => an.id).includes(a.id)
    )
    // buy equal number of shares in each answer
    const yesSharePriceSum = sumBy(answersToBuy, 'prob')
    const maxYesShares = amountToBet / yesSharePriceSum
    let yesAmounts: number[] = []
    binarySearch(0, maxYesShares, (yesShares) => {
      yesAmounts = answersToBuy.map(({ id, poolYes, poolNo, p }) =>
        calculateAmountToBuySharesFixedP(
          { pool: { YES: poolYes, NO: poolNo }, p, collectedFees },
          yesShares,
          'YES',
          workingUnfilledBetsByAnswer[id] ?? [],
          workingBalanceByUserId
        )
      )

      const totalYesAmount = sum(yesAmounts)
      return totalYesAmount - amountToBet
    })

    const {
      noBuyResults,
      yesBets,
      newUpdatedAnswers,
      updatedUnfilledBetsByAnswer,
      updatedBalanceByUserId,
    } = getBetResultsAndUpdatedAnswers(
      answersToBuy,
      yesAmounts,
      updatedAnswers,
      limitProb,
      // Flatten working unfilled bets for API; it will reconstruct its own map
      Object.values(workingUnfilledBetsByAnswer).flat(),
      workingBalanceByUserId,
      collectedFees
    )
    // Annotate iteration index so we can mark taker fills as free beyond the first.
    yesBets.forEach((r) => ((r as PreliminaryBetResults).iteration = iteration))
    noBuyResults.noBetResults.forEach((r) => (r.iteration = iteration))
    workingUnfilledBetsByAnswer = updatedUnfilledBetsByAnswer
    workingBalanceByUserId = updatedBalanceByUserId
    updatedAnswers = newUpdatedAnswers

    amountToBet = noBuyResults.extraMana
    noBetResults.push(...noBuyResults.noBetResults)
    yesBetResults.push(...yesBets)
    iteration++
  }

  const noBetResultsOnBoughtAnswer = combineBetsOnSameAnswers(
    noBetResults,
    'NO',
    updatedAnswers.filter((r) =>
      initialAnswersToBuy.map((a) => a.id).includes(r.id)
    ),
    collectedFees
  )
  const extraFeesPerBoughtAnswer = Object.fromEntries(
    noBetResultsOnBoughtAnswer.map((r) => [r.answer.id, r.totalFees])
  )

  const newBetResults = combineBetsOnSameAnswers(
    yesBetResults,
    'YES',
    updatedAnswers.filter((a) =>
      initialAnswersToBuy.map((an) => an.id).includes(a.id)
    ),
    collectedFees,
    true,
    extraFeesPerBoughtAnswer
  )
  // TODO: after adding limit orders, we need to keep track of the possible matchedBetIds in the no redemption bets we're throwing away
  const otherBetResults = combineBetsOnSameAnswers(
    noBetResults,
    'NO',
    updatedAnswers.filter(
      (r) => !initialAnswersToBuy.map((a) => a.id).includes(r.id)
    ),
    collectedFees
  )

  return { newBetResults, otherBetResults, updatedAnswers }
}

// cpmm-multi-2 multi-buy: the direct, non-overshooting "Approach C" solve (GP12 / reference
// `tasks/cpmm_multi_2/proofs/reference_solve_c.py`). The DOLLAR-CENTRIC decomposition makes it
// correct-by-construction under resting limits:
//   * each basket answer is bought ONCE, straight up start -> final  (a single rising YES sweep)
//   * each non-basket answer moves ONCE, straight down start -> final (a single falling NO sweep)
// No answer is ever pushed past its settled price, so every resting maker is crossed exactly once,
// in one direction (pinning included). This eliminates v1's transient-overshoot fills: the
// iterate-buy-arb-reinvest loop in calculateCpmmMultiArbitrageBetsYes drives basket answers UP PAST
// their final price and back down, consuming and keeping makers in the transient band (the bug).
//
// Because each answer is touched by exactly one leg (basket = YES, others = NO) and a resting order
// lives on a single answerId, the per-answer maker books are disjoint — there is no cross-leg
// working-state maker mutation to reason about (unlike the v1 share-centric "NO in all" loop).
//
//   solve g (equal YES shares per basket answer) s.t. net spend == budget        [outer bisection]
//     buy g YES shares in each basket answer (limit-aware single rising sweep)
//     solve eta (NO shares in each non-basket answer) s.t. Sum prob == 1          [inner bisection]
//       buy eta NO shares in each non-basket answer (limit-aware single falling sweep)
//     net = basketCost + othersCost - eta*(n - m - 1)   (dollar-centric redemption; m = |basket|)
//
// net is strictly increasing in g (GP12a: dt/dg = Sum_basket prob > 0) and Sum_others prob is
// strictly decreasing in eta (GP5a) — so both bisections are on monotone objectives.
//
// Precondition: `initialAnswers` is the FULL LIVE answer set — every answer participating in
// the sum-to-one constraint. Today that is all of the contract's answers by construction
// (linked answers cannot be individually resolved). If cpmm-multi-2 per-answer NO resolution
// ships (reserved — see the CPMMMulti doc comment in contract.ts), callers must pass the
// unresolved subset; every identity here (n, m, eta*(n - m - 1)) is relative to this array.
function calculateCpmmMultiArbitrageBetsYesV2(
  initialAnswers: Answer[],
  initialAnswersToBuy: Answer[],
  betAmount: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  collectedFees: Fees
) {
  const unfilledBetsByAnswer = groupBy(unfilledBets, (b) => b.answerId)
  const basketIds = new Set(initialAnswersToBuy.map((a) => a.id))
  const others = initialAnswers.filter((a) => !basketIds.has(a.id))
  const n = initialAnswers.length
  const m = initialAnswersToBuy.length

  // m = n is the one structurally infeasible basket: with no other answers to arb down, any
  // g > 0 pushes Sum p past 1, so every evalG is undefined and the bisection collapses to a
  // denormal g where calculateAmountToBuySharesFixedP degenerates to NaN — surfacing as a
  // stack-leaking 'Invalid bet amount' deep in computeFills. Reject up front with the typed
  // error instead (new-bet.ts maps it to a 503).
  if (others.length === 0) {
    throw new CpmmMulti2InvariantError(
      'cpmm-multi-2 YES basket cannot include every answer (m = n is infeasible)',
      { n, m }
    )
  }

  // Evaluate one g: realize the basket YES legs + the arbed OTHER NO legs at the eta that pins
  // Sum prob == 1. Returns undefined when g is infeasible (basket alone already sums >= 1).
  const evalG = (g: number) => {
    // Fresh working snapshots so each g-probe is independent (no maker capacity bleed across probes).
    const workingUnfilledBetsByAnswer = mapValues(unfilledBetsByAnswer, (bets) => [
      ...bets,
    ])
    const workingBalanceByUserId = { ...balanceByUserId }

    // --- basket: buy g YES shares in each basket answer (single rising sweep, limit-aware) ---
    let basketCost = 0
    const yesBetResults = initialAnswersToBuy.map((answer) => {
      const pool = { YES: answer.poolYes, NO: answer.poolNo }
      const state = { pool, p: answer.p, collectedFees }
      const yesAmount = calculateAmountToBuySharesFixedP(
        state,
        g,
        'YES',
        workingUnfilledBetsByAnswer[answer.id] ?? [],
        workingBalanceByUserId
      )
      const result = {
        ...computeFills(
          state,
          'YES',
          yesAmount,
          limitProb,
          workingUnfilledBetsByAnswer[answer.id] ?? [],
          workingBalanceByUserId
        ),
        answer,
      }
      applyMakersToWorkingState(
        result.makers,
        result.ordersToCancel,
        workingUnfilledBetsByAnswer,
        workingBalanceByUserId
      )
      basketCost += sumBy(result.takers, 'amount')
      return result
    })
    const basketSum = sumBy(yesBetResults, (r) =>
      getCpmmProbability(r.cpmmState.pool, r.cpmmState.p)
    )
    const target = 1 - basketSum // required Sum over the non-basket answers
    if (target <= 1e-9) {
      return undefined // basket alone sums to >= 1: this g is infeasible
    }

    // --- inner: eta NO shares in each OTHER answer so their prob-sum == target. Read-only preview
    // (never applies makers) — Sum_others prob is strictly decreasing in eta => unique eta. ---
    const othersSumAtEta = (eta: number) =>
      sumBy(others, (answer) => {
        const pool = { YES: answer.poolYes, NO: answer.poolNo }
        const state = { pool, p: answer.p, collectedFees }
        const noAmount = calculateAmountToBuySharesFixedP(
          state,
          eta,
          'NO',
          workingUnfilledBetsByAnswer[answer.id] ?? [],
          workingBalanceByUserId,
          true
        )
        const { cpmmState } = computeFills(
          state,
          'NO',
          noAmount,
          undefined,
          workingUnfilledBetsByAnswer[answer.id] ?? [],
          workingBalanceByUserId,
          undefined,
          true
        )
        return getCpmmProbability(cpmmState.pool, cpmmState.p)
      })

    let eta = 0
    if (othersSumAtEta(0) > target) {
      let hi = 1
      while (othersSumAtEta(hi) > target && hi < 1e12) hi *= 2
      // othersSum decreasing in eta => comparator (target - othersSum) increasing in eta.
      eta = binarySearch(0, hi, (e) => target - othersSumAtEta(e))
    }

    // --- realize the OTHER NO legs at eta, this time applying maker fills to working state ---
    let othersCost = 0
    const noBetResults = others.map((answer) => {
      const pool = { YES: answer.poolYes, NO: answer.poolNo }
      const state = { pool, p: answer.p, collectedFees }
      const noAmount = calculateAmountToBuySharesFixedP(
        state,
        eta,
        'NO',
        workingUnfilledBetsByAnswer[answer.id] ?? [],
        workingBalanceByUserId,
        true
      )
      const result = {
        ...computeFills(
          state,
          'NO',
          noAmount,
          undefined,
          workingUnfilledBetsByAnswer[answer.id] ?? [],
          workingBalanceByUserId,
          undefined,
          true
        ),
        answer,
      }
      applyMakersToWorkingState(
        result.makers,
        result.ordersToCancel,
        workingUnfilledBetsByAnswer,
        workingBalanceByUserId
      )
      othersCost += sumBy(result.takers, 'amount')
      return result
    })

    // Dollar-centric redemption credit: eta NO shares in each of the (n - m) other answers, with g
    // YES shares in each of the m basket answers, forms complete sets worth eta*(n - m - 1) mana.
    // (For m = 1 this is eta*(n - 2), matching the single-answer calculateCpmmMultiArbitrageBetYes.)
    const net = basketCost + othersCost - eta * (n - m - 1)
    return { yesBetResults, noBetResults, eta, net }
  }

  // outer: net strictly increasing in g (and undefined past the feasibility boundary, which is an
  // upper bound) => bracket by doubling, then bisect on net == betAmount.
  let gHi = 1
  while (true) {
    const r = evalG(gHi)
    if (!r || r.net >= betAmount) break
    gHi *= 2
    if (gHi > 1e9) {
      throw new Error('budget unreachable in cpmm-multi-2 YES basket solve')
    }
  }
  const g = binarySearch(0, gHi, (gg) => {
    const r = evalG(gg)
    return r ? r.net - betAmount : 1 // infeasible g overshoots Sum p => push g lower
  })
  const solved = evalG(g)
  if (!solved) {
    // Reachable e.g. when the basket is ALL answers (m = n: every g is infeasible, target <= 0).
    // Typed so new-bet.ts maps it to a 503 instead of leaking a 500 stack to the API caller.
    throw new CpmmMulti2InvariantError(
      'Invariant failed in cpmm-multi-2 YES basket solve',
      { g, betAmount, n, m }
    )
  }
  const { yesBetResults, noBetResults, eta, net } = solved

  // Redemption fills (mirrors the single-answer path): the NO-in-others legs are internal
  // arbitrage that nets to zero mana/shares; the redemption credit flows to the basket YES legs.
  // netOthers = othersCost - eta*(n - m - 1); summed taker amount across all legs == betAmount.
  const othersCost = sumBy(noBetResults, (r) => sumBy(r.takers, 'amount'))
  const netOthers = othersCost - eta * (n - m - 1)
  for (const noBetResult of noBetResults) {
    noBetResult.takers.push({
      matchedBetId: null,
      amount: -sumBy(noBetResult.takers, 'amount'),
      shares: -sumBy(noBetResult.takers, 'shares'),
      timestamp: Date.now(),
      fees: noFees,
    })
  }
  // Redemption credit to the basket YES legs. The eta NO shares held in each of the (n-m)
  // other answers pay eta*(n-m) iff a basket answer wins and eta*(n-m-1) iff an other wins;
  // the guaranteed floor eta*(n-m-1) is redeemed above, leaving a residual worth eta iff ANY
  // basket answer wins. That residual is eta YES shares in EACH basket answer (whichever basket
  // answer wins pays eta), NOT eta/m: with eta/m a winning basket answer would pay only eta/m,
  // breaking sum-to-one conservation (T_i^YES - T_i^NO must be constant across answers) and
  // destroying mana at resolution to a basket answer. The net mana (netOthers) still splits
  // equally across the m basket legs so summed taker amount == betAmount. For m = 1 this is
  // identical to the single-answer redemption fill (eta shares, netOthers mana).
  for (const yesBetResult of yesBetResults) {
    yesBetResult.takers.push({
      matchedBetId: null,
      amount: netOthers / m,
      shares: eta,
      timestamp: Date.now(),
      fees: noFees,
    })
  }
  void net

  const updatedAnswers = initialAnswers.map((answer) => {
    const r =
      yesBetResults.find((b) => b.answer.id === answer.id) ??
      noBetResults.find((b) => b.answer.id === answer.id)
    if (!r) return answer
    const { pool, p } = r.cpmmState
    return {
      ...answer,
      poolYes: pool.YES,
      poolNo: pool.NO,
      prob: getCpmmProbability(pool, p),
    }
  })

  const newBetResults = combineBetsOnSameAnswers(
    yesBetResults,
    'YES',
    updatedAnswers.filter((a) => basketIds.has(a.id)),
    collectedFees
  )
  const otherBetResults = combineBetsOnSameAnswers(
    noBetResults,
    'NO',
    updatedAnswers.filter((a) => !basketIds.has(a.id)),
    collectedFees
  )

  // Always-on post-hoc verification (cost is one pass over the result vs. ~100 evalG bisection
  // probes to produce it). Throws CpmmMulti2InvariantError; new-bet.ts maps it to a retryable
  // 503, so a wrong solve fails the bet instead of committing a mis-priced fill.
  verifyCpmmMulti2BetResult(
    betAmount,
    newBetResults,
    otherBetResults,
    updatedAnswers,
    unfilledBets
  )

  return { newBetResults, otherBetResults, updatedAnswers }
}

// --- cpmm-multi-2 post-hoc solve verification -------------------------------------------------
// The v2 solve above bisects on the premise that net(g) is strictly increasing. That premise is
// proven only at p = 1/2 with no resting limits (GP12a); production runs general p against a live
// limit book. If the premise ever fails, binarySearch returns a wrong g SILENTLY — the taker is
// mis-charged with no error anywhere. But verifying a claimed equilibrium is trivial even where
// finding it is hard, so we check the returned result and fail the bet (which the client can
// retry) rather than commit a wrong fill. This demotes monotonicity from a correctness assumption
// to a performance assumption.
//
// Deliberately a typed error rather than common/api/utils APIError: importing api/utils here
// would close the module cycle api/utils -> api/schema -> new-bet -> this file. new-bet.ts
// (which already imports APIError) maps it to APIError(503, ...), so API callers see a retryable
// error instead of a stack-leaking 500.
export class CpmmMulti2InvariantError extends Error {
  details?: unknown
  constructor(message: string, details?: unknown) {
    super(message)
    this.name = 'CpmmMulti2InvariantError'
    this.details = details
  }
}

// Tolerances calibrated 2026-07-01 against the 50-iteration bisection's observed residuals on
// this repo's v2 jest fixtures plus the net(g) monotonicity probe's 152-call sweep (p = 1/2 and
// general-p pools, m = 1..4 baskets, balanced/skewed/extreme creation pools, resting makers,
// bets M$1..M$100k). Worst observed: cost 1.5e-9 absolute (M$100k whale; <= 1.1e-11 for bets
// <= 500), basket share spread 2.2e-13 (relative), maker price / order overfill exactly 0.
// Cost and shares are relative with an absolute floor (residuals scale with bet size).
//
// PROB-SUM CAVEAT — why its tolerance is loose (1e-2) while cost is tight: when a maker holds
// YES bids on TWO+ non-basket answers but has balance for only one leg, the inner eta solve
// previews the NO legs with per-leg balance copies yet realizes them against a shared decremented
// balance, so realized Sum_others prob lands short of target — final Sum q deviates from 1 by up
// to ~2e-3 (observed 1.73e-3 at bet 500). This is PRE-EXISTING behavior shared with frozen v1
// (same config shows -1.03e-3 on v1) and the taker charge stays exact (cost residual 2.3e-12);
// the market is merely left with a small open arb. A tight Sum q check would make v2 refuse bets
// v1 accepts — a functional regression — so the tolerance sits above the balance-binding
// deviation. In every non-balance-bound config |Sum q - 1| <= 8.9e-16.
// TODO: recalibrate against the whale-bet probe (cpmm-perf-bench) before raising bet-size caps.
const V2_VERIFY_COST_EPS = 1e-8 // relative to betAmount, floored at V2_VERIFY_COST_EPS_ABS
const V2_VERIFY_COST_EPS_ABS = 1e-6 // absolute floor (observed worst 1.5e-9 at M$100k)
const V2_VERIFY_PROB_SUM_EPS = 1e-2 // absolute on Sum_i prob_i — loose, see caveat above
const V2_VERIFY_SHARES_EPS = 1e-9 // relative, basket equal-shares spread & other-leg net shares
const V2_VERIFY_MAKER_EPS = 1e-9 // maker fill bookkeeping (exact identities up to roundoff)

// Checks the v2 result exactly as downstream consumes it (executeNewBetResult / the conservation
// grid): taker fills = `takers`, maker fills = `makers`, final pools = per-answer cpmmState.
// NOT checkable post-hoc: the no-overshoot path property (a maker strictly outside an answer's
// [initial, final] excursion must not be crossed) — the result carries no price path, so the
// conservation grid's falsification sweep owns that invariant, not this verifier.
export const verifyCpmmMulti2BetResult = (
  betAmount: number,
  newBetResults: ArbitrageBetArray,
  otherBetResults: ArbitrageBetArray,
  updatedAnswers: Answer[],
  unfilledBets: LimitBet[]
) => {
  const fail = (check: string, details: unknown): never => {
    throw new CpmmMulti2InvariantError(
      `cpmm-multi-2 solve verification failed: ${check}`,
      details
    )
  }

  // (a) Cost conservation. The taker's whole spend lives on the basket YES legs: each other-
  // answer NO leg carries an appended redemption fill that nets it to exactly zero mana AND zero
  // shares (the eta*(n-m-1) credit plus the residual eta YES/leg flow to the basket legs). So
  // Sum_basket takers.amount == betAmount — the same identity new-bet.ts uses for isFilled and
  // the conservation grid's `Sum(balance deltas) + fees == 0` closure. A wrong g from a
  // non-monotone net(g) surfaces HERE: the inner eta solve re-pins Sum p == 1 for any g, so
  // mis-solves mis-charge rather than mis-price.
  const spend = sumBy(
    newBetResults.flatMap((r) => r.takers),
    'amount'
  )
  const costTol = Math.max(
    V2_VERIFY_COST_EPS_ABS,
    V2_VERIFY_COST_EPS * betAmount
  )
  if (Math.abs(spend - betAmount) > costTol) {
    fail('taker spend != betAmount (wrong g?)', { spend, betAmount })
  }
  for (const r of otherBetResults) {
    const netAmount = sumBy(r.takers, 'amount')
    const netShares = sumBy(r.takers, 'shares')
    const grossShares = sumBy(r.takers, (t) => Math.abs(t.shares))
    if (
      Math.abs(netAmount) > costTol ||
      Math.abs(netShares) > V2_VERIFY_SHARES_EPS * Math.max(1, grossShares)
    ) {
      fail('other-answer NO leg does not net to zero', {
        answerId: r.answer.id,
        netAmount,
        netShares,
      })
    }
  }

  // (b) Sum-to-one + (c) positivity on the final state of EVERY answer. updatedAnswers is the
  // solve's own final state (basket + others both realized), the same pools executeNewBetResult
  // persists. The Sum q tolerance is deliberately loose — see the balance-bound-maker caveat at
  // the EPS definitions above (legitimate ~2e-3 deviation shared with v1).
  let probSum = 0
  for (const a of updatedAnswers) {
    if (!(a.poolYes > 0) || !(a.poolNo > 0) || !(a.p > 0 && a.p < 1)) {
      fail('final pool not positive / p outside (0,1)', {
        answerId: a.id,
        poolYes: a.poolYes,
        poolNo: a.poolNo,
        p: a.p,
      })
    }
    probSum += getCpmmProbability({ YES: a.poolYes, NO: a.poolNo }, a.p)
  }
  if (Math.abs(probSum - 1) > V2_VERIFY_PROB_SUM_EPS) {
    fail('final probabilities do not sum to 1', { probSum })
  }

  // (d) Maker-fill sanity. A limit fill is priced AT the maker's limitProb (computeFill:
  // maker.amount = shares * makerPrice), and the fills against one order cannot exceed what was
  // left unfilled on the book when the solve started. Each answer's book is touched by exactly
  // one leg in v2, but group by order id anyway so the check doesn't depend on that.
  const bookById = new Map(unfilledBets.map((b) => [b.id, b]))
  const allMakers = [...newBetResults, ...otherBetResults].flatMap(
    (r) => r.makers
  )
  for (const m of allMakers) {
    const price =
      m.bet.outcome === 'YES' ? m.bet.limitProb : 1 - m.bet.limitProb
    if (
      m.shares < -V2_VERIFY_MAKER_EPS ||
      m.amount < -V2_VERIFY_MAKER_EPS ||
      Math.abs(m.amount - m.shares * price) >
        V2_VERIFY_MAKER_EPS * Math.max(1, m.amount)
    ) {
      fail('maker fill not priced at its limitProb / negative fill', {
        orderId: m.bet.id,
        amount: m.amount,
        shares: m.shares,
        limitProb: m.bet.limitProb,
      })
    }
  }
  for (const [orderId, fills] of Object.entries(
    groupBy(allMakers, (m) => m.bet.id)
  )) {
    const order = bookById.get(orderId) ?? fills[0].bet
    const remaining = order.orderAmount - order.amount
    const filled = sumBy(fills, 'amount')
    if (filled > remaining + V2_VERIFY_MAKER_EPS * Math.max(1, remaining)) {
      fail('maker order filled beyond its remaining size', {
        orderId,
        filled,
        remaining,
      })
    }
  }

  // (e) Equal shares — the multi-bet contract: every basket answer acquires the same YES shares
  // (g from the sweep + eta from the redemption residual).
  const basketShares = newBetResults.map((r) => sumBy(r.takers, 'shares'))
  const maxShares = Math.max(...basketShares)
  const spread = maxShares - Math.min(...basketShares)
  if (spread > V2_VERIFY_SHARES_EPS * Math.max(1, maxShares)) {
    fail('basket YES shares not equal across answers', { basketShares })
  }
}

export const getBetResultsAndUpdatedAnswers = (
  answersToBuy: Answer[],
  yesAmounts: number[],
  updatedAnswers: Answer[],
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  collectedFees: Fees,
  answerIdsWithFees?: string[]
) => {
  // Working maps that will be updated as we simulate each leg to avoid reusing capacity.
  const workingUnfilledBetsByAnswer = groupBy(
    unfilledBets,
    (bet) => bet.answerId
  )
  const workingBalanceByUserId = { ...balanceByUserId }

  const yesBetResultsAndUpdatedAnswers = answersToBuy.map((answerToBuy, i) => {
    const pool = { YES: answerToBuy.poolYes, NO: answerToBuy.poolNo }
    const yesBetResult = {
      ...computeFills(
        { pool, p: answerToBuy.p, collectedFees },
        'YES',
        yesAmounts[i],
        limitProb,
        workingUnfilledBetsByAnswer[answerToBuy.id] ?? [],
        workingBalanceByUserId,
        undefined,
        answerIdsWithFees && !answerIdsWithFees?.includes(answerToBuy.id)
      ),
      answer: answerToBuy,
    }

    // Apply the fills to mutate working state for subsequent legs
    applyMakersToWorkingState(
      yesBetResult.makers,
      yesBetResult.ordersToCancel,
      workingUnfilledBetsByAnswer,
      workingBalanceByUserId
    )

    const { cpmmState } = yesBetResult
    const { pool: newPool, p } = cpmmState
    const { YES: poolYes, NO: poolNo } = newPool
    const prob = getCpmmProbability(newPool, p)
    const newAnswerState = {
      ...answerToBuy,
      poolYes,
      poolNo,
      prob,
    }
    return { yesBetResult, newAnswerState }
  })
  const yesBets = yesBetResultsAndUpdatedAnswers.map((r) => r.yesBetResult)
  const newAnswerStates = yesBetResultsAndUpdatedAnswers.map(
    (r) => r.newAnswerState
  )
  const noBuyResults = buyNoSharesUntilAnswersSumToOne(
    updatedAnswers.map(
      (answer) =>
        newAnswerStates.find(
          (newAnswerState) => newAnswerState.id === answer.id
        ) ?? answer
    ),
    // Flatten current working snapshot so NO legs see already-used capacity
    Object.values(workingUnfilledBetsByAnswer).flat(),
    workingBalanceByUserId,
    collectedFees,
    answerIdsWithFees
  )
  // Apply NO leg maker fills to working state as well
  for (const noBet of noBuyResults.noBetResults) {
    applyMakersToWorkingState(
      noBet.makers,
      noBet.ordersToCancel,
      workingUnfilledBetsByAnswer,
      workingBalanceByUserId
    )
  }
  // Update new answer states from bets placed on all answers
  const newUpdatedAnswers = noBuyResults.noBetResults.map((noBetResult) => {
    const { cpmmState } = noBetResult
    const { pool: newPool, p } = cpmmState
    const { YES: poolYes, NO: poolNo } = newPool
    const prob = getCpmmProbability(newPool, p)
    return {
      ...noBetResult.answer,
      poolYes,
      poolNo,
      prob,
    }
  })

  return {
    newUpdatedAnswers,
    yesBets,
    noBuyResults,
    // Also return updated state so callers can carry it across iterations
    updatedUnfilledBetsByAnswer: workingUnfilledBetsByAnswer,
    updatedBalanceByUserId: workingBalanceByUserId,
  }
}

export const combineBetsOnSameAnswers = (
  bets: PreliminaryBetResults[],
  outcome: 'YES' | 'NO',
  updatedAnswers: Answer[],
  collectedFees: Fees,
  // The fills after the first are free bc they're due to arbitrage.
  fillsFollowingFirstAreFree?: boolean,
  extraFeesPerAnswer?: { [answerId: string]: Fees }
) => {
  return updatedAnswers.map((answer) => {
    const betsForAnswer = bets.filter((bet) => bet.answer.id === answer.id)
    const { poolYes, poolNo } = answer
    const bet = betsForAnswer[0]
    const extraFees = extraFeesPerAnswer?.[answer.id] ?? noFees
    const totalFees = betsForAnswer.reduce(
      (acc, b) => addObjects(acc, b.totalFees),
      extraFees
    )
    // Make extra taker fills beyond the user's paid iteration free by zeroing their amounts and fees,
    // while still summing shares so probabilities update correctly.
    const takers = betsForAnswer.flatMap((r) => r.takers)
    const adjustedTakers = fillsFollowingFirstAreFree
      ? (() => {
          const cloned = takers.map((t) => ({ ...t }))
          let idx = 0
          for (const r of betsForAnswer) {
            const count = r.takers.length
            const slice = cloned.slice(idx, idx + count)
            if ((r.iteration ?? 0) > 0) {
              for (const t of slice) {
                t.amount = 0
                t.fees = noFees
              }
            }
            idx += count
          }
          return cloned
        })()
      : takers
    return {
      ...bet,
      takers: adjustedTakers,
      makers: betsForAnswer.flatMap((r) => r.makers),
      ordersToCancel: betsForAnswer.flatMap((r) => r.ordersToCancel),
      outcome,
      cpmmState: {
        p: answer.p,
        pool: { YES: poolYes, NO: poolNo },
        collectedFees,
      },
      answer,
      totalFees,
    }
  })
}

function calculateCpmmMultiArbitrageBetYes(
  answers: Answer[],
  answerToBuy: Answer,
  betAmount: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  collectedFees: Fees
) {
  const startTime = Date.now()
  const unfilledBetsByAnswer = groupBy(unfilledBets, (bet) => bet.answerId)

  const noSharePriceSum = sumBy(
    answers.filter((a) => a.id !== answerToBuy.id).map((a) => 1 - a.prob)
  )
  // If you spend all of amount on NO shares at current price. Subtract out from the price the redemption mana.
  const maxNoShares = betAmount / (noSharePriceSum - answers.length + 2)

  const noShares = binarySearch(0, maxNoShares, (noShares) => {
    const result = buyNoSharesInOtherAnswersThenYesInAnswer(
      answers,
      answerToBuy,
      unfilledBetsByAnswer,
      balanceByUserId,
      betAmount,
      limitProb,
      noShares,
      collectedFees
    )
    if (!result) {
      return 1
    }
    const newStates = [...result.noBetResults, result.yesBetResult]
    const diff =
      1 -
      sumBy(newStates, (r) =>
        getCpmmProbability(r.cpmmState.pool, r.cpmmState.p)
      )
    return diff
  })

  const result = buyNoSharesInOtherAnswersThenYesInAnswer(
    answers,
    answerToBuy,
    unfilledBetsByAnswer,
    balanceByUserId,
    betAmount,
    limitProb,
    noShares,
    collectedFees
  )
  if (!result) {
    console.log('no result', result)
    throw new Error('Invariant failed in calculateCpmmMultiArbitrageBetYes')
  }

  const { noBetResults, yesBetResult } = result

  if (DEBUG) {
    const endTime = Date.now()

    const newStates = [...noBetResults, yesBetResult]
    const newPools = newStates.map((r) => r.cpmmState.pool)

    console.log('time', endTime - startTime, 'ms')

    console.log(
      'bet amount',
      betAmount,
      'no bet amounts',
      noBetResults.map((r) => r.takers.map((t) => t.amount)),
      'yes bet amount',
      sumBy(yesBetResult.takers, 'amount')
    )

    console.log(
      'getBinaryBuyYes before',
      answers.map((a) => a.prob),
      answers.map((a) => `${a.poolYes}, ${a.poolNo}`),
      'answerToBuy',
      answerToBuy
    )
    console.log(
      'getBinaryBuyYes after',
      newPools,
      newStates.map((r) => getCpmmProbability(r.cpmmState.pool, r.cpmmState.p)),
      'prob total',
      sumBy(newStates, (r) =>
        getCpmmProbability(r.cpmmState.pool, r.cpmmState.p)
      ),
      'pool shares',
      newPools.map((pool) => `${pool.YES}, ${pool.NO}`),
      'no shares',
      noShares,
      'yes shares',
      sumBy(yesBetResult.takers, 'shares')
    )
  }

  const newBetResult = { ...yesBetResult, outcome: 'YES' }
  const otherBetResults = noBetResults.map((r) => ({ ...r, outcome: 'NO' }))
  return { newBetResult, otherBetResults }
}

const buyNoSharesInOtherAnswersThenYesInAnswer = (
  answers: Answer[],
  answerToBuy: Answer,
  unfilledBetsByAnswer: Dictionary<LimitBet[]>,
  balanceByUserId: { [userId: string]: number },
  betAmount: number,
  limitProb: number | undefined,
  noShares: number,
  collectedFees: Fees
) => {
  const otherAnswers = answers.filter((a) => a.id !== answerToBuy.id)
  const noAmounts = otherAnswers.map(({ id, poolYes, poolNo, p }) =>
    calculateAmountToBuySharesFixedP(
      { pool: { YES: poolYes, NO: poolNo }, p, collectedFees },
      noShares,
      'NO',
      unfilledBetsByAnswer[id] ?? [],
      balanceByUserId,
      true
    )
  )
  const totalNoAmount = sum(noAmounts)

  const workingUnfilledBetsByAnswer = mapValues(
    unfilledBetsByAnswer,
    (bets) => [...bets]
  )
  const workingBalanceByUserId = { ...balanceByUserId }
  const noBetResults = noAmounts.map((noAmount, i) => {
    const answer = otherAnswers[i]
    const pool = { YES: answer.poolYes, NO: answer.poolNo }
    const result = {
      ...computeFills(
        { pool, p: answer.p, collectedFees },
        'NO',
        noAmount,
        undefined,
        workingUnfilledBetsByAnswer[answer.id] ?? [],
        workingBalanceByUserId,
        undefined,
        true
      ),
      answer,
    }
    applyMakersToWorkingState(
      result.makers,
      result.ordersToCancel,
      workingUnfilledBetsByAnswer,
      workingBalanceByUserId
    )
    return result
  })

  // Identity: No shares in all other answers is equal to noShares * (n-2) mana + yes shares in answerToBuy (quantity: noShares)
  const redeemedAmount = noShares * (answers.length - 2)
  const netNoAmount = totalNoAmount - redeemedAmount
  let yesBetAmount = betAmount - netNoAmount
  if (floatingArbitrageEqual(yesBetAmount, 0)) {
    yesBetAmount = 0
  }
  if (yesBetAmount < 0) {
    return undefined
  }

  for (const noBetResult of noBetResults) {
    const redemptionFill = {
      matchedBetId: null,
      amount: -sumBy(noBetResult.takers, 'amount'),
      shares: -sumBy(noBetResult.takers, 'shares'),
      timestamp: Date.now(),
      fees: noFees,
    }
    noBetResult.takers.push(redemptionFill)
  }

  const pool = { YES: answerToBuy.poolYes, NO: answerToBuy.poolNo }
  const yesBetResult = {
    ...computeFills(
      { pool, p: answerToBuy.p, collectedFees },
      'YES',
      yesBetAmount,
      limitProb,
      workingUnfilledBetsByAnswer[answerToBuy.id] ?? [],
      workingBalanceByUserId
    ),
    answer: answerToBuy,
  }

  // Redeem NO shares in other answers to YES shares in this answer.
  const redemptionFill = {
    matchedBetId: null,
    amount: netNoAmount,
    shares: noShares,
    timestamp: Date.now(),
    fees: noFees,
  }
  yesBetResult.takers.push(redemptionFill)

  return { noBetResults, yesBetResult }
}

function calculateCpmmMultiArbitrageBetNo(
  answers: Answer[],
  answerToBuy: Answer,
  betAmount: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  collectedFees: Fees
) {
  const startTime = Date.now()
  const unfilledBetsByAnswer = groupBy(unfilledBets, (bet) => bet.answerId)

  const yesSharePriceSum = sumBy(
    answers.filter((a) => a.id !== answerToBuy.id),
    'prob'
  )
  const maxYesShares = betAmount / yesSharePriceSum

  const yesShares = binarySearch(0, maxYesShares, (yesShares) => {
    const result = buyYesSharesInOtherAnswersThenNoInAnswer(
      answers,
      answerToBuy,
      unfilledBetsByAnswer,
      balanceByUserId,
      betAmount,
      limitProb,
      yesShares,
      collectedFees
    )
    if (!result) return 1
    const { yesBetResults, noBetResult } = result
    const newStates = [...yesBetResults, noBetResult]
    const diff =
      sumBy(newStates, (r) =>
        getCpmmProbability(r.cpmmState.pool, r.cpmmState.p)
      ) - 1
    return diff
  })

  const result = buyYesSharesInOtherAnswersThenNoInAnswer(
    answers,
    answerToBuy,
    unfilledBetsByAnswer,
    balanceByUserId,
    betAmount,
    limitProb,
    yesShares,
    collectedFees
  )
  if (!result) {
    throw new Error('Invariant failed in calculateCpmmMultiArbitrageBetNo')
  }
  const { yesBetResults, noBetResult } = result

  if (DEBUG) {
    const endTime = Date.now()

    const newStates = [...yesBetResults, noBetResult]
    const newPools = newStates.map((r) => r.cpmmState.pool)

    console.log('time', endTime - startTime, 'ms')

    console.log(
      'bet amount',
      betAmount,
      'yes bet amounts',
      yesBetResults.map((r) => r.takers.map((t) => t.amount)),
      'no bet amount',
      sumBy(noBetResult.takers, 'amount')
    )

    console.log(
      'getBinaryBuyYes before',
      answers.map((a) => a.prob),
      answers.map((a) => `${a.poolYes}, ${a.poolNo}`),
      'answerToBuy',
      answerToBuy
    )
    console.log(
      'getBinaryBuyNo after',
      newPools,
      newStates.map((r) => getCpmmProbability(r.cpmmState.pool, r.cpmmState.p)),
      'prob total',
      sumBy(newStates, (r) =>
        getCpmmProbability(r.cpmmState.pool, r.cpmmState.p)
      ),
      'pool shares',
      newPools.map((pool) => `${pool.YES}, ${pool.NO}`),
      'yes shares',
      yesShares,
      'no shares',
      sumBy(noBetResult.takers, 'shares')
    )
  }

  const newBetResult = { ...noBetResult, outcome: 'NO' }
  const otherBetResults = yesBetResults.map((r) => ({ ...r, outcome: 'YES' }))
  return { newBetResult, otherBetResults }
}

const buyYesSharesInOtherAnswersThenNoInAnswer = (
  answers: Answer[],
  answerToBuy: Answer,
  unfilledBetsByAnswer: Dictionary<LimitBet[]>,
  balanceByUserId: { [userId: string]: number },
  betAmount: number,
  limitProb: number | undefined,
  yesShares: number,
  collectedFees: Fees
) => {
  const otherAnswers = answers.filter((a) => a.id !== answerToBuy.id)
  const yesAmounts = otherAnswers.map(({ id, poolYes, poolNo, p }) =>
    calculateAmountToBuySharesFixedP(
      { pool: { YES: poolYes, NO: poolNo }, p, collectedFees },
      yesShares,
      'YES',
      unfilledBetsByAnswer[id] ?? [],
      balanceByUserId,
      true
    )
  )
  const totalYesAmount = sum(yesAmounts)

  const workingUnfilledBetsByAnswer = mapValues(
    unfilledBetsByAnswer,
    (bets) => [...bets]
  )
  const workingBalanceByUserId = { ...balanceByUserId }
  const yesBetResults = yesAmounts.map((yesAmount, i) => {
    const answer = otherAnswers[i]
    const { poolYes, poolNo } = answer
    const result = {
      ...computeFills(
        { pool: { YES: poolYes, NO: poolNo }, p: answer.p, collectedFees },
        'YES',
        yesAmount,
        undefined,
        workingUnfilledBetsByAnswer[answer.id] ?? [],
        workingBalanceByUserId,
        undefined,
        true
      ),
      answer,
    }
    applyMakersToWorkingState(
      result.makers,
      result.ordersToCancel,
      workingUnfilledBetsByAnswer,
      workingBalanceByUserId
    )
    return result
  })
  //{"id": "tQudZcEtlp", "slug": "whos-gonna-win-gn8sCuyRpl", "volume": 0, "answers": [{"id": "Ncus9Qtty2", "prob": 0.16666666666666666, "text": "a", "index": 0, "poolNo": 100, "userId": "6hHpzvRG0pMq8PNJs7RZj2qlZGn2", "isOther": false, "poolYes": 500, "contractId": "tQudZcEtlp", "createdTime": 1755714659074, "probChanges": {"day": 0, "week": 0, "month": 0}, "subsidyPool": 0, "totalLiquidity": 223.60679774997897}, {"id": "CAqyQ8AOSn", "prob": 0.16666666666666666, "text": "b", "index": 1, "poolNo": 100, "userId": "6hHpzvRG0pMq8PNJs7RZj2qlZGn2", "isOther": false, "poolYes": 500, "contractId": "tQudZcEtlp", "createdTime": 1755714659074, "probChanges": {"day": 0, "week": 0, "month": 0}, "subsidyPool": 0, "totalLiquidity": 223.60679774997897}, {"id": "Pc86OAUEsn", "prob": 0.16666666666666666, "text": "c", "index": 2, "poolNo": 100, "userId": "6hHpzvRG0pMq8PNJs7RZj2qlZGn2", "isOther": false, "poolYes": 500, "contractId": "tQudZcEtlp", "createdTime": 1755714659074, "probChanges": {"day": 0, "week": 0, "month": 0}, "subsidyPool": 0, "totalLiquidity": 223.60679774997897}, {"id": "dn0gpUIzpq", "prob": 0.16666666666666666, "text": "d", "index": 3, "poolNo": 100, "userId": "6hHpzvRG0pMq8PNJs7RZj2qlZGn2", "isOther": false, "poolYes": 500, "contractId": "tQudZcEtlp", "createdTime": 1755714659074, "probChanges": {"day": 0, "week": 0, "month": 0}, "subsidyPool": 0, "totalLiquidity": 223.60679774997897}, {"id": "uq5uZd5O0A", "prob": 0.16666666666666666, "text": "e", "index": 4, "poolNo": 100, "userId": "6hHpzvRG0pMq8PNJs7RZj2qlZGn2", "isOther": false, "poolYes": 500, "contractId": "tQudZcEtlp", "createdTime": 1755714659074, "probChanges": {"day": 0, "week": 0, "month": 0}, "subsidyPool": 0, "totalLiquidity": 223.60679774997897}, {"id": "ACNE8CLyyS", "prob": 0.16666666666666666, "text": "Other", "index": 5, "poolNo": 100, "userId": "6hHpzvRG0pMq8PNJs7RZj2qlZGn2", "isOther": true, "poolYes": 500, "contractId": "tQudZcEtlp", "createdTime": 1755714659074, "probChanges": {"day": 0, "week": 0, "month": 0}, "subsidyPool": 0, "totalLiquidity": 223.60679774997897}], "isRanked": false, "question": "Who's gonna win?", "closeTime": 1767254340000, "creatorId": "6hHpzvRG0pMq8PNJs7RZj2qlZGn2", "mechanism": "cpmm-multi-1", "elasticity": 4.99, "groupSlugs": ["nonpredictive"], "isResolved": false, "visibility": "public", "createdTime": 1755714659073, "creatorName": "Ian Bobby", "description": {"type": "doc", "content": [{"type": "paragraph"}]}, "outcomeType": "MULTIPLE_CHOICE", "subsidyPool": 0, "collectedFees": {"creatorFee": 0, "platformFee": 0, "liquidityFee": 0}, "volume24Hours": 0, "addAnswersMode": "ANYONE", "totalLiquidity": 1000, "creatorUsername": "IanPhilip", "lastUpdatedTime": 1755714659519, "popularityScore": 0, "creatorAvatarUrl": "https://firebasestorage.googleapis.com/v0/b/dev-mantic-markets.appspot.com/o/user-images%2FIanPhilip%2FEyIU8AZ2RC.png?alt=media&token=ff41c9e8-21d5-412d-ac19-854a90cce076", "uniqueBettorCount": 0, "creatorCreatedTime": 1668811545000, "uniqueBettorCountDay": 0, "shouldAnswersSumToOne": true}
  let noBetAmount = betAmount - totalYesAmount
  if (floatingArbitrageEqual(noBetAmount, 0)) {
    noBetAmount = 0
  }
  if (noBetAmount < 0) {
    return undefined
  }

  for (const yesBetResult of yesBetResults) {
    const redemptionFill = {
      matchedBetId: null,
      amount: -sumBy(yesBetResult.takers, 'amount'),
      shares: -sumBy(yesBetResult.takers, 'shares'),
      timestamp: Date.now(),
      fees: noFees,
    }
    yesBetResult.takers.push(redemptionFill)
  }

  const pool = { YES: answerToBuy.poolYes, NO: answerToBuy.poolNo }
  const noBetResult = {
    ...computeFills(
      { pool, p: answerToBuy.p, collectedFees },
      'NO',
      noBetAmount,
      limitProb,
      workingUnfilledBetsByAnswer[answerToBuy.id] ?? [],
      workingBalanceByUserId
    ),
    answer: answerToBuy,
  }
  // Redeem YES shares in other answers to NO shares in this answer.
  const redemptionFill = {
    matchedBetId: null,
    amount: totalYesAmount,
    shares: yesShares,
    timestamp: Date.now(),
    fees: noFees,
  }
  noBetResult.takers.push(redemptionFill)

  return { yesBetResults, noBetResult }
}

export const buyNoSharesUntilAnswersSumToOne = (
  answers: Answer[],
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  collectedFees: Fees,
  answerIdsWithFees?: string[]
) => {
  const baseUnfilledBetsByAnswer = groupBy(unfilledBets, (bet) => bet.answerId)

  let maxNoShares = 10
  do {
    const result = buyNoSharesInAnswers(
      answers,
      { ...baseUnfilledBetsByAnswer },
      { ...balanceByUserId },
      maxNoShares,
      collectedFees,
      answerIdsWithFees,
      false // don't mutate orders during binary search
    )
    const probSum = sumBy(result.noBetResults, (r) =>
      getCpmmProbability(r.cpmmState.pool, r.cpmmState.p)
    )
    if (probSum < 1) break
    maxNoShares *= 10
  } while (true)

  const noShares = binarySearch(0, maxNoShares, (noShares) => {
    const result = buyNoSharesInAnswers(
      answers,
      { ...baseUnfilledBetsByAnswer },
      { ...balanceByUserId },
      noShares,
      collectedFees,
      answerIdsWithFees,
      false // don't mutate orders during binary search
    )
    const diff =
      1 -
      sumBy(result.noBetResults, (r) =>
        getCpmmProbability(r.cpmmState.pool, r.cpmmState.p)
      )
    return diff
  })

  return buyNoSharesInAnswers(
    answers,
    baseUnfilledBetsByAnswer,
    { ...balanceByUserId },
    noShares,
    collectedFees,
    answerIdsWithFees,
    true // mutate orders in final execution
  )
}

const buyNoSharesInAnswers = (
  answers: Answer[],
  unfilledBetsByAnswer: Dictionary<LimitBet[]>,
  balanceByUserId: { [userId: string]: number },
  noShares: number,
  collectedFees: Fees,
  answerIdsWithFees?: string[],
  updateOrders: boolean = true
) => {
  // Sequentially compute each answer's NO leg, updating state to avoid reusing capacity.
  let totalNoAmount = 0
  const noBetResults: PreliminaryBetResults[] = []
  for (const answer of answers) {
    const { id, poolYes, poolNo } = answer
    const pool = { YES: poolYes, NO: poolNo }
    const noAmount = calculateAmountToBuySharesFixedP(
      { pool, p: answer.p, collectedFees },
      noShares,
      'NO',
      unfilledBetsByAnswer[id] ?? [],
      balanceByUserId,
      !answerIdsWithFees?.includes(id)
    )
    totalNoAmount += noAmount

    const res = {
      ...computeFills(
        { pool, p: answer.p, collectedFees },
        'NO',
        noAmount,
        undefined,
        unfilledBetsByAnswer[id] ?? [],
        balanceByUserId,
        undefined,
        !answerIdsWithFees?.includes(id)
      ),
      answer,
    }

    // Apply maker usage to state so later answers don't reuse.
    if (updateOrders) {
      applyMakersToWorkingState(
        res.makers,
        res.ordersToCancel,
        unfilledBetsByAnswer,
        balanceByUserId
      )
    }

    noBetResults.push(res)
  }
  // Identity: No shares in all other answers is equal to noShares * (n-1) mana
  const redeemedAmount = noShares * (answers.length - 1)
  // Fees on arbitrage bets are returned
  const extraMana = redeemedAmount - totalNoAmount

  for (const noBetResult of noBetResults) {
    const redemptionFill = {
      matchedBetId: null,
      amount: -sumBy(noBetResult.takers, 'amount'),
      shares: -sumBy(noBetResult.takers, 'shares'),
      timestamp: Date.now(),
      fees: noBetResult.totalFees,
    }
    noBetResult.takers.push(redemptionFill)
  }

  return { noBetResults, extraMana }
}

export function calculateCpmmMultiArbitrageSellNo(
  answers: Answer[],
  answerToSell: Answer,
  noShares: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  collectedFees: Fees
) {
  const startTime = Date.now()
  const unfilledBetsByAnswer = groupBy(unfilledBets, (bet) => bet.answerId)

  const { id, poolYes, poolNo } = answerToSell
  const pool = { YES: poolYes, NO: poolNo }
  const answersWithoutAnswerToSell = answers.filter(
    (a) => a.id !== answerToSell.id
  )

  // Strategy: We have noShares, and need that many yes shares to complete the sell.
  // We buy some yes shares in the answer directly, and the rest is from converting No shares of all the other answers.
  // The proportion of each is dependent on what leaves the final probability sum at 1.
  // Which is what this binary search is discovering.
  const yesShares = binarySearch(0, noShares, (yesShares) => {
    const noSharesInOtherAnswers = noShares - yesShares
    const yesAmount = calculateAmountToBuySharesFixedP(
      { pool, p: answerToSell.p, collectedFees },
      yesShares,
      'YES',
      unfilledBetsByAnswer[id] ?? [],
      balanceByUserId
    )
    const noAmounts = answersWithoutAnswerToSell.map(
      ({ id, poolYes, poolNo, p }) =>
        calculateAmountToBuySharesFixedP(
          { pool: { YES: poolYes, NO: poolNo }, p, collectedFees },
          noSharesInOtherAnswers,
          'NO',
          unfilledBetsByAnswer[id] ?? [],
          balanceByUserId,
          true
        )
    )

    const yesResult = computeFills(
      { pool, p: answerToSell.p, collectedFees },
      'YES',
      yesAmount,
      limitProb,
      unfilledBetsByAnswer[id] ?? [],
      balanceByUserId
    )
    const noResults = answersWithoutAnswerToSell.map((answer, i) => {
      const noAmount = noAmounts[i]
      const pool = { YES: answer.poolYes, NO: answer.poolNo }
      return {
        ...computeFills(
          { pool, p: answer.p, collectedFees },
          'NO',
          noAmount,
          undefined,
          unfilledBetsByAnswer[answer.id] ?? [],
          balanceByUserId,
          undefined,
          true
        ),
        answer,
      }
    })

    const newStates = [yesResult, ...noResults]
    const diff =
      sumBy(newStates, (r) =>
        getCpmmProbability(r.cpmmState.pool, r.cpmmState.p)
      ) - 1
    return diff
  })

  const noSharesInOtherAnswers = noShares - yesShares
  const yesAmount = calculateAmountToBuySharesFixedP(
    { pool, p: answerToSell.p, collectedFees },
    yesShares,
    'YES',
    unfilledBetsByAnswer[id] ?? [],
    balanceByUserId
  )
  const noAmounts = answersWithoutAnswerToSell.map(
    ({ id, poolYes, poolNo, p }) =>
      calculateAmountToBuySharesFixedP(
        { pool: { YES: poolYes, NO: poolNo }, p, collectedFees },
        noSharesInOtherAnswers,
        'NO',
        unfilledBetsByAnswer[id] ?? [],
        balanceByUserId,
        true
      )
  )
  const yesBetResult = computeFills(
    { pool, p: answerToSell.p, collectedFees },
    'YES',
    yesAmount,
    limitProb,
    unfilledBetsByAnswer[id] ?? [],
    balanceByUserId
  )
  const noBetResults = answersWithoutAnswerToSell.map((answer, i) => {
    const noAmount = noAmounts[i]
    const pool = { YES: answer.poolYes, NO: answer.poolNo }
    return {
      ...computeFills(
        { pool, p: answer.p, collectedFees },
        'NO',
        noAmount,
        undefined,
        unfilledBetsByAnswer[answer.id] ?? [],
        balanceByUserId,
        undefined,
        true
      ),
      answer,
    }
  })

  const redeemedMana = noSharesInOtherAnswers * (answers.length - 2)
  const netNoAmount = sum(noAmounts) - redeemedMana

  const now = Date.now()
  for (const noBetResult of noBetResults) {
    const redemptionFill = {
      matchedBetId: null,
      amount: -sumBy(noBetResult.takers, 'amount'),
      shares: -sumBy(noBetResult.takers, 'shares'),
      timestamp: now,
      fees: noFees,
    }
    noBetResult.takers.push(redemptionFill)
  }

  const arbitrageFee =
    noSharesInOtherAnswers === 0
      ? 0
      : getTakerFee(
          noSharesInOtherAnswers,
          netNoAmount / noSharesInOtherAnswers
        )
  const arbitrageFees = getFeesSplit(arbitrageFee)
  yesBetResult.takers.push({
    matchedBetId: null,
    amount: netNoAmount + arbitrageFee,
    shares: noSharesInOtherAnswers,
    timestamp: now,
    fees: arbitrageFees,
  })
  yesBetResult.totalFees = addObjects(yesBetResult.totalFees, arbitrageFees)

  if (DEBUG) {
    const endTime = Date.now()

    const newStates = [...noBetResults, yesBetResult]
    const newPools = newStates.map((r) => r.cpmmState.pool)

    console.log('time', endTime - startTime, 'ms')

    console.log(
      'no shares to sell',
      noShares,
      'no bet amounts',
      noBetResults.map((r) => r.takers.map((t) => t.amount)),
      'yes bet amount',
      sumBy(yesBetResult.takers, 'amount')
    )

    console.log(
      'getBinaryBuyYes before',
      answers.map((a) => a.prob),
      answers.map((a) => `${a.poolYes}, ${a.poolNo}`),
      'answerToBuy',
      answerToSell
    )
    console.log(
      'getBinaryBuyYes after',
      newPools,
      newStates.map((r) => getCpmmProbability(r.cpmmState.pool, r.cpmmState.p)),
      'prob total',
      sumBy(newStates, (r) =>
        getCpmmProbability(r.cpmmState.pool, r.cpmmState.p)
      ),
      'pool shares',
      newPools.map((pool) => `${pool.YES}, ${pool.NO}`),
      'no shares',
      noShares,
      'yes shares',
      sumBy(yesBetResult.takers, 'shares')
    )
  }

  const newBetResult = { ...yesBetResult, outcome: 'YES' }
  const otherBetResults = noBetResults.map((r) => ({ ...r, outcome: 'NO' }))
  return { newBetResult, otherBetResults }
}

export function calculateCpmmMultiArbitrageSellYes(
  answers: Answer[],
  answerToSell: Answer,
  yesShares: number,
  limitProb: number | undefined,
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  collectedFees: Fees
) {
  const startTime = Date.now()
  const unfilledBetsByAnswer = groupBy(unfilledBets, (bet) => bet.answerId)

  const { id, poolYes, poolNo } = answerToSell
  const pool = { YES: poolYes, NO: poolNo }
  const answersWithoutAnswerToSell = answers.filter(
    (a) => a.id !== answerToSell.id
  )

  const noShares = binarySearch(0, yesShares, (noShares) => {
    const yesSharesInOtherAnswers = yesShares - noShares
    const noAmount = calculateAmountToBuySharesFixedP(
      { pool, p: answerToSell.p, collectedFees },
      noShares,
      'NO',
      unfilledBetsByAnswer[id] ?? [],
      balanceByUserId
    )
    const yesAmounts = answersWithoutAnswerToSell.map(
      ({ id, poolYes, poolNo, p }) =>
        calculateAmountToBuySharesFixedP(
          { pool: { YES: poolYes, NO: poolNo }, p, collectedFees },
          yesSharesInOtherAnswers,
          'YES',
          unfilledBetsByAnswer[id] ?? [],
          balanceByUserId,
          true
        )
    )

    const noResult = computeFills(
      { pool, p: answerToSell.p, collectedFees },
      'NO',
      noAmount,
      limitProb,
      unfilledBetsByAnswer[id] ?? [],
      balanceByUserId
    )
    const yesResults = answersWithoutAnswerToSell.map((answer, i) => {
      const yesAmount = yesAmounts[i]
      const pool = { YES: answer.poolYes, NO: answer.poolNo }
      return {
        ...computeFills(
          { pool, p: answer.p, collectedFees },
          'YES',
          yesAmount,
          undefined,
          unfilledBetsByAnswer[answer.id] ?? [],
          balanceByUserId,
          undefined,
          true
        ),
        answer,
      }
    })

    const newStates = [noResult, ...yesResults]
    const diff =
      1 -
      sumBy(newStates, (r) =>
        getCpmmProbability(r.cpmmState.pool, r.cpmmState.p)
      )
    return diff
  })

  const yesSharesInOtherAnswers = yesShares - noShares
  const noAmount = calculateAmountToBuySharesFixedP(
    { pool, p: answerToSell.p, collectedFees },
    noShares,
    'NO',
    unfilledBetsByAnswer[id] ?? [],
    balanceByUserId
  )
  const yesAmounts = answersWithoutAnswerToSell.map(
    ({ id, poolYes, poolNo, p }) =>
      calculateAmountToBuySharesFixedP(
        { pool: { YES: poolYes, NO: poolNo }, p, collectedFees },
        yesSharesInOtherAnswers,
        'YES',
        unfilledBetsByAnswer[id] ?? [],
        balanceByUserId,
        true
      )
  )
  const noBetResult = computeFills(
    { pool, p: answerToSell.p, collectedFees },
    'NO',
    noAmount,
    limitProb,
    unfilledBetsByAnswer[id] ?? [],
    balanceByUserId
  )
  const yesBetResults = answersWithoutAnswerToSell.map((answer, i) => {
    const yesAmount = yesAmounts[i]
    const pool = { YES: answer.poolYes, NO: answer.poolNo }
    return {
      ...computeFills(
        { pool, p: answer.p, collectedFees },
        'YES',
        yesAmount,
        undefined,
        unfilledBetsByAnswer[answer.id] ?? [],
        balanceByUserId,
        undefined,
        true
      ),
      answer,
    }
  })

  const totalYesAmount = sum(yesAmounts)

  const now = Date.now()
  for (const yesBetResult of yesBetResults) {
    const redemptionFill = {
      matchedBetId: null,
      amount: -sumBy(yesBetResult.takers, 'amount'),
      shares: -sumBy(yesBetResult.takers, 'shares'),
      timestamp: now,
      fees: noFees,
    }
    yesBetResult.takers.push(redemptionFill)
  }

  const arbitrageFee =
    yesSharesInOtherAnswers === 0
      ? 0
      : getTakerFee(
          yesSharesInOtherAnswers,
          totalYesAmount / yesSharesInOtherAnswers
        )
  const arbitrageFees = getFeesSplit(arbitrageFee)
  noBetResult.takers.push({
    matchedBetId: null,
    amount: totalYesAmount + arbitrageFee,
    shares: yesSharesInOtherAnswers,
    timestamp: now,
    fees: arbitrageFees,
  })
  noBetResult.totalFees = addObjects(noBetResult.totalFees, arbitrageFees)

  if (DEBUG) {
    const endTime = Date.now()

    const newStates = [...yesBetResults, noBetResult]
    const newPools = newStates.map((r) => r.cpmmState.pool)

    console.log('time', endTime - startTime, 'ms')

    console.log(
      'no shares to sell',
      noShares,
      'no bet amounts',
      yesBetResults.map((r) => r.takers.map((t) => t.amount)),
      'yes bet amount',
      sumBy(noBetResult.takers, 'amount')
    )

    console.log(
      'getBinaryBuyYes before',
      answers.map((a) => a.prob),
      answers.map((a) => `${a.poolYes}, ${a.poolNo}`),
      'answerToBuy',
      answerToSell
    )
    console.log(
      'getBinaryBuyYes after',
      newPools,
      newStates.map((r) => getCpmmProbability(r.cpmmState.pool, r.cpmmState.p)),
      'prob total',
      sumBy(newStates, (r) =>
        getCpmmProbability(r.cpmmState.pool, r.cpmmState.p)
      ),
      'pool shares',
      newPools.map((pool) => `${pool.YES}, ${pool.NO}`),
      'no shares',
      noShares,
      'yes shares',
      sumBy(noBetResult.takers, 'shares')
    )
  }

  const newBetResult = {
    ...noBetResult,
    outcome: 'NO',
  }
  const otherBetResults = yesBetResults.map((r) => ({ ...r, outcome: 'YES' }))
  return { newBetResult, otherBetResults }
}

export const calculateCpmmMultiArbitrageSellYesEqually = (
  initialAnswers: Answer[],
  userBetsByAnswerIdToSell: { [answerId: string]: Bet[] },
  unfilledBets: LimitBet[],
  balanceByUserId: { [userId: string]: number },
  collectedFees: Fees
) => {
  const unfilledBetsByAnswer = groupBy(unfilledBets, (bet) => bet.answerId)
  const allAnswersToSell = initialAnswers.filter(
    (a) => userBetsByAnswerIdToSell[a.id]?.length
  )
  const sharesByAnswerId = mapValues(userBetsByAnswerIdToSell, (bets) =>
    sumBy(bets, (b) => b.shares)
  )
  const minShares = Math.min(...Object.values(sharesByAnswerId))
  const saleBetResults: PreliminaryBetResults[] = []
  const oppositeBuyResults: PreliminaryBetResults[] = []
  let updatedAnswers = initialAnswers
  let sharesToSell = minShares
  while (sharesToSell > 0) {
    const answersToSellNow = allAnswersToSell.filter(
      (a) => sharesByAnswerId[a.id] >= sharesToSell
    )
    const answerIdsToSellNow = allAnswersToSell
      .filter((a) => sharesByAnswerId[a.id] >= sharesToSell)
      .map((a) => a.id)
    // Buy yes shares in the answers opposite the answers to sell
    const oppositeAnswersFromSaleToBuyYesShares = updatedAnswers.filter(
      (a) => !answerIdsToSellNow.includes(a.id)
    )
    let saleBets: PreliminaryBetResults[]
    if (answersToSellNow.length !== initialAnswers.length) {
      const yesAmounts = oppositeAnswersFromSaleToBuyYesShares.map(
        ({ id, poolYes, poolNo, p }) => {
          return calculateAmountToBuySharesFixedP(
            { pool: { YES: poolYes, NO: poolNo }, p, collectedFees },
            sharesToSell,
            'YES',
            unfilledBetsByAnswer[id] ?? [],
            balanceByUserId,
            // Zero fees on arbitrage bets
            true
          )
        }
      )
      const { newUpdatedAnswers, yesBets, noBuyResults } =
        getBetResultsAndUpdatedAnswers(
          oppositeAnswersFromSaleToBuyYesShares,
          yesAmounts,
          updatedAnswers,
          undefined,
          unfilledBets,
          balanceByUserId,
          collectedFees,
          // Charge fees on sale bets
          answerIdsToSellNow
        )
      updatedAnswers = newUpdatedAnswers
      for (const yesBet of yesBets) {
        const redemptionFill = {
          matchedBetId: null,
          amount: -sumBy(yesBet.takers, 'amount'),
          shares: -sumBy(yesBet.takers, 'shares'),
          timestamp: first(yesBet.takers)?.timestamp ?? Date.now(),
          fees: yesBet.totalFees,
        }
        yesBet.takers.push(redemptionFill)
      }
      oppositeBuyResults.push(...yesBets)
      const totalYesAmount = sum(yesAmounts)
      const { noBetResults, extraMana } = noBuyResults
      saleBets = noBetResults
        // TODO: after adding limit orders, we need to keep track of the matchedBetIds in the redemption bets we're throwing away
        .filter((betResult) => answerIdsToSellNow.includes(betResult.answer.id))
        .map((betResult) => {
          const answer = updatedAnswers.find(
            (a) => a.id === betResult.answer.id
          )!
          const { poolYes, poolNo } = answer
          return {
            ...betResult,
            takers: [
              {
                matchedBetId: null,
                amount:
                  -(sharesToSell - totalYesAmount + extraMana) /
                  answerIdsToSellNow.length,
                shares: -sharesToSell,
                timestamp: first(betResult.takers)?.timestamp ?? Date.now(),
                isSale: true,
                fees: betResult.totalFees,
              },
              //...betResult.takers, these are takers in the opposite outcome, not sure where to put them
            ],
            cpmmState: {
              p: answer.p,
              pool: { YES: poolYes, NO: poolNo },
              collectedFees,
            },
            answer,
          }
        })
    } else {
      // If we have yes shares in ALL answers, redeem them for mana
      saleBets = getSellAllRedemptionPreliminaryBets(
        answersToSellNow,
        sharesToSell,
        collectedFees,
        Date.now()
      )
    }
    saleBetResults.push(...saleBets)
    for (const answerIdToSell of answerIdsToSellNow) {
      sharesByAnswerId[answerIdToSell] -= sharesToSell
    }
    const answersToSellRemaining = Object.values(sharesByAnswerId).filter(
      (shares) => shares > 0
    )
    if (answersToSellRemaining.length === 0) break
    sharesToSell = Math.min(...answersToSellRemaining)
  }

  const newBetResults = combineBetsOnSameAnswers(
    saleBetResults,
    'YES',
    updatedAnswers.filter((a) =>
      allAnswersToSell.map((an) => an.id).includes(a.id)
    ),
    collectedFees
  )

  const otherBetResults = combineBetsOnSameAnswers(
    oppositeBuyResults,
    'YES',
    updatedAnswers.filter(
      (r) => !allAnswersToSell.map((a) => a.id).includes(r.id)
    ),
    collectedFees
  )
  const totalFee = sumAllFees(
    newBetResults.concat(otherBetResults).map((r) => r.totalFees)
  )

  return { newBetResults, otherBetResults, updatedAnswers, totalFee }
}

export const getSellAllRedemptionPreliminaryBets = (
  answers: Answer[],
  sharesToSell: number,
  collectedFees: Fees,
  now: number
) => {
  return answers.map((answer) => {
    const { poolYes, poolNo } = answer
    return {
      outcome: 'YES' as const,
      takers: [
        {
          matchedBetId: null,
          amount: -sharesToSell / answers.length,
          shares: -sharesToSell,
          timestamp: now,
          isSale: true,
          fees: noFees,
        },
      ],
      makers: [],
      totalFees: noFees,
      cpmmState: {
        p: answer.p,
        pool: { YES: poolYes, NO: poolNo },
        collectedFees,
      },
      ordersToCancel: [],
      answer,
    }
  })
}

export function floatingArbitrageEqual(a: number, b: number, epsilon = 0.001) {
  return Math.abs(a - b) < epsilon
}
