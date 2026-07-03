// Adversarial domain probe of the cpmm-multi-2 SELL paths at general p.
//
// Context: external review of the cpmm-multi-2 PR flagged that the sell-side
// code at p != 0.5 is untested and has no domain theorem. This probe exercises
// the sell entry points on sum-to-one markets with per-answer p far from 0.5
// and reports domain facts: NaN/throw, pool positivity, sum-to-one restoration,
// per-answer liquidity-invariant (k = Y^p * N^(1-p)) conservation, mana
// conservation from raw pool deltas, path independence, and buy->sell
// round-trip residuals.
//
// Sell entry points probed (all general-p on this branch, no version dispatch —
// v1 markets have answer.p == 0.5 so the same code is byte-identical for them):
//   - calculateCpmmMultiSumsToOneSale -> calculateCpmmMultiArbitrageSellYes/SellNo
//     (backend/api/src/sell-shares.ts -> common/src/sell-bet.ts:getCpmmMultiSellBetInfo)
//   - calculateCpmmMultiArbitrageSellYesEqually
//     (backend/api/src/multi-sell.ts -> common/src/sell-bet.ts:getCpmmMultiSellSharesInfo)
//
// Run with:  cd common && PROBE=1 npx jest sell-domain-probe --silent=false
// Skipped (describe.skip) in normal test runs.

import { sumBy } from 'lodash'
import { Answer } from './answer'
import { Bet, LimitBet } from './bet'
import {
  calculateCpmmMultiSumsToOneSale,
  getCpmmLiquidity,
  getCpmmProbability,
} from './calculate-cpmm'
import {
  calculateCpmmMultiArbitrageBet,
  calculateCpmmMultiArbitrageSellYesEqually,
  calculateCpmmMultiArbitrageYesBets,
} from './calculate-cpmm-arbitrage'
import { noFees } from './fees'

const d = process.env.PROBE ? describe : describe.skip

// ---------------------------------------------------------------- fixtures

// Answer with arbitrary (prob, p) and liquidity L = Y^p * N^(1-p).
// N/Y ratio r solves prob = p*N / (p*N + (1-p)*Y)  =>  r = (1-p)prob / (p(1-prob)).
const mkAnswer = (index: number, prob: number, p: number, L = 100): Answer => {
  const r = ((1 - p) * prob) / (p * (1 - prob))
  const poolYes = L / r ** (1 - p)
  const poolNo = poolYes * r
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
    p,
    totalLiquidity: 0,
    subsidyPool: 0,
    probChanges: { day: 0, week: 0, month: 0 },
    volume: 0,
  } as Answer
}

// v2-creation-style answer: p = prob (balanced pools Y = N = L), which is what
// the cpmm-multi-2 sqrt-variance creation rule produces.
const mkV2Answer = (index: number, prob: number, L = 100) =>
  mkAnswer(index, prob, prob, L)

const mkV2Market = (probs: number[], L = 100) =>
  probs.map((prob, i) => mkV2Answer(i, prob, L))

const bets = (shares: number) => [{ shares } as Bet]

const noBets: LimitBet[] = []
const noBalances: { [userId: string]: number } = {}

// ---------------------------------------------------------------- helpers

const probOf = (a: Answer) =>
  getCpmmProbability({ YES: a.poolYes, NO: a.poolNo }, a.p)
const sumProb = (answers: Answer[]) => sumBy(answers, probOf)
const liqOf = (a: Answer) =>
  getCpmmLiquidity({ YES: a.poolYes, NO: a.poolNo }, a.p)

// Apply a calculateCpmmMultiSumsToOneSale result to an answers array.
type CpmmStateLike = { pool: { [outcome: string]: number }; p: number }
const applySale = (
  answers: Answer[],
  answerToSellId: string,
  saleResult: {
    newBetResult: { cpmmState: CpmmStateLike }
    otherBetResults: { answer: Answer; cpmmState: CpmmStateLike }[]
  }
) =>
  answers.map((a) => {
    const r =
      a.id === answerToSellId
        ? saleResult.newBetResult
        : saleResult.otherBetResults.find((r) => r.answer.id === a.id)
    if (!r) return a
    const { pool, p } = r.cpmmState
    return {
      ...a,
      poolYes: pool.YES,
      poolNo: pool.NO,
      prob: getCpmmProbability(pool, p),
    }
  })

type Finding = {
  probe: string
  verdict: string
  detail: string
}
const findings: Finding[] = []
const record = (probe: string, verdict: string, detail: string) => {
  findings.push({ probe, verdict, detail })
  console.log(`[${verdict}] ${probe}: ${detail}`)
}

// Domain facts common to every probe: all pools finite & positive, sum-to-one
// restored, per-answer liquidity invariant preserved (fee constant is 0 and no
// makers, so k must be exactly conserved by AMM-only fills).
const domainStats = (before: Answer[], after: Answer[]) => {
  const pools = after.flatMap((a) => [a.poolYes, a.poolNo])
  const allFinite = pools.every((x) => Number.isFinite(x))
  const minPool = Math.min(...pools)
  const sumProbResidual = sumProb(after) - 1
  const maxLiqDrift = Math.max(
    ...after.map((a, i) => Math.abs(liqOf(a) / liqOf(before[i]) - 1))
  )
  return { allFinite, minPool, sumProbResidual, maxLiqDrift }
}

const fmtStats = (s: ReturnType<typeof domainStats>) =>
  `finite=${s.allFinite} minPool=${s.minPool.toExponential(2)} ` +
  `sumProb-1=${s.sumProbResidual.toExponential(2)} ` +
  `maxLiqDrift=${s.maxLiqDrift.toExponential(2)}`

// ---------------------------------------------------------------- probes

d('cpmm-multi-2 sell-path domain probe (general p)', () => {
  afterAll(() => {
    console.log('\n================ FINDINGS ================')
    console.table(findings)
  })

  // ---------------------------------------------------------------- P1
  describe('P1: sell on sum-to-one markets with p far from 0.5', () => {
    const markets: [string, number[]][] = [
      ['n=3 probs 0.1/0.1/0.8', [0.1, 0.1, 0.8]],
      ['n=10 probs 0.55 + 9x0.05', [0.55, ...Array(9).fill(0.05)]],
      ['n=30 probs 0.42 + 29x0.02', [0.42, ...Array(29).fill(0.02)]],
    ]

    it.each(markets)('single-answer sell YES + conservation: %s', (label, probs) => {
      const answers = mkV2Market(probs)
      // Sell YES of the highest-prob answer (largest arb footprint at general p)
      const idx = probs.indexOf(Math.max(...probs))
      const toSell = answers[idx]
      const S = 50

      const res = calculateCpmmMultiSumsToOneSale(
        answers,
        toSell,
        S,
        'YES',
        undefined,
        noBets,
        noBalances,
        noFees
      )
      const after = applySale(answers, toSell.id, res)
      const stats = domainStats(answers, after)

      // Mana conservation from raw pool deltas (fees are 0, no makers):
      // sold answer got one NO buy: b_i = dY_i; every other answer got one YES
      // buy: b_j = dN_j. Complete-set redemption identity: proceeds = S - sum(b).
      const bSold = after[idx].poolYes - answers[idx].poolYes
      const bOthers = after
        .filter((_, j) => j !== idx)
        .map((a, j2) => {
          const beforeA = answers.filter((_, j) => j !== idx)[j2]
          return a.poolNo - beforeA.poolNo
        })
      const totalBuy = bSold + sumBy(bOthers, (x) => x)
      const conservationResidual = res.saleValue - (S - totalBuy)

      // YES shares extracted per other answer should be equal across answers
      const sOthers = after
        .filter((_, j) => j !== idx)
        .map((a, j2) => {
          const beforeA = answers.filter((_, j) => j !== idx)[j2]
          return a.poolNo - beforeA.poolNo - (a.poolYes - beforeA.poolYes)
        })
      const sSpread = Math.max(...sOthers) - Math.min(...sOthers)

      const ok =
        stats.allFinite &&
        stats.minPool > 0 &&
        Math.abs(stats.sumProbResidual) < 1e-6 &&
        stats.maxLiqDrift < 1e-9 &&
        Math.abs(conservationResidual) < 1e-6 &&
        Number.isFinite(res.saleValue) &&
        res.saleValue > 0 &&
        res.saleValue < S

      record(
        `P1 sellYES ${label}`,
        ok ? 'SAFE' : 'BUG',
        `${fmtStats(stats)} saleValue=${res.saleValue.toFixed(6)} ` +
          `conservation=${conservationResidual.toExponential(2)} ` +
          `otherLegShareSpread=${sSpread.toExponential(2)}`
      )
      expect(stats.allFinite).toBe(true)
      expect(stats.minPool).toBeGreaterThan(0)
      expect(Math.abs(stats.sumProbResidual)).toBeLessThan(1e-6)
      expect(stats.maxLiqDrift).toBeLessThan(1e-9)
      expect(Math.abs(conservationResidual)).toBeLessThan(1e-6)
    })

    it.each(markets)('single-answer sell NO + conservation: %s', (label, probs) => {
      const answers = mkV2Market(probs)
      // Sell NO of the LOWEST-prob answer (NO shares near price 1, extreme p)
      const idx = probs.indexOf(Math.min(...probs))
      const toSell = answers[idx]
      const S = 50
      const n = answers.length

      const res = calculateCpmmMultiSumsToOneSale(
        answers,
        toSell,
        S,
        'NO',
        undefined,
        noBets,
        noBalances,
        noFees
      )
      const after = applySale(answers, toSell.id, res)
      const stats = domainStats(answers, after)

      // sold answer got one YES buy: b_i = dN_i, yesShares = dN_i - dY_i.
      // others got one NO buy each: b_j = dY_j.
      // redemption = yesShares + (n-1)*(S - yesShares); proceeds = redemption - sum(b)
      const bSold = after[idx].poolNo - answers[idx].poolNo
      const yesShares =
        after[idx].poolNo -
        answers[idx].poolNo -
        (after[idx].poolYes - answers[idx].poolYes)
      const bOthers = after
        .filter((_, j) => j !== idx)
        .map((a, j2) => {
          const beforeA = answers.filter((_, j) => j !== idx)[j2]
          return a.poolYes - beforeA.poolYes
        })
      const totalBuy = bSold + sumBy(bOthers, (x) => x)
      const redemption = yesShares + (n - 1) * (S - yesShares)
      const conservationResidual = res.saleValue - (redemption - totalBuy)

      const ok =
        stats.allFinite &&
        stats.minPool > 0 &&
        Math.abs(stats.sumProbResidual) < 1e-6 &&
        stats.maxLiqDrift < 1e-9 &&
        Math.abs(conservationResidual) < 1e-6 &&
        Number.isFinite(res.saleValue) &&
        res.saleValue > 0 &&
        res.saleValue < S

      record(
        `P1 sellNO ${label}`,
        ok ? 'SAFE' : 'BUG',
        `${fmtStats(stats)} saleValue=${res.saleValue.toFixed(6)} ` +
          `conservation=${conservationResidual.toExponential(2)}`
      )
      expect(stats.allFinite).toBe(true)
      expect(stats.minPool).toBeGreaterThan(0)
      expect(Math.abs(stats.sumProbResidual)).toBeLessThan(1e-6)
      expect(stats.maxLiqDrift).toBeLessThan(1e-9)
      expect(Math.abs(conservationResidual)).toBeLessThan(1e-6)
    })

    it('sell YES equally across a basket (multi-sell path), n=10', () => {
      const probs = [0.55, ...Array(9).fill(0.05)]
      const answers = mkV2Market(probs)
      // Unequal holdings across two answers exercises the while-loop passes
      const userBets = {
        [answers[0].id]: bets(50), // prob/p = 0.55
        [answers[1].id]: bets(30), // prob/p = 0.05
      }
      const res = calculateCpmmMultiArbitrageSellYesEqually(
        answers,
        userBets,
        noBets,
        noBalances,
        noFees
      )
      const after = res.updatedAnswers
      const stats = domainStats(answers, after)
      const proceeds = -sumBy(
        res.newBetResults.flatMap((r) => r.takers),
        'amount'
      )
      // opposite-side arb buys must net to zero mana and shares for the user
      const otherAmount = sumBy(
        res.otherBetResults.flatMap((r) => r.takers),
        'amount'
      )
      const otherShares = sumBy(
        res.otherBetResults.flatMap((r) => r.takers),
        'shares'
      )
      const ok =
        stats.allFinite &&
        stats.minPool > 0 &&
        Math.abs(stats.sumProbResidual) < 1e-6 &&
        stats.maxLiqDrift < 1e-9 &&
        proceeds > 0 &&
        proceeds < 80 &&
        Math.abs(otherAmount) < 1e-6

      record(
        'P1 sellYesEqually n=10 (50 @p=.55, 30 @p=.05)',
        ok ? 'SAFE' : 'BUG',
        `${fmtStats(stats)} proceeds=${proceeds.toFixed(6)} ` +
          `otherNetMana=${otherAmount.toExponential(2)} otherNetShares=${otherShares.toExponential(2)}`
      )
      expect(stats.allFinite).toBe(true)
      expect(Math.abs(stats.sumProbResidual)).toBeLessThan(1e-6)
      expect(stats.maxLiqDrift).toBeLessThan(1e-9)
      expect(Math.abs(otherAmount)).toBeLessThan(1e-6)
    })

    it('sell equal shares in ALL answers = exact complete-set redemption', () => {
      const probs = [0.1, 0.1, 0.8]
      const answers = mkV2Market(probs)
      const X = 37.5
      const userBets = Object.fromEntries(answers.map((a) => [a.id, bets(X)]))
      const res = calculateCpmmMultiArbitrageSellYesEqually(
        answers,
        userBets,
        noBets,
        noBalances,
        noFees
      )
      const proceeds = -sumBy(
        res.newBetResults.flatMap((r) => r.takers),
        'amount'
      )
      const poolsMoved = res.updatedAnswers.some(
        (a, i) => a.poolYes !== answers[i].poolYes || a.poolNo !== answers[i].poolNo
      )
      const ok = Math.abs(proceeds - X) < 1e-9 && !poolsMoved
      record(
        'P1 sell-all redemption n=3',
        ok ? 'SAFE' : 'BUG',
        `proceeds=${proceeds} (expected exactly ${X}), poolsMoved=${poolsMoved}`
      )
      expect(proceeds).toBeCloseTo(X, 9)
      expect(poolsMoved).toBe(false)
    })

    it('path independence: sell 50 once vs 25 + 25 sequentially', () => {
      const probs = [0.1, 0.1, 0.8]
      const answers = mkV2Market(probs)
      const toSell = answers[2]

      const once = calculateCpmmMultiSumsToOneSale(
        answers, toSell, 50, 'YES', undefined, noBets, noBalances, noFees
      )

      const first = calculateCpmmMultiSumsToOneSale(
        answers, toSell, 25, 'YES', undefined, noBets, noBalances, noFees
      )
      const mid = applySale(answers, toSell.id, first)
      const second = calculateCpmmMultiSumsToOneSale(
        mid, mid[2], 25, 'YES', undefined, noBets, noBalances, noFees
      )
      const afterOnce = applySale(answers, toSell.id, once)
      const afterTwice = applySale(mid, mid[2].id, second)

      const proceedsDiff =
        once.saleValue - (first.saleValue + second.saleValue)
      const maxPoolDiff = Math.max(
        ...afterOnce.flatMap((a, i) => [
          Math.abs(a.poolYes - afterTwice[i].poolYes),
          Math.abs(a.poolNo - afterTwice[i].poolNo),
        ])
      )
      const ok = Math.abs(proceedsDiff) < 1e-6 && maxPoolDiff < 1e-6
      record(
        'P1 path independence n=3',
        ok ? 'SAFE' : 'BUG',
        `proceedsDiff=${proceedsDiff.toExponential(2)} maxPoolDiff=${maxPoolDiff.toExponential(2)}`
      )
      expect(Math.abs(proceedsDiff)).toBeLessThan(1e-6)
      expect(maxPoolDiff).toBeLessThan(1e-6)
    })
  })

  // ---------------------------------------------------------------- P2
  //
  // CONFIRMED BUG (general-p specific): oversized sells NaN-poison the solver
  // and silently corner-collapse.
  //
  // Mechanism:
  //  1. A large opposite-outcome buy drives the off-side pool to
  //     residual = k^{1/(1-p)} / (pool+b)^{p/(1-p)}. At p far from 0.5 the
  //     exponent p/(1-p) makes this underflow below one ulp of (pool+b) at
  //     MODEST sizes (p=0.9, L=100: ~5,000 shares), so `n + b - s` in
  //     calculateCpmmPurchase cancels to EXACTLY 0. At p=0.5 the residual is
  //     k^2/b — it stays positive past b=1e9 (control below), so v1 never hits this.
  //  2. calculateCpmmPurchase -> addCpmmLiquidity(postBetPool, p, 0)
  //     (calculate-cpmm.ts:744) then computes newP = numerator/denominator
  //     with BOTH terms 0 when a pool side is 0  =>  newP = NaN.
  //  3. The sell binary search's comparator sums
  //     getCpmmProbability(pool, NaN) = NaN; binarySearch (util/algos.ts)
  //     treats NaN as "comparison <= 0" and walks min up  =>  silently returns
  //     the corner noShares = sharesSold, skipping the real interior root.
  //  4. Result: the market is left violating sum-to-one (Sigma prob = 0.1 in the
  //     fixture below), the sold answer's pool side is exactly 0 (liquidity
  //     invariant destroyed), and saleValue is discontinuously wrong
  //     (per-share value drops ~3x across the threshold).
  //
  // Blast radius: execution is saved by the CPMM_MIN_POOL_QTY (=0.01) check in
  // place-bet.ts validation (min pool 0 < 0.01 => APIError), so the corrupt
  // state should not persist — but the user's legitimate sell is rejected with
  // a misleading error, and CLIENT preview paths (getSaleResult /
  // getSaleResultMultiSumsToOne / expected-value displays) render the garbage
  // numbers. The same primitive (computeFills -> calculateCpmmPurchase) is
  // shared by buyNoSharesUntilAnswersSumToOne, so the sellYesEqually path and
  // v1-style arb loops share the exposure at general p.
  describe('P2: sell far more shares than the marginal pool can absorb', () => {
    const sellAndInspect = (
      answers: Answer[],
      toSell: Answer,
      S: number,
      outcome: 'YES' | 'NO'
    ) => {
      const res = calculateCpmmMultiSumsToOneSale(
        answers, toSell, S, outcome, undefined, noBets, noBalances, noFees
      )
      const after = applySale(answers, toSell.id, res)
      const stats = domainStats(answers, after)
      const anyNaNp = [
        res.newBetResult.cpmmState,
        ...res.otherBetResults.map((r) => r.cpmmState),
      ].some((st) => isNaN(st.p))
      return { res, after, stats, anyNaNp }
    }

    it('FIXED: sell 10,000 YES into thin pools (L=2), p far from 0.5', () => {
      const answers = mkV2Market([0.1, 0.1, 0.8], 2)
      const { res, stats, anyNaNp } = sellAndInspect(answers, answers[2], 10_000, 'YES')
      record(
        'P2 oversell 10k YES (L=2, p=0.8)',
        'FIXED',
        `NaN newP=${anyNaNp} ${fmtStats(stats)} saleValue=${res.saleValue.toFixed(4)} ` +
          `— solver finds the interior root; pool side still underflows to exactly 0 ` +
          `(physical; execution guarded by CPMM_MIN_POOL_QTY) but sum-to-one holds`
      )
      // These assertions PIN the fixed behavior (was: NaN newP -> silent corner
      // collapse with sumProb ~ 0.1; addCpmmLiquidity's 0/0 rescue + binarySearch
      // NaN fail-fast repaired it):
      expect(anyNaNp).toBe(false) // no NaN out of addCpmmLiquidity
      expect(stats.minPool).toBe(0) // the underflow itself is physical, still present
      expect(Math.abs(stats.sumProbResidual)).toBeLessThan(1e-9) // sum-to-one restored
      expect(isFinite(res.saleValue) && res.saleValue > 0).toBe(true)
    })

    it('FIXED: sell 10,000 NO into thin pools (L=2)', () => {
      const answers = mkV2Market([0.1, 0.1, 0.8], 2)
      const { res, stats, anyNaNp } = sellAndInspect(answers, answers[0], 10_000, 'NO')
      record(
        'P2 oversell 10k NO (L=2, p=0.1)',
        'FIXED',
        `NaN newP=${anyNaNp} ${fmtStats(stats)} saleValue=${res.saleValue.toFixed(4)} ` +
          `— mirror-image of the YES case: interior root found, sum-to-one holds`
      )
      expect(anyNaNp).toBe(false)
      expect(stats.minPool).toBe(0)
      expect(Math.abs(stats.sumProbResidual)).toBeLessThan(1e-9)
      expect(isFinite(res.saleValue) && res.saleValue > 0).toBe(true)
    })

    it('threshold sweep: p=0.9 with L=100 stays NaN-free through the old ~5,000-share cliff', () => {
      const rows: string[] = []
      let firstNaN: number | undefined
      for (const S of [500, 1000, 2000, 4000, 5000, 10000]) {
        const answers = [
          mkV2Answer(0, 0.05), mkV2Answer(1, 0.05), mkV2Answer(2, 0.9),
        ]
        const { res, stats, anyNaNp } = sellAndInspect(answers, answers[2], S, 'YES')
        rows.push(
          `S=${S}: sumProb=${(1 + stats.sumProbResidual).toFixed(4)} ` +
            `minPool=${stats.minPool.toExponential(1)} NaN=${anyNaNp} perShare=${(res.saleValue / S).toFixed(4)}`
        )
        if (anyNaNp && firstNaN === undefined) firstNaN = S
        // The old bug NaN'd from S≈5,000 (a realistic position size); pin clean math
        // and Σ=1 at every size now.
        expect(anyNaNp).toBe(false)
        expect(Math.abs(stats.sumProbResidual)).toBeLessThan(1e-9)
      }
      record(
        'P2 breakdown threshold (p=0.9, L=100)',
        'FIXED',
        rows.join(' | ') + ` — first NaN at S=${firstNaN} (was S=5000 pre-fix)`
      )
      expect(firstNaN).toBeUndefined()
    })

    it('control: p=0.5 pools never hit the NaN hole even at S=1e9', () => {
      const answers = [
        mkAnswer(0, 1 / 3, 0.5), mkAnswer(1, 1 / 3, 0.5), mkAnswer(2, 1 / 3, 0.5),
      ]
      const { stats, anyNaNp } = sellAndInspect(answers, answers[2], 1e9, 'YES')
      record(
        'P2 p=0.5 control (S=1e9, L=100)',
        'SAFE',
        `NaN newP=${anyNaNp} ${fmtStats(stats)} — residual pool decays only like k^2/b at p=0.5, ` +
          `so exact-zero cancellation is unreachable; the hole is general-p specific`
      )
      expect(anyNaNp).toBe(false)
      expect(stats.minPool).toBeGreaterThan(0)
      expect(Math.abs(stats.sumProbResidual)).toBeLessThan(1e-4)
    })
  })

  // ---------------------------------------------------------------- P3
  describe('P3: sells near the prob clamps (0.011 / 0.989)', () => {
    const cases: [string, number[], number, 'YES' | 'NO'][] = [
      ['sell YES of 0.989 answer (n=2)', [0.989, 0.011], 0, 'YES'],
      ['sell YES of 0.011 answer (n=2)', [0.989, 0.011], 1, 'YES'],
      ['sell NO of 0.011 answer (n=2, pushes it up through clamp)', [0.989, 0.011], 1, 'NO'],
      ['sell NO of 0.989 answer (n=2)', [0.989, 0.011], 0, 'NO'],
      ['sell YES of 0.011 answer (n=3 with 0.978)', [0.978, 0.011, 0.011], 1, 'YES'],
    ]
    it.each(cases)('%s', (label, probs, idx, outcome) => {
      const answers = mkV2Market(probs)
      const toSell = answers[idx]
      const S = 100
      let res
      let threw: string | undefined
      try {
        res = calculateCpmmMultiSumsToOneSale(
          answers, toSell, S, outcome, undefined, noBets, noBalances, noFees
        )
      } catch (e) {
        threw = (e as Error).message
      }
      if (threw) {
        record(`P3 ${label}`, 'THROWS', `throws: ${threw}`)
        return
      }
      const after = applySale(answers, toSell.id, res!)
      const stats = domainStats(answers, after)
      const probsAfter = after.map((a) => probOf(a).toFixed(6)).join(',')
      const ok =
        stats.allFinite &&
        stats.minPool > 0 &&
        Math.abs(stats.sumProbResidual) < 1e-6 &&
        stats.maxLiqDrift < 1e-9 &&
        Number.isFinite(res!.saleValue) &&
        res!.saleValue >= 0 &&
        res!.saleValue < S
      record(
        `P3 ${label}`,
        ok ? 'SAFE' : 'BUG',
        `${fmtStats(stats)} saleValue=${res!.saleValue.toFixed(6)} probsAfter=[${probsAfter}]`
      )
      expect(stats.allFinite).toBe(true)
      expect(stats.minPool).toBeGreaterThan(0)
      expect(Math.abs(stats.sumProbResidual)).toBeLessThan(1e-6)
      expect(stats.maxLiqDrift).toBeLessThan(1e-9)
    })
  })

  // ---------------------------------------------------------------- P4
  describe('P4: buy -> sell round trip (reversibility on the sell side)', () => {
    it('v2 basket buy (Approach C) then sellYesEqually back, n=5 general p', () => {
      const probs = [0.4, 0.3, 0.15, 0.1, 0.05]
      const answers = mkV2Market(probs)
      const basket = [answers[2], answers[4]] // p = 0.15 and 0.05
      const budget = 100

      const buy = calculateCpmmMultiArbitrageYesBets(
        answers,
        basket,
        budget,
        undefined,
        noBets,
        noBalances,
        noFees,
        'cpmm-multi-2'
      )
      const spent = sumBy(
        buy.newBetResults.flatMap((r) => r.takers),
        'amount'
      )
      const sharesByAnswerId = Object.fromEntries(
        buy.newBetResults.map((r) => [
          r.answer.id,
          sumBy(r.takers, 'shares'),
        ])
      )
      const userBets = Object.fromEntries(
        Object.entries(sharesByAnswerId).map(([id, s]) => [id, bets(s)])
      )

      const sell = calculateCpmmMultiArbitrageSellYesEqually(
        buy.updatedAnswers,
        userBets,
        noBets,
        noBalances,
        noFees
      )
      const proceeds = -sumBy(
        sell.newBetResults.flatMap((r) => r.takers),
        'amount'
      )
      const after = sell.updatedAnswers
      const stats = domainStats(answers, after)
      const netCost = spent - proceeds // fees are 0 => should be ~0
      const maxPoolRestoreErr = Math.max(
        ...answers.flatMap((a, i) => [
          Math.abs(a.poolYes - after[i].poolYes),
          Math.abs(a.poolNo - after[i].poolNo),
        ])
      )
      const ok =
        stats.allFinite &&
        Math.abs(stats.sumProbResidual) < 1e-6 &&
        Math.abs(netCost) < 0.01 &&
        maxPoolRestoreErr < 0.01
      record(
        'P4 round-trip basket (v2 buy M$100 -> sellYesEqually)',
        ok ? 'SAFE' : 'BUG',
        `spent=${spent.toFixed(8)} proceeds=${proceeds.toFixed(8)} ` +
          `netCost=${netCost.toExponential(3)} maxPoolRestoreErr=${maxPoolRestoreErr.toExponential(3)} ` +
          fmtStats(stats)
      )
      expect(Math.abs(netCost)).toBeLessThan(0.01)
      expect(maxPoolRestoreErr).toBeLessThan(0.01)
    })

    it('single-answer buy then sell back, extreme p (0.05), n=10', () => {
      const probs = [0.55, ...Array(9).fill(0.05)]
      const answers = mkV2Market(probs)
      const toBuy = answers[3]
      const budget = 100

      const buy = calculateCpmmMultiArbitrageBet(
        answers,
        toBuy,
        'YES',
        budget,
        undefined,
        noBets,
        noBalances,
        noFees
      )
      const spent = sumBy(buy.newBetResult.takers, 'amount')
      const shares = sumBy(buy.newBetResult.takers, 'shares')
      const mid = answers.map((a) => {
        const r =
          a.id === toBuy.id
            ? buy.newBetResult
            : buy.otherBetResults.find((r) => r.answer.id === a.id)
        if (!r) return a
        const { pool, p } = r.cpmmState
        return {
          ...a,
          poolYes: pool.YES,
          poolNo: pool.NO,
          prob: getCpmmProbability(pool, p),
        }
      })

      const sell = calculateCpmmMultiSumsToOneSale(
        mid,
        mid[3],
        shares,
        'YES',
        undefined,
        noBets,
        noBalances,
        noFees
      )
      const after = applySale(mid, mid[3].id, sell)
      const stats = domainStats(answers, after)
      const netCost = spent - sell.saleValue
      const maxPoolRestoreErr = Math.max(
        ...answers.flatMap((a, i) => [
          Math.abs(a.poolYes - after[i].poolYes),
          Math.abs(a.poolNo - after[i].poolNo),
        ])
      )
      const ok =
        stats.allFinite &&
        Math.abs(stats.sumProbResidual) < 1e-6 &&
        Math.abs(netCost) < 0.01 &&
        maxPoolRestoreErr < 0.01
      record(
        'P4 round-trip single answer (buy M$100 YES @p=0.05 -> sell)',
        ok ? 'SAFE' : 'BUG',
        `spent=${spent.toFixed(8)} shares=${shares.toFixed(6)} proceeds=${sell.saleValue.toFixed(8)} ` +
          `netCost=${netCost.toExponential(3)} maxPoolRestoreErr=${maxPoolRestoreErr.toExponential(3)} ` +
          fmtStats(stats)
      )
      expect(Math.abs(netCost)).toBeLessThan(0.01)
      expect(maxPoolRestoreErr).toBeLessThan(0.01)
    })
  })

  // ---------------------------------------------------------------- P5
  describe('P5: what v1 (p=0.5-hardcoded) sell math would do on a v2 market', () => {
    // The branch threads answer.p through every sell path, so there is no
    // missing-dispatch hole to demonstrate on live code. This probe instead
    // quantifies what ANY missed call site would cost: run the same sale with
    // the pre-branch behavior (states built at p=0.5 over the same pools) and
    // evaluate the resulting pools under the TRUE p.
    it('divergence of p=0.5 sell math on a general-p fixture', () => {
      const probs = [0.1, 0.1, 0.8]
      const answersV2 = mkV2Market(probs)
      // Pre-branch emulation: identical pools, but every cpmm state gets p=0.5
      // (this is exactly what the old `p: 0.5` hardcodes produced).
      const answersV1math = answersV2.map((a) => ({
        ...a,
        p: 0.5,
        prob: getCpmmProbability({ YES: a.poolYes, NO: a.poolNo }, 0.5),
      }))
      const S = 50

      const v2res = calculateCpmmMultiSumsToOneSale(
        answersV2, answersV2[2], S, 'YES', undefined, noBets, noBalances, noFees
      )
      const v1res = calculateCpmmMultiSumsToOneSale(
        answersV1math, answersV1math[2], S, 'YES', undefined, noBets, noBalances, noFees
      )

      // Evaluate the v1-math result under the TRUE per-answer p
      const afterV1 = applySale(answersV1math, answersV1math[2].id, v1res)
      const sumProbTrue = afterV1
        .map((a, i) =>
          getCpmmProbability({ YES: a.poolYes, NO: a.poolNo }, answersV2[i].p)
        )
        .reduce((x, y) => x + y, 0)
      const saleValueDiff = v1res.saleValue - v2res.saleValue

      record(
        'P5 v1-math-on-v2 divergence (hypothetical missed dispatch)',
        'INFO',
        `saleValue v2=${v2res.saleValue.toFixed(4)} v1math=${v1res.saleValue.toFixed(4)} ` +
          `diff=${saleValueDiff.toFixed(4)} (${((saleValueDiff / v2res.saleValue) * 100).toFixed(2)}%); ` +
          `sumProb under TRUE p after v1-math sell=${sumProbTrue.toFixed(6)} (should be 1)`
      )
      // No assertion: current code paths all use answer.p (verified by P1-P4).
      // This documents the blast radius if a future call site regresses.
      expect(Number.isFinite(saleValueDiff)).toBe(true)
    })
  })
})
