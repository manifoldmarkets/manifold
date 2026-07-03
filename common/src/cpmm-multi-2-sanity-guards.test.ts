import { range } from 'lodash'
import {
  addCpmmMultiLiquidityAnswersSumToOneV2,
  cpmmMulti2SumToOneFeasible,
  cpmmMulti2SumToOnePools,
  getCpmmProbability,
} from './calculate-cpmm'

// GP19a/GP19c runtime guards (proofs/sanity_closure.py; found by external review of
// PR #3934: the √variance creation construction is not total — skewed many-answer
// prob vectors produce poolYes < 0 and p ∉ (0,1)).
//
// Boundary calibration (GP19a, rest-uniform dominant family):
//   n ≤ 20  feasible for ALL q; boundary first appears at n = 21
//   n = 30  q_max ≈ 0.586;  n = 50  q_max ≈ 0.323;  n = 100  q_max ≈ 0.157
// Two-big-answers family breaks at combined mass ≈ 0.851 (n=10), 0.445 (n=30).
// Geometric decay breaks at n = 10 already for ratio r < 0.563.

const dominant = (n: number, qMax: number) => [
  qMax,
  ...range(n - 1).map(() => (1 - qMax) / (n - 1)),
]

const twoBig = (n: number, combined: number) => [
  combined / 2,
  combined / 2,
  ...range(n - 2).map(() => (1 - combined) / (n - 2)),
]

const geometric = (n: number, r: number) => {
  const raw = range(n).map((i) => Math.pow(r, i))
  const total = raw.reduce((s, x) => s + x, 0)
  return raw.map((x) => x / total)
}

const sane = (x: { poolYes: number; poolNo: number; p: number }) =>
  x.poolYes > 0 && x.poolNo > 0 && x.p > 0 && x.p < 1

describe('cpmmMulti2SumToOneFeasible (GP19a)', () => {
  it('accepts every dominant-prob vector for n ≤ 20', () => {
    for (const n of [3, 5, 10, 15, 20]) {
      for (const qMax of [0.05, 0.3, 0.5, 0.7, 0.9, 0.97]) {
        expect(cpmmMulti2SumToOneFeasible(dominant(n, qMax))).toBe(true)
      }
    }
  })

  it('rejects the review repro: n = 30, 0.90 dominant', () => {
    expect(cpmmMulti2SumToOneFeasible(dominant(30, 0.9))).toBe(false)
  })

  it('tracks the n = 30 boundary (q_max ≈ 0.586)', () => {
    expect(cpmmMulti2SumToOneFeasible(dominant(30, 0.55))).toBe(true)
    expect(cpmmMulti2SumToOneFeasible(dominant(30, 0.62))).toBe(false)
  })

  it('tracks the n = 100 boundary (q_max ≈ 0.157)', () => {
    expect(cpmmMulti2SumToOneFeasible(dominant(100, 0.13))).toBe(true)
    expect(cpmmMulti2SumToOneFeasible(dominant(100, 0.19))).toBe(false)
  })

  it('tracks the two-big-answers family (n = 10 breaks near combined 0.851)', () => {
    expect(cpmmMulti2SumToOneFeasible(twoBig(10, 0.8))).toBe(true)
    expect(cpmmMulti2SumToOneFeasible(twoBig(10, 0.9))).toBe(false)
  })

  it('tracks geometric decay (n = 10 breaks for r < 0.563)', () => {
    expect(cpmmMulti2SumToOneFeasible(geometric(10, 0.6))).toBe(true)
    expect(cpmmMulti2SumToOneFeasible(geometric(10, 0.5))).toBe(false)
  })

  it('agrees with direct construction sanity across a grid (the exact test)', () => {
    // The helper IS "construct at ante 1 and check" — this pins the equivalence at
    // production ante and asserts feasible vectors construct sane at scale.
    for (const n of [21, 30, 50]) {
      for (const qMax of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        const q = dominant(n, qMax)
        const feasible = cpmmMulti2SumToOneFeasible(q)
        const pools = cpmmMulti2SumToOnePools(q, 1000)
        expect(pools.every(sane)).toBe(feasible)
      }
    }
  })
})

describe('addCpmmMultiLiquidityAnswersSumToOneV2 guard (GP19c)', () => {
  // A sane TRADED market sitting at creation-infeasible probs: build it directly
  // (balanced pools at p = q read prob = q for any q — sane for every vector).
  const stateAt = (q: number[], scale = 100) =>
    Object.fromEntries(
      q.map((qi, i) => [
        `a${i}`,
        { pool: { YES: scale, NO: scale }, p: qi },
      ])
    )

  const checkSaneAndProbPreserving = (
    q: number[],
    amount: number
  ) => {
    const pools = stateAt(q)
    const result = addCpmmMultiLiquidityAnswersSumToOneV2(pools, amount)
    const ids = Object.keys(pools)
    let probSum = 0
    for (const [i, id] of ids.entries()) {
      const { pool, p } = result[id]
      expect(pool.YES).toBeGreaterThan(0)
      expect(pool.NO).toBeGreaterThan(0)
      expect(p).toBeGreaterThan(0)
      expect(p).toBeLessThan(1)
      const prob = getCpmmProbability(pool, p)
      expect(prob).toBeCloseTo(q[i], 9) // lossless: every prob preserved
      probSum += prob
      expect(result[id].liquidity).toBeGreaterThan(0)
    }
    expect(probSum).toBeCloseTo(1, 9)
  }

  it('merge path (feasible q): sane, prob-preserving, √variance-shaped', () => {
    const q = dominant(10, 0.5)
    checkSaneAndProbPreserving(q, 500)
    // Deltas match the creation shape at current probs (the un-guarded merge).
    const pools = stateAt(q)
    const result = addCpmmMultiLiquidityAnswersSumToOneV2(pools, 500)
    const delta = cpmmMulti2SumToOnePools(q, 500)
    Object.keys(pools).forEach((id, i) => {
      expect(result[id].pool.YES).toBeCloseTo(100 + delta[i].poolYes, 9)
      expect(result[id].pool.NO).toBeCloseTo(100 + delta[i].poolNo, 9)
    })
  })

  it('infeasible q + large add stays sane and prob-preserving (fallback engages)', () => {
    // n = 30, 0.90 dominant: creation-infeasible, so a large enough merge would drive
    // merged poolYes < 0. The guard must keep every pool sane with probs preserved.
    checkSaneAndProbPreserving(dominant(30, 0.9), 100_000)
  })

  it('infeasible q survives an accumulating drizzle (many small adds)', () => {
    // GP19c(iii): dripping does not evade the A* bound — each tick re-guards.
    const q = dominant(30, 0.9)
    let pools = stateAt(q)
    for (let tick = 0; tick < 50; tick++) {
      const result = addCpmmMultiLiquidityAnswersSumToOneV2(pools, 1000)
      pools = Object.fromEntries(
        Object.keys(pools).map((id) => [
          id,
          { pool: result[id].pool, p: result[id].p },
        ])
      )
    }
    Object.values(pools).forEach(({ pool, p }) => {
      expect(pool.YES).toBeGreaterThan(0)
      expect(pool.NO).toBeGreaterThan(0)
      expect(p).toBeGreaterThan(0)
      expect(p).toBeLessThan(1)
    })
    const probSum = Object.keys(pools)
      .map((id) => getCpmmProbability(pools[id].pool, pools[id].p))
      .reduce((s, x) => s + x, 0)
    expect(probSum).toBeCloseTo(1, 9)
  })

  it('small add below A* on infeasible q still uses the merge (no premature fallback)', () => {
    // At infeasible q the merge is still sane for small totals (A* > 0); the guard
    // must not fall back until the merge itself would go insane.
    const q = dominant(30, 0.9)
    const pools = stateAt(q, 10_000) // deep pools => large A*
    const result = addCpmmMultiLiquidityAnswersSumToOneV2(pools, 10)
    const delta = cpmmMulti2SumToOnePools(q, 10)
    Object.keys(pools).forEach((id, i) => {
      expect(result[id].pool.YES).toBeCloseTo(10_000 + delta[i].poolYes, 6)
      expect(result[id].pool.NO).toBeCloseTo(10_000 + delta[i].poolNo, 6)
    })
  })
})
