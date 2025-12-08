import {
  addCpmmLiquidity,
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
})
