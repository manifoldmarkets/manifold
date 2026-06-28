import { mapValues, sum } from 'lodash'
import {
  addCpmmLiquidity,
  addCpmmLiquidityFixedP,
  addCpmmMultiLiquidityAnswersSumToOneV2,
  addCpmmMultiLiquidityToAnswersIndependentlyV2,
  calculateCpmmAmountToBuySharesFixedP,
  calculateCpmmPurchase,
  calculateCpmmShares,
  CpmmState,
  getCpmmOutcomeProbabilityAfterBet,
  getCpmmProbability,
  removeCpmmLiquidity,
} from './calculate-cpmm'
import { noFees } from './fees'

describe('CPMM Calculations', () => {
  describe('getCpmmProbability', () => {
    it('should return 0.5 for equal pool values', () => {
      const pool = { YES: 100, NO: 100 }
      const p = 0.5
      expect(getCpmmProbability(pool, p)).toBeCloseTo(0.5)
    })

    it('should return correct probability for 1 : 3', () => {
      const pool = { YES: 150, NO: 50 }
      const p = 0.5
      expect(getCpmmProbability(pool, p)).toBeCloseTo(0.25)
    })

    it('probability should be between 0 and 1', () => {
      const testCases = [
        { pool: { YES: 1000000, NO: 1 }, p: 0.5 },
        { pool: { YES: 1, NO: 1000000 }, p: 0.5 },
        { pool: { YES: 1, NO: 100 }, p: 0.000001 },
        { pool: { YES: 1, NO: 100 }, p: 0.999999 },
      ]

      testCases.forEach(({ pool, p }) => {
        const prob = getCpmmProbability(pool, p)
        expect(prob).toBeGreaterThan(0)
        expect(prob).toBeLessThan(1)
      })
    })
  })

  describe('calculateCpmmShares', () => {
    it('should return 0 shares for 0 bet amount', () => {
      const pool = { YES: 100, NO: 100 }
      const p = 0.5
      const betAmount = 0
      const betChoice = 'YES'
      expect(calculateCpmmShares(pool, p, betAmount, betChoice)).toBe(0)
    })

    it('should return positive shares for YES bet', () => {
      const pool = { YES: 100, NO: 100 }
      const p = 0.5
      const betAmount = 10
      const betChoice = 'YES'
      const shares = calculateCpmmShares(pool, p, betAmount, betChoice)
      expect(shares).toBeGreaterThan(0)
    })

    it('should return positive shares for NO bet', () => {
      const pool = { YES: 100, NO: 100 }
      const p = 0.5
      const betAmount = 10
      const betChoice = 'NO'
      const shares = calculateCpmmShares(pool, p, betAmount, betChoice)
      expect(shares).toBeGreaterThan(0)
    })
  })

  describe('calculateCpmmPurchase', () => {
    const initialState: CpmmState = {
      pool: { YES: 100, NO: 100 },
      p: 0.5,
      collectedFees: noFees,
    }

    it('should maintain constant product after bet with p = 0.5', () => {
      const { newPool } = calculateCpmmPurchase(initialState, 10, 'YES')
      const initialProduct = initialState.pool.YES * initialState.pool.NO
      const newProduct = newPool.YES * newPool.NO
      expect(newProduct).toBeCloseTo(initialProduct, 5)
    })
  })

  describe('getCpmmOutcomeProbabilityAfterBet', () => {
    const initialState: CpmmState = {
      pool: { YES: 100, NO: 100 },
      p: 0.5,
      collectedFees: noFees,
    }

    it('should increase YES probability after YES bet', () => {
      const newProb = getCpmmOutcomeProbabilityAfterBet(initialState, 'YES', 10)
      expect(newProb).toBeGreaterThan(0.5)
    })

    it('should increase NO probability after NO bet', () => {
      const newProb = getCpmmOutcomeProbabilityAfterBet(initialState, 'NO', 10)
      expect(newProb).toBeGreaterThan(0.5)
    })

    it('should not change probability for 0 bet amount', () => {
      const newProb = getCpmmOutcomeProbabilityAfterBet(initialState, 'YES', 0)
      expect(newProb).toBeCloseTo(0.5)
    })
  })

  describe('addCpmmLiquidity', () => {
    it('should increase liquidity correctly', () => {
      const pool = { YES: 100, NO: 100 }
      const p = 0.5
      const amount = 10

      const { newPool, liquidity } = addCpmmLiquidity(pool, p, amount)

      expect(newPool.YES).toBe(110)
      expect(newPool.NO).toBe(110)
      expect(liquidity).toBeGreaterThan(0)
    })

    it('should maintain probability after adding liquidity', () => {
      const pool = { YES: 150, NO: 50 }
      const p = 0.5
      const amount = 20

      const initialProb = getCpmmProbability(pool, p)
      const { newPool, newP } = addCpmmLiquidity(pool, p, amount)
      const newProb = getCpmmProbability(newPool, newP)

      expect(newProb).toBeCloseTo(initialProb, 5)
    })

    it('should not change if state if 0 liquidity is added', () => {
      const pool = { YES: 100, NO: 100 }
      const p = 0.5
      const amount = 0

      const { newPool, newP } = addCpmmLiquidity(pool, p, amount)

      expect(newPool.YES).toBeCloseTo(pool.YES, 5)
      expect(newPool.NO).toBeCloseTo(pool.NO, 5)
      expect(newP).toBeCloseTo(p, 5)
    })
  })

  describe('removeCpmmLiquidity', () => {
    const initialPool = { YES: 100, NO: 100 }
    const initialP = 0.5
    const amount = 10

    it('should not change the probability when removing liquidity', () => {
      const initialProb = getCpmmProbability(initialPool, initialP)
      const { newPool, newP } = removeCpmmLiquidity(
        initialPool,
        initialP,
        amount
      )
      const finalProb = getCpmmProbability(newPool, newP)

      expect(finalProb).toBeCloseTo(initialProb, 5)
    })

    it('should result in the same state after adding then removing liquidity', () => {
      const { newPool: poolAfterAdd, newP: pAfterAdd } = addCpmmLiquidity(
        initialPool,
        initialP,
        amount
      )
      const { newPool: finalPool, newP: finalP } = removeCpmmLiquidity(
        poolAfterAdd,
        pAfterAdd,
        amount
      )

      expect(finalPool.YES).toBeCloseTo(initialPool.YES, 5)
      expect(finalPool.NO).toBeCloseTo(initialPool.NO, 5)
      expect(finalP).toBeCloseTo(initialP, 5)
    })

    it('should result in the same state after removing then adding liquidity', () => {
      const { newPool: poolAfterRemove, newP: pAfterRemove } =
        removeCpmmLiquidity(initialPool, initialP, amount)
      const { newPool: finalPool, newP: finalP } = addCpmmLiquidity(
        poolAfterRemove,
        pAfterRemove,
        amount
      )

      expect(finalPool.YES).toBeCloseTo(initialPool.YES, 5)
      expect(finalPool.NO).toBeCloseTo(initialPool.NO, 5)
      expect(finalP).toBeCloseTo(initialP, 5)
    })
  })

  describe('calculateCpmmAmountToBuySharesFixedP (general p, cpmm-multi-2)', () => {
    // The shares -> cost direction is transcendental for p != 0.5; the function
    // inverts the (general-p) forward map calculateCpmmShares by bisection. These
    // tests pin that inverse: cross-language anchors from the Python oracle
    // (manifold/amm_core.cost_for_shares, GP3), a self-validating round-trip against
    // calculateCpmmShares, and a check that the p=0.5 closed form is unchanged.
    it('matches the general-p Python oracle (amm_core.cost_for_shares)', () => {
      const cases = [
        { pool: { YES: 100, NO: 50 }, p: 0.7, shares: 20, outcome: 'YES' as const, cost: 11.5061941179877 },
        { pool: { YES: 100, NO: 50 }, p: 0.7, shares: 20, outcome: 'NO' as const, cost: 10.016299628032943 },
        { pool: { YES: 80, NO: 120 }, p: 0.3, shares: 35, outcome: 'YES' as const, cost: 15.379495592014415 },
        { pool: { YES: 200, NO: 100 }, p: 0.9, shares: 10, outcome: 'NO' as const, cost: 1.8886896107765505 },
      ]
      for (const { pool, p, shares, outcome, cost } of cases) {
        const state: CpmmState = { pool, p, collectedFees: noFees }
        expect(
          calculateCpmmAmountToBuySharesFixedP(state, shares, outcome)
        ).toBeCloseTo(cost, 6)
      }
    })

    it('round-trips against calculateCpmmShares for general p (invert ∘ forward = id)', () => {
      const ps = [0.3, 0.5, 0.7, 0.9]
      const pools = [
        { YES: 100, NO: 100 },
        { YES: 100, NO: 50 },
        { YES: 30, NO: 200 },
      ]
      const amounts = [1, 10, 50, 200]
      for (const p of ps)
        for (const pool of pools)
          for (const outcome of ['YES', 'NO'] as const)
            for (const amount of amounts) {
              const shares = calculateCpmmShares(pool, p, amount, outcome)
              const state: CpmmState = { pool, p, collectedFees: noFees }
              const recovered = calculateCpmmAmountToBuySharesFixedP(
                state,
                shares,
                outcome
              )
              expect(recovered).toBeCloseTo(amount, 4)
            }
    })

    it('leaves the p = 0.5 closed form unchanged', () => {
      const pool = { YES: 120, NO: 80 }
      const shares = 25
      const state: CpmmState = { pool, p: 0.5, collectedFees: noFees }
      const closed =
        (shares - 120 - 80 + Math.sqrt(4 * 80 * shares + (120 + 80 - shares) ** 2)) /
        2
      expect(
        calculateCpmmAmountToBuySharesFixedP(state, shares, 'YES')
      ).toBeCloseTo(closed, 10)
    })
  })
})

// --- cpmm-multi-2: lossless whole-market liquidity add (2b.5) ------------------------------
// A valid v2 sum-to-one market is per-answer (pool, p) with Σ prob_i = 1. Balanced pools
// (Y = N = L) give prob_i = p_i, so any {p_i} that sums to 1 is a valid market. There is NO
// external p != 0.5 oracle (vendor v1 throws), so losslessness is validated by the invariants:
// each answer's probability is preserved exactly, Σ prob stays 1, k strictly increases, and
// nothing is discarded — versus v1's addCpmmLiquidityFixedP, which throws shares away on a
// skewed pool. At p = 0.5 v2 reduces to the v1 fixed-p add (the regression anchor).
describe('cpmm-multi-2 lossless liquidity add (addCpmmMultiLiquidityAnswersSumToOneV2)', () => {
  const market = (ps: number[], L = 100) =>
    Object.fromEntries(ps.map((p, i) => [`a${i}`, { pool: { YES: L, NO: L }, p }]))

  const probsOf = (byId: {
    [id: string]: { pool: { YES: number; NO: number }; p: number }
  }) => mapValues(byId, ({ pool, p }) => getCpmmProbability(pool, p))

  it('preserves every answer probability and Σ prob = 1 (lossless), deepening each pool', () => {
    for (const ps of [
      [0.5, 0.3, 0.2],
      [0.7, 0.2, 0.1],
      [0.9, 0.05, 0.05],
      [0.4, 0.3, 0.2, 0.1],
    ]) {
      const before = market(ps)
      const probsBefore = probsOf(before)
      const after = addCpmmMultiLiquidityAnswersSumToOneV2(before, 50)
      const probsAfter = probsOf(after)
      for (const id of Object.keys(before)) {
        // probability preserved exactly (the invariant), p floated to absorb the mana
        expect(probsAfter[id]).toBeCloseTo(probsBefore[id], 10)
        // pool deepened in BOTH reserves; positive k added; nothing discarded
        expect(after[id].liquidity).toBeGreaterThan(0)
        expect(after[id].pool.YES).toBeGreaterThan(before[id].pool.YES)
        expect(after[id].pool.NO).toBeGreaterThan(before[id].pool.NO)
      }
      expect(sum(Object.values(probsAfter))).toBeCloseTo(1, 10)
    }
  })

  it('at p = 0.5 reduces to the v1 fixed-p add (both reserves +amount, p stays 0.5, no discard)', () => {
    const before = market([0.5, 0.5]) // uniform 2-answer market, Σ prob = 1
    const after = addCpmmMultiLiquidityAnswersSumToOneV2(before, 50) // 25 per answer
    for (const id of Object.keys(before)) {
      const v1 = addCpmmLiquidityFixedP(before[id].pool, 25)
      expect(after[id].p).toBeCloseTo(0.5, 10)
      expect(after[id].pool.YES).toBeCloseTo(v1.newPool.YES, 8)
      expect(after[id].pool.NO).toBeCloseTo(v1.newPool.NO, 8)
      expect(v1.sharesThrownAway.YES).toBeCloseTo(0, 10)
      expect(v1.sharesThrownAway.NO).toBeCloseTo(0, 10)
    }
  })

  it('on a SKEWED pool v1 discards shares to hold prob; v2 keeps both reserves whole', () => {
    const skewed = { YES: 30, NO: 270 } // prob = 0.9
    const v1 = addCpmmLiquidityFixedP(skewed, 50)
    // v1 holds prob by topping up the deep side and DISCARDING the shallow side's excess
    expect(v1.sharesThrownAway.YES).toBeGreaterThan(0)
    // v2 injects the full amount into both reserves and floats p instead — nothing thrown away
    const v2 = addCpmmMultiLiquidityAnswersSumToOneV2(
      { only: { pool: skewed, p: 0.5 } },
      50
    ).only
    expect(v2.pool.YES).toBeCloseTo(skewed.YES + 50, 8)
    expect(v2.pool.NO).toBeCloseTo(skewed.NO + 50, 8)
    expect(getCpmmProbability(v2.pool, v2.p)).toBeCloseTo(
      getCpmmProbability(skewed, 0.5),
      10
    )
  })
})

describe('cpmm-multi-2 lossless liquidity add — INDEPENDENT / "Set" (addCpmmMultiLiquidityToAnswersIndependentlyV2)', () => {
  const market = (ps: number[], L = 100) =>
    Object.fromEntries(ps.map((p, i) => [`a${i}`, { pool: { YES: L, NO: L }, p }]))

  const probsOf = (byId: {
    [id: string]: { pool: { YES: number; NO: number }; p: number }
  }) => mapValues(byId, ({ pool, p }) => getCpmmProbability(pool, p))

  it('REGRESSION: a balanced Set answer with p != 0.5 keeps prob == p (NOT clobbered to 0.5)', () => {
    // The bug: the lossy fixed-p path recomputed prob as getCpmmProbability(newPool, 0.5) on the
    // balanced (Y=N) Set pool, writing 0.5 and overwriting the real probability p. The float-p add
    // must preserve prob == p exactly.
    for (const p of [0.6, 0.75, 0.9, 0.1, 0.5]) {
      const before = { only: { pool: { YES: 100, NO: 100 }, p } }
      const after = addCpmmMultiLiquidityToAnswersIndependentlyV2(before, 40).only
      expect(getCpmmProbability(after.pool, after.p)).toBeCloseTo(p, 10)
      // both reserves deepened, k added, nothing discarded
      expect(after.pool.YES).toBeGreaterThan(100)
      expect(after.pool.NO).toBeGreaterThan(100)
      expect(after.liquidity).toBeGreaterThan(0)
    }
  })

  it('preserves each independent answer probability — and they need NOT sum to 1', () => {
    // Independent answers are each their own binary CPMM: no Σ prob = 1 coupling.
    const before = market([0.8, 0.65, 0.3]) // Σ prob = 1.75, deliberately != 1
    const probsBefore = probsOf(before)
    const after = addCpmmMultiLiquidityToAnswersIndependentlyV2(before, 60)
    const probsAfter = probsOf(after)
    for (const id of Object.keys(before)) {
      expect(probsAfter[id]).toBeCloseTo(probsBefore[id], 10)
      expect(after[id].pool.YES).toBeGreaterThan(before[id].pool.YES)
      expect(after[id].pool.NO).toBeGreaterThan(before[id].pool.NO)
    }
    expect(sum(Object.values(probsAfter))).toBeCloseTo(1.75, 10)
  })

  it('at p = 0.5 on a balanced pool reduces to the v1 fixed-p add (no discard)', () => {
    const before = market([0.5, 0.5])
    const after = addCpmmMultiLiquidityToAnswersIndependentlyV2(before, 50) // 25 per answer
    for (const id of Object.keys(before)) {
      const v1 = addCpmmLiquidityFixedP(before[id].pool, 25)
      expect(after[id].p).toBeCloseTo(0.5, 10)
      expect(after[id].pool.YES).toBeCloseTo(v1.newPool.YES, 8)
      expect(after[id].pool.NO).toBeCloseTo(v1.newPool.NO, 8)
      expect(v1.sharesThrownAway.YES).toBeCloseTo(0, 10)
      expect(v1.sharesThrownAway.NO).toBeCloseTo(0, 10)
    }
  })
})
