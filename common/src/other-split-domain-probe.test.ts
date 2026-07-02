// Adversarial domain probe for the cpmm-multi-2 "Other split" math in
// backend/api/src/create-answer-cpmm.ts :: createAnswerAndSumAnswersToOneV2
// (lines 472-574 on branch feat/cpmm-multi-2).
//
// The DB handler is inseparable from the transaction plumbing, so the pure
// pool/p construction (create-answer-cpmm.ts lines 492-506, plus the answer
// fields set at lines 509-525) is TRANSCRIBED below as `splitOther`. Line
// numbers cited inline. Production files are NOT modified.
//
// Probes:
//   1. Tiny Other: probOther in {0.05, 0.021, 0.02, 0.015, 0.011}
//   2. Repeated splits: Other from 0.5, split 8x
//   3. Small pools: Yo/No in 1..10 mana vs answerCost 25 (min tier) and 100
//   4. pOther != 0.5 (post-drizzle drift): lossless claim at general p
//   5. Guard check is static (see report); here we confirm the math itself
//      never throws/NaNs below the floor, i.e. nothing in the math stops it.
//
// Run with:
//   cd common && PROBE=1 npx jest other-split-domain-probe --silent=false
// Skipped (describe.skip) in normal test runs / CI.

import {
  calculateCpmmAmountToBuySharesFixedP,
  calculateCpmmShares,
  getCpmmLiquidity,
  getCpmmProbability,
  CpmmState,
} from './calculate-cpmm'
import { MIN_CPMM_PROB, MAX_CPMM_PROB } from './contract'
import { noFees } from './fees'

// ---------------------------------------------------------------------------
// Transcription of createAnswerAndSumAnswersToOneV2's pure math.
// Source: backend/api/src/create-answer-cpmm.ts
//   line 492: const Yo = otherAnswer.poolYes
//   line 493: const No = otherAnswer.poolNo
//   line 494: const pOther = otherAnswer.p ?? 0.5
//   line 495: const probOther = getCpmmProbability({ YES: Yo, NO: No }, pOther)
//   line 496: const targetProb = probOther / 2
//   line 497: const a = answerCost / 2
//   lines 500-501: weightFor = (pool, q) => q*Y / (q*Y + (1-q)*N)
//   line 503: newAnswerPool = { YES: Yo + a, NO: a }
//   line 504: newOtherPool  = { YES: Yo + a, NO: a }
//   lines 505-506: newAnswerP / newOtherP = weightFor(pool, targetProb)
//   lines 509-525: prob = targetProb, totalLiquidity = getCpmmLiquidity(pool, p)
// ---------------------------------------------------------------------------
type Pool = { YES: number; NO: number }

const weightFor = (pool: Pool, q: number) =>
  (q * pool.YES) / (q * pool.YES + (1 - q) * pool.NO)

const splitOther = (
  Yo: number,
  No: number,
  pOther: number,
  answerCost: number
) => {
  const probOther = getCpmmProbability({ YES: Yo, NO: No }, pOther)
  const targetProb = probOther / 2
  const a = answerCost / 2

  const newAnswerPool: Pool = { YES: Yo + a, NO: a }
  const newOtherPool: Pool = { YES: Yo + a, NO: a }
  const newAnswerP = weightFor(newAnswerPool, targetProb)
  const newOtherP = weightFor(newOtherPool, targetProb)

  return {
    probOther,
    targetProb,
    newAnswer: {
      pool: newAnswerPool,
      p: newAnswerP,
      prob: targetProb,
      totalLiquidity: getCpmmLiquidity(newAnswerPool, newAnswerP),
    },
    newOther: {
      pool: newOtherPool,
      p: newOtherP,
      prob: targetProb,
      totalLiquidity: getCpmmLiquidity(newOtherPool, newOtherP),
    },
  }
}

// Pool at a given displayed prob for given p and liquidity L = Y^p * N^(1-p).
// From prob = pN / ((1-p)Y + pN): N/Y = (1-p)q / (p(1-q)).
const poolAtProb = (q: number, p: number, L: number): Pool => {
  const ratio = ((1 - p) * q) / (p * (1 - q)) // N/Y
  const Y = L / ratio ** (1 - p)
  const N = Y * ratio
  return { YES: Y, NO: N }
}

const fin = (x: number) => Number.isFinite(x)

// Exercise a follow-up trade on a freshly split answer: displayed prob, a
// M$10 YES and NO buy via the forward map, and cost-for-10-shares via the
// general-p bisection inverse (calculateCpmmAmountToBuySharesFixedP).
const tradeCheck = (pool: Pool, p: number) => {
  const state: CpmmState = { pool, p, collectedFees: noFees }
  const prob = getCpmmProbability(pool, p)
  const yesShares10 = calculateCpmmShares(pool, p, 10, 'YES')
  const noShares10 = calculateCpmmShares(pool, p, 10, 'NO')
  const costYes10 = calculateCpmmAmountToBuySharesFixedP(state, 10, 'YES')
  const costNo10 = calculateCpmmAmountToBuySharesFixedP(state, 10, 'NO')
  const probAfterYes10 = getCpmmProbability(
    { YES: pool.YES + 10 - yesShares10, NO: pool.NO + 10 },
    p
  )
  const ok =
    fin(prob) &&
    fin(yesShares10) &&
    fin(noShares10) &&
    fin(costYes10) &&
    fin(costNo10) &&
    fin(probAfterYes10) &&
    yesShares10 > 0 &&
    noShares10 > 0 &&
    costYes10 > 0 &&
    costNo10 > 0
  return { prob, yesShares10, noShares10, costYes10, costNo10, probAfterYes10, ok }
}

const f = (x: number, d = 6) => Number(x.toFixed(d))

const d = process.env.PROBE ? describe : describe.skip

d('other-split domain probe (cpmm-multi-2 v2)', () => {
  // ------------------------------------------------------------------ edge 1
  it('1. tiny Other: probOther in {0.05, 0.021, 0.02, 0.015, 0.011}', () => {
    const answerCost = 25 // min tier, common/src/tier.ts:2
    const rows: any[] = []
    for (const q of [0.05, 0.021, 0.02, 0.015, 0.011]) {
      const pool = poolAtProb(q, 0.5, 100) // liquidity-100 Other at p=0.5
      const r = splitOther(pool.YES, pool.NO, 0.5, answerCost)
      const t = tradeCheck(r.newAnswer.pool, r.newAnswer.p)
      rows.push({
        probOther: q,
        childProb: f(r.targetProb),
        belowFloor: r.targetProb < MIN_CPMM_PROB,
        poolYES: f(r.newAnswer.pool.YES, 3),
        poolNO: f(r.newAnswer.pool.NO, 3),
        p: f(r.newAnswer.p),
        liq: f(r.newAnswer.totalLiquidity, 3),
        probRoundTrip: f(t.prob),
        cost10YES: f(t.costYes10, 4),
        cost10NO: f(t.costNo10, 4),
        probAfterYes10: f(t.probAfterYes10),
        tradeMathOk: t.ok,
      })
      // The math itself never guards or degrades: everything finite,
      // pools positive, p in (0,1), displayed prob == targetProb.
      expect(t.ok).toBe(true)
      expect(r.newAnswer.p).toBeGreaterThan(0)
      expect(r.newAnswer.p).toBeLessThan(1)
      expect(t.prob).toBeCloseTo(r.targetProb, 12)
      // Both children identical by construction (lines 503-506).
      expect(r.newOther.p).toBe(r.newAnswer.p)
    }
    console.table(rows)
    // The floor violations we are demonstrating:
    expect(rows.filter((r) => r.belowFloor).map((r) => r.probOther)).toEqual([
      0.015, 0.011,
    ])
    // probOther = 0.02 lands exactly ON the floor (0.01), not below.
    expect(rows.find((r) => r.probOther === 0.02)!.childProb).toBeCloseTo(
      MIN_CPMM_PROB,
      12
    )
  })

  // ------------------------------------------------------------------ edge 2
  it('2. repeated splits: Other from 0.5, 8 splits, find degeneracy point', () => {
    const answerCost = 25
    // Fresh v2 Other: balanced answerCost pool at p=0.5 (create-answer-cpmm.ts
    // lines 148-151 use poolYes = poolNo = answerCost for new answers).
    let Yo = 25
    let No = 25
    let p = 0.5
    const rows: any[] = []
    let firstSubFloor: number | null = null
    for (let i = 1; i <= 8; i++) {
      const r = splitOther(Yo, No, p, answerCost)
      const t = tradeCheck(r.newOther.pool, r.newOther.p)
      rows.push({
        split: i,
        probBefore: f(r.probOther),
        childProb: f(r.targetProb, 8),
        belowFloor: r.targetProb < MIN_CPMM_PROB,
        poolYES: f(r.newOther.pool.YES, 3),
        poolNO: f(r.newOther.pool.NO, 3),
        p: f(r.newOther.p, 8),
        liq: f(r.newOther.totalLiquidity, 3),
        cost10YES: f(t.costYes10, 4),
        tradeMathOk: t.ok,
      })
      if (firstSubFloor === null && r.targetProb < MIN_CPMM_PROB)
        firstSubFloor = i
      expect(t.ok).toBe(true) // math never breaks, it just keeps halving
      // Other' becomes the Other for the next split.
      Yo = r.newOther.pool.YES
      No = r.newOther.pool.NO
      p = r.newOther.p
    }
    console.table(rows)
    console.log(
      `first split producing children below MIN_CPMM_PROB=${MIN_CPMM_PROB}: split #${firstSubFloor}`
    )
    // 0.5 -> 0.25 -> 0.125 -> 0.0625 -> 0.03125 -> 0.015625 -> 0.0078125
    expect(firstSubFloor).toBe(6)
    // Nothing NaN/negative even at split 8 (prob ~0.00195):
    const last = rows[rows.length - 1]
    expect(last.tradeMathOk).toBe(true)
    expect(last.childProb).toBeGreaterThan(0)
  })

  // ------------------------------------------------------------------ edge 3
  it('3. small pools: Yo/No in {1,5,10} mana vs answerCost {25,100}', () => {
    const rows: any[] = []
    for (const answerCost of [25, 100]) {
      for (const Yo of [1, 5, 10]) {
        for (const No of [1, 5, 10]) {
          const r = splitOther(Yo, No, 0.5, answerCost)
          const t = tradeCheck(r.newAnswer.pool, r.newAnswer.p)
          const roundTripErr =
            Math.abs(t.prob - r.targetProb) / r.targetProb
          rows.push({
            answerCost,
            Yo,
            No,
            probOther: f(r.probOther),
            childProb: f(r.targetProb),
            p: f(r.newAnswer.p),
            poolYES: f(r.newAnswer.pool.YES, 2),
            poolNO: f(r.newAnswer.pool.NO, 2),
            relRoundTripErr: roundTripErr.toExponential(2),
            tradeMathOk: t.ok,
          })
          expect(t.ok).toBe(true)
          expect(r.newAnswer.p).toBeGreaterThan(0)
          expect(r.newAnswer.p).toBeLessThan(1)
          expect(roundTripErr).toBeLessThan(1e-12)
        }
      }
    }
    console.table(rows)
    const ps = rows.map((r) => r.p)
    console.log(`p range across grid: [${Math.min(...ps)}, ${Math.max(...ps)}]`)
  })

  // ------------------------------------------------------------------ edge 4
  it('4. pOther != 0.5 (post-drizzle drift): lossless at general p', () => {
    // Listed answers with general p; v2 never touches their pools
    // (create-answer-cpmm.ts lines 503-528 only build A and Other';
    // lines 535-552 credit off-pool redemption bets with
    // probBefore = probAfter = listed.prob). Verify bit-identity anyway,
    // plus exact prob-mass conservation: A + Other' == probOther.
    const listed = [
      { pool: { YES: 137.2, NO: 84.9 }, p: 0.6321 },
      { pool: { YES: 12.4, NO: 331.7 }, p: 0.2874 },
      { pool: { YES: 55.5, NO: 55.5 }, p: 0.5 },
    ].map((a) => ({ ...a, prob: getCpmmProbability(a.pool, a.p) }))
    Object.freeze(listed)
    listed.forEach((a) => Object.freeze(a.pool))

    const rows: any[] = []
    for (const pOther of [0.3, 0.417, 0.5, 0.7, 0.913]) {
      for (const [Yo, No] of [
        [80, 120],
        [33.7, 210.4],
        [500, 12],
      ]) {
        const probsBefore = listed.map((a) => getCpmmProbability(a.pool, a.p))
        const r = splitOther(Yo, No, pOther, 25)
        const probsAfter = listed.map((a) => getCpmmProbability(a.pool, a.p))

        // (a) listed probs bit-identical (=== on doubles)
        probsBefore.forEach((pb, i) => expect(probsAfter[i]).toBe(pb))
        // (b) children's displayed prob equals targetProb (weightFor exact
        //     inverse of getCpmmProbability)
        const dispA = getCpmmProbability(r.newAnswer.pool, r.newAnswer.p)
        const dispO = getCpmmProbability(r.newOther.pool, r.newOther.p)
        // (c) prob mass conserved: A + Other' == probOther (targetProb*2)
        const massErr = Math.abs(dispA + dispO - r.probOther)

        rows.push({
          pOther,
          Yo,
          No,
          probOther: f(r.probOther, 8),
          dispA: f(dispA, 8),
          dispOther2: f(dispO, 8),
          massErr: massErr.toExponential(2),
          childP: f(r.newAnswer.p, 8),
          listedBitIdentical: probsAfter.every((x, i) => x === probsBefore[i]),
        })
        expect(Math.abs(dispA - r.targetProb)).toBeLessThan(1e-15)
        expect(massErr).toBeLessThan(1e-14)
      }
    }
    console.table(rows)
  })

  // ------------------------------------------------------------------ edge 5
  it('5. no guard: math happily splits an Other already at/below 0.02', () => {
    // Static finding (see report): verifyContract (create-answer-cpmm.ts
    // lines 80-110) checks token/mechanism/closeTime/addAnswersMode only;
    // createAnswerCpmmMain checks balance (line 129) and maxAnswers
    // (line 141). No probOther / MIN_CPMM_PROB check exists on the v2 path.
    // Here: confirm the math itself raises no error and emits valid-looking
    // (finite, tradeable) sub-floor answers — i.e. nothing downstream of the
    // handler would stop it either.
    const rows: any[] = []
    for (const q of [0.02, 0.011, 0.0101, 0.005, 0.002]) {
      const pool = poolAtProb(q, 0.5, 100)
      const r = splitOther(pool.YES, pool.NO, 0.5, 25)
      const t = tradeCheck(r.newAnswer.pool, r.newAnswer.p)
      rows.push({
        probOther: q,
        alreadySubFloor: q < MIN_CPMM_PROB,
        childProb: f(r.targetProb, 8),
        childBelowFloor: r.targetProb < MIN_CPMM_PROB,
        p: f(r.newAnswer.p, 8),
        tradeMathOk: t.ok,
      })
      expect(t.ok).toBe(true) // no throw, no NaN — GUARD MISSING upstream
    }
    console.table(rows)
    expect(rows.every((r) => r.tradeMathOk)).toBe(true)
    expect(
      rows.filter((r) => r.childBelowFloor).length
    ).toBeGreaterThanOrEqual(4)
  })

  // sanity: floor constants are what we think they are
  it('constants', () => {
    expect(MIN_CPMM_PROB).toBe(0.01)
    expect(MAX_CPMM_PROB).toBe(0.99)
  })
})
