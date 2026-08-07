import { applyFunding, computeFundingRate, getPositionValue } from './amm'
import {
  fundingPerPeriod,
  getPerpPositionTotalCost,
  getUserFacingPnl,
  getUserFacingPnlFromPayout,
  getUserFacingPnlPercent,
} from './pnl'
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
      const after = applyFunding({ pool: { L, S }, positions: [position] }, f)
        .positions[0]
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

describe('getUserFacingPnlFromPayout', () => {
  it('includes funding in realized profit and loss', () => {
    expect(getUserFacingPnlFromPayout(115, 100)).toBe(15)
    expect(getUserFacingPnlFromPayout(85, 100)).toBe(-15)
    expect(getUserFacingPnlFromPayout(100, 100)).toBe(0)
  })

  it('includes opening taker fees in unrealized and realized PnL', () => {
    const position = makePosition('long', { takerFeeCostBasis: 0.5 })
    expect(getPerpPositionTotalCost(position)).toBe(100.5)
    expect(getUserFacingPnl(position, 50)).toBe(-0.5)
    // Gross close value is 100; a 0.5 close fee leaves a 99.5 payout.
    expect(getUserFacingPnlFromPayout(99.5, 100, 0.5)).toBe(-1)
    expect(getUserFacingPnlFromPayout(0, 100, 0.5)).toBe(-100.5)
  })

  it('returns zero instead of propagating invalid financial values', () => {
    expect(getUserFacingPnlFromPayout(Number.NaN, 100)).toBe(0)
    expect(getUserFacingPnlFromPayout(100, Number.POSITIVE_INFINITY)).toBe(0)
    expect(getUserFacingPnlFromPayout(-1, 100)).toBe(0)
    expect(getUserFacingPnlFromPayout(100, -1)).toBe(0)
    expect(getUserFacingPnlFromPayout(100, 100, Number.NaN)).toBe(0)
    expect(getUserFacingPnlFromPayout(100, 100, -1)).toBe(0)
  })

  it('fails closed on an invalid live-position cost basis', () => {
    const position = makePosition('long', {
      takerFeeCostBasis: Number.NaN,
    })
    expect(getPerpPositionTotalCost(position)).toBe(0)
    expect(getUserFacingPnl(position, 60)).toBe(0)
    expect(getUserFacingPnlPercent(position, 60)).toBe(0)
  })
})
