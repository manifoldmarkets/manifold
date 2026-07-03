// Performance benchmark for cpmm-multi-2 reviewer question:
//   "Did you do any performance testing with this yet?"
//
// Measures:
//   1. calculateCpmmAmountToBuySharesFixedP: p=0.5 closed form vs general-p 50-iter bisection
//   2. Full multi-buy solve: v1 (calculateCpmmMultiArbitrageBetsYes, via public
//      calculateCpmmMultiArbitrageYesBets) vs v2 (Approach C), n=10 answers,
//      2-answer basket, M$100, with and without resting limit orders
//   3. Scaling spot-check at n=50 answers
//
// Run with:  cd common && BENCH=1 npx jest cpmm-perf-bench --silent=false
// Skipped (describe.skip) in normal test runs so it doesn't slow the suite.
//
// Headline (shallow-pool fixtures, single core): the v2 bisection itself is
// negligible (~µs), but the full v2 multi-buy solve is ~7-10x v1 wall-clock
// (~160ms at n=10, ~1-1.7s at n=50) — the cost is the per-probe computeFills
// sweeps, not the outer search. A perf pass gates the creation flag flip, not
// this PR (creation is kill-switched off). Kept in-tree (not in the evidence
// repo) so the numbers stay reproducible against the code they measure.

import { Answer } from './answer'
import { LimitBet } from './bet'
import { calculateCpmmAmountToBuySharesFixedP, CpmmState } from './calculate-cpmm'
import { calculateCpmmMultiArbitrageYesBets } from './calculate-cpmm-arbitrage'
import { noFees } from './fees'

// ---------------------------------------------------------------- fixtures

// p = 0.5 answer with pool product k = 100 at the given prob (mirrors
// getAnswer in calculate-cpmm-arbitrage.test.ts)
const getAnswer = (index: number, prob: number): Answer => {
  const k = 100
  const poolYes = Math.sqrt((k * (1 - prob)) / prob)
  const poolNo = k / poolYes
  return {
    id: `answer${index}`,
    contractId: `contract`,
    userId: `user${index}`,
    text: `Answer ${index}`,
    createdTime: 0,
    index,
    prob,
    poolYes,
    poolNo,
    p: 0.5,
    totalLiquidity: 0,
    subsidyPool: 0,
    probChanges: { day: 0, week: 0, month: 0 },
    volume: 0,
  } as Answer
}

// general-p answer: balanced pools (Y = N = L) so prob = p (mirrors
// getAnswerWithP in calculate-cpmm-arbitrage.test.ts)
const getAnswerWithP = (index: number, p: number, L = 100): Answer =>
  ({
    id: `answer${index}`,
    contractId: `contract`,
    userId: `user${index}`,
    text: `Answer ${index}`,
    createdTime: 0,
    index,
    prob: p,
    poolYes: L,
    poolNo: L,
    p,
    totalLiquidity: 0,
    subsidyPool: 0,
    probChanges: { day: 0, week: 0, month: 0 },
    volume: 0,
  } as Answer)

const getLimitBet = (
  id: string,
  answer: Answer,
  outcome: 'YES' | 'NO',
  userId: string,
  orderAmount: number,
  limitProb: number
): LimitBet => ({
  id,
  userId,
  contractId: answer.contractId,
  answerId: answer.id,
  createdTime: 0,
  amount: 0,
  loanAmount: 0,
  outcome,
  shares: 0,
  probBefore: answer.prob,
  probAfter: answer.prob,
  fees: noFees,
  isRedemption: false,
  orderAmount,
  limitProb,
  isFilled: false,
  isCancelled: false,
  fills: [],
})

// ---------------------------------------------------------------- harness

const quantile = (sorted: number[], q: number) =>
  sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]

/**
 * Time fn with auto-calibrated batch size: aim for ~30ms per sample and a
 * ~8s total budget per row (the multi-buy solves range from µs to 100s of ms
 * per call, so fixed iteration counts don't work).
 * Returns per-call median and p95 (across samples) in nanoseconds.
 */
function bench(fn: () => unknown) {
  // warmup (JIT) + calibration
  fn()
  fn()
  const c0 = process.hrtime.bigint()
  fn()
  const perCallEst = Math.max(1, Number(process.hrtime.bigint() - c0))
  const targetSampleNs = 30e6 // ~30ms per sample
  const budgetNs = 8e9 // ~8s per row
  const batch = Math.max(1, Math.round(targetSampleNs / perCallEst))
  const samples = Math.min(
    30,
    Math.max(5, Math.floor(budgetNs / (batch * perCallEst)))
  )
  const perCall: number[] = []
  let sink: unknown
  for (let s = 0; s < samples; s++) {
    const t0 = process.hrtime.bigint()
    for (let i = 0; i < batch; i++) sink = fn()
    const t1 = process.hrtime.bigint()
    perCall.push(Number(t1 - t0) / batch)
  }
  void sink
  perCall.sort((a, b) => a - b)
  return { median: quantile(perCall, 0.5), p95: quantile(perCall, 0.95) }
}

const fmt = (ns: number) =>
  ns < 10_000
    ? `${ns.toFixed(0)} ns`
    : ns < 10_000_000
    ? `${(ns / 1000).toFixed(1)} µs`
    : `${(ns / 1e6).toFixed(2)} ms`

const row = (label: string, r: { median: number; p95: number }) =>
  console.log(
    `${label.padEnd(58)} median ${fmt(r.median).padStart(10)}   p95 ${fmt(
      r.p95
    ).padStart(10)}`
  )

// ---------------------------------------------------------------- benches

const d = process.env.BENCH ? describe : describe.skip

d('cpmm perf bench', () => {
  jest.setTimeout(600_000)

  it('1. single-leg calculateCpmmAmountToBuySharesFixedP', () => {
    const closedForm: CpmmState = {
      pool: { YES: 120, NO: 90 },
      p: 0.5,
      collectedFees: noFees,
    }
    const generalP: CpmmState = {
      pool: { YES: 120, NO: 90 },
      p: 0.3,
      collectedFees: noFees,
    }
    console.log('\n--- 1. single-leg shares->cost inversion ---')
    row(
      'p=0.5 closed form, buy 50 shares',
      bench(() => calculateCpmmAmountToBuySharesFixedP(closedForm, 50, 'YES'))
    )
    row(
      'p=0.3 bisection (50 iter), buy 50 shares',
      bench(() => calculateCpmmAmountToBuySharesFixedP(generalP, 50, 'YES'))
    )
    row(
      'p=0.3 bisection (50 iter), sell 50 shares',
      bench(() => calculateCpmmAmountToBuySharesFixedP(generalP, -50, 'YES'))
    )
  })

  const runMulti = (
    answers: Answer[],
    basketSize: number,
    unfilled: LimitBet[],
    version: 'cpmm-multi-1' | 'cpmm-multi-2'
  ) => {
    // clone mutables per call so every iteration sees fresh state
    const bets = unfilled.map((b) => ({ ...b, fills: [] }))
    return calculateCpmmMultiArbitrageYesBets(
      answers,
      answers.slice(0, basketSize),
      100, // M$100
      undefined,
      bets,
      { maker: 100_000 },
      noFees,
      version
    )
  }

  it('2. multi-buy solve, n=10, 2-answer basket, M$100', () => {
    const n = 10
    const answersHalf = Array.from({ length: n }, (_, i) => getAnswer(i, 1 / n))
    const answersGenP = Array.from({ length: n }, (_, i) =>
      getAnswerWithP(i, 1 / n)
    )
    // ~5 resting limit orders on various answers: 2 YES just above current prob
    // on basket answers (crossed as basket prices rise), 3 YES just below
    // current prob on non-basket answers (crossed as arb pushes them down)
    const mkLimits = (answers: Answer[]) => [
      getLimitBet('l1', answers[0], 'YES', 'maker', 20, 0.13),
      getLimitBet('l2', answers[1], 'YES', 'maker', 20, 0.14),
      getLimitBet('l3', answers[3], 'YES', 'maker', 15, 0.09),
      getLimitBet('l4', answers[5], 'YES', 'maker', 15, 0.085),
      getLimitBet('l5', answers[7], 'YES', 'maker', 15, 0.095),
    ]

    // sanity: confirm the limit orders actually get consulted/filled
    for (const version of ['cpmm-multi-1', 'cpmm-multi-2'] as const) {
      const r = runMulti(answersHalf, 2, mkLimits(answersHalf), version)
      const makers =
        r.newBetResults.flatMap((b) => b.makers).length +
        r.otherBetResults.flatMap((b) => b.makers).length
      console.log(`sanity ${version}: maker fills with limits = ${makers}`)
      expect(makers).toBeGreaterThan(0)
    }

    console.log('\n--- 2. multi-buy solve, n=10, basket=2, M$100 ---')
    row(
      'v1, p=0.5, no limit orders',
      bench(() => runMulti(answersHalf, 2, [], 'cpmm-multi-1'))
    )
    row(
      'v2, p=0.5, no limit orders',
      bench(() => runMulti(answersHalf, 2, [], 'cpmm-multi-2'))
    )
    row(
      'v2, general per-answer p, no limit orders',
      bench(() => runMulti(answersGenP, 2, [], 'cpmm-multi-2'))
    )
    row(
      'v1, p=0.5, 5 resting limit orders',
      bench(() => runMulti(answersHalf, 2, mkLimits(answersHalf), 'cpmm-multi-1'))
    )
    row(
      'v2, p=0.5, 5 resting limit orders',
      bench(() => runMulti(answersHalf, 2, mkLimits(answersHalf), 'cpmm-multi-2'))
    )
    row(
      'v2, general per-answer p, 5 resting limit orders',
      bench(() => runMulti(answersGenP, 2, mkLimits(answersGenP), 'cpmm-multi-2'))
    )
  })

  it('3. scaling spot-check, n=50, 2-answer basket, M$100, no limits', () => {
    const n = 50
    const answersHalf = Array.from({ length: n }, (_, i) => getAnswer(i, 1 / n))
    const answersGenP = Array.from({ length: n }, (_, i) =>
      getAnswerWithP(i, 1 / n)
    )
    console.log('\n--- 3. multi-buy solve, n=50, basket=2, M$100, no limits ---')
    row(
      'v1, p=0.5',
      bench(() => runMulti(answersHalf, 2, [], 'cpmm-multi-1'))
    )
    row(
      'v2, p=0.5',
      bench(() => runMulti(answersHalf, 2, [], 'cpmm-multi-2'))
    )
    row(
      'v2, general per-answer p',
      bench(() => runMulti(answersGenP, 2, [], 'cpmm-multi-2'))
    )
    console.log(`\nnode ${process.version}`)
  })
})
