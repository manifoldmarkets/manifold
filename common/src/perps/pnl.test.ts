import { applyFunding, computeFundingRate, getPositionValue } from './amm'
import { fundingPerPeriod } from './pnl'
import { PerpPosition } from './position'

const makePosition = (
  direction: 'long' | 'short',
  overrides: Partial<PerpPosition> = {}
): PerpPosition => ({
  userId: 'u',
  contractId: 'c',
  direction,
  size: 1000,
  costBasis: 100,
  originalCostBasis: 100,
  entryPrice: 50,
  leverage: 10,
  liquidationPrice: direction === 'long' ? 45 : 55,
  openedTime: 0,
  updatedTime: 0,
  ...overrides,
})

describe('fundingPerPeriod', () => {
  const [L, S, k, fMax] = [200, 100, 1, 0.001]
  const f = computeFundingRate(L, S, k, fMax) // L > S → positive, longs pay

  it('matches the applyFunding value delta exactly, payer and receiver', () => {
    // Long in profit at 55, short in profit at 45 — both sides exercised
    // with unrealized PnL in the mix.
    for (const [direction, price] of [
      ['long', 55],
      ['short', 45],
    ] as const) {
      const position = makePosition(direction)
      const before = getPositionValue(position, price)
      const after = applyFunding(
        { pool: { L, S }, positions: [position] },
        f
      ).positions[0]
      expect(fundingPerPeriod(position, price, f, L, S)).toBeCloseTo(
        getPositionValue(after, price) - before,
        10
      )
    }
  })

  it('a payer in profit pays on value, not just margin', () => {
    // Long at 55: value = 100 margin + 100 unrealized = 200.
    const paid = fundingPerPeriod(makePosition('long'), 55, f, L, S)
    expect(paid).toBeCloseTo(-f * 200)
  })

  it('a receiver earns the transfer re-based on its own pool', () => {
    // Shorts receive f·L/S = 2f per mana of value; short at 45 has value 200.
    const earned = fundingPerPeriod(makePosition('short'), 45, f, L, S)
    expect(earned).toBeCloseTo(((f * L) / S) * 200)
  })

  it('returns 0 for zero rate, empty pools, or worthless positions', () => {
    const position = makePosition('long')
    expect(fundingPerPeriod(position, 55, 0, L, S)).toBe(0)
    expect(fundingPerPeriod(position, 55, f, 0, S)).toBe(0)
    expect(fundingPerPeriod(position, 55, f, L, 0)).toBe(0)
    // Deep underwater: value floors at 0 before and after funding.
    expect(fundingPerPeriod(position, 40, f, L, S)).toBe(0)
  })
})
