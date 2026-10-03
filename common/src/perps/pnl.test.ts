import {
  applyFunding,
  computeFundingRate,
  getPositionValue,
  openPosition,
} from './amm'
import { accruePerpPositionTakerFee } from './fees'
import {
  fundingPerPeriod,
  getPerpPositionTotalCost,
  getPerpPriceForUserFacingPnl,
  getPerpProfitScenarios,
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
    // A 99.5 payout after a 0.5 opening fee is a total loss of 1.
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

describe('getPerpPriceForUserFacingPnl', () => {
  const position = makePosition('long', {
    size: 10_000,
    costBasis: 100,
    originalCostBasis: 100,
    takerFeeCostBasis: 10,
    entryPrice: 100,
    leverage: 100,
  })

  it('recoups the opening fee before reaching the displayed profit', () => {
    const longPrice = getPerpPriceForUserFacingPnl(position, 25)
    const shortPosition = { ...position, direction: 'short' as const }
    const shortPrice = getPerpPriceForUserFacingPnl(shortPosition, 25)

    expect(longPrice).toBeCloseTo(100.35, 10)
    expect(shortPrice).toBeCloseTo(99.65, 10)
    expect(getUserFacingPnl(position, longPrice!)).toBeCloseTo(25, 10)
    expect(getUserFacingPnl(shortPosition, shortPrice!)).toBeCloseTo(25, 10)
  })

  it('reduces to the original leverage target when fees are zero', () => {
    const noFee = { ...position, takerFeeCostBasis: 0 }
    expect(getPerpPriceForUserFacingPnl(noFee, 25)).toBeCloseTo(100.25, 10)
    expect(
      getPerpPriceForUserFacingPnl(
        { ...noFee, direction: 'short' as const },
        25
      )
    ).toBeCloseTo(99.75, 10)
  })

  it('accounts for funding-adjusted cost basis', () => {
    const funded = makePosition('long', {
      size: 1_000,
      costBasis: 95,
      originalCostBasis: 100,
      takerFeeCostBasis: 1,
      entryPrice: 100,
    })
    const targetPrice = getPerpPriceForUserFacingPnl(funded, 20)
    expect(targetPrice).toBeCloseTo(102.6, 10)
    expect(getUserFacingPnl(funded, targetPrice!)).toBeCloseTo(20, 10)
  })

  it('fails closed on invalid or impossible targets', () => {
    expect(getPerpPriceForUserFacingPnl(position, Number.NaN)).toBeUndefined()
    expect(getPerpPriceForUserFacingPnl(position, -1)).toBeUndefined()
    expect(
      getPerpPriceForUserFacingPnl({ ...position, size: 0 }, 25)
    ).toBeUndefined()
    expect(
      getPerpPriceForUserFacingPnl(
        { ...position, takerFeeCostBasis: Number.NaN },
        25
      )
    ).toBeUndefined()
    expect(
      getPerpPriceForUserFacingPnl(
        { ...position, direction: 'short', size: 10 },
        1_000
      )
    ).toBeUndefined()
  })
})

describe('getPerpProfitScenarios', () => {
  const tiers = [0.25, 0.5, 1] as const
  // A fresh M$100 open at 10× from a mark of 100, paying a M$1 fee.
  const fresh = makePosition('long', {
    size: 1_000,
    costBasis: 100,
    originalCostBasis: 100,
    takerFeeCostBasis: 1,
    entryPrice: 100,
  })

  it('prices every tier net of the fee on both sides, as the card will show', () => {
    for (const direction of ['long', 'short'] as const) {
      const position = { ...fresh, direction }
      const scenarios = getPerpProfitScenarios(position, 100, tiers)
      expect(scenarios.map((s) => s.ret)).toEqual([...tiers])
      for (const { ret, price, pnl } of scenarios) {
        // The base is the whole cash committed: margin + fee.
        expect(pnl).toBeCloseTo(ret * 101, 10)
        expect(getUserFacingPnl(position, price)).toBeCloseTo(pnl, 10)
        expect(getUserFacingPnlPercent(position, price)).toBeCloseTo(ret, 10)
        // A profit scenario is a favourable move from the mark.
        expect(direction === 'long' ? price > 100 : price < 100).toBe(true)
      }
    }
  })

  it('reduces to entry·(1 ± r/ℓ) when there is no fee', () => {
    const noFee = { ...fresh, takerFeeCostBasis: 0 }
    const longPrices = getPerpProfitScenarios(noFee, 100, tiers).map(
      (s) => s.price
    )
    const shortPrices = getPerpProfitScenarios(
      { ...noFee, direction: 'short' as const },
      100,
      tiers
    ).map((s) => s.price)
    expect(longPrices).toHaveLength(3)
    expect(shortPrices).toHaveLength(3)
    tiers.forEach((ret, i) => {
      expect(longPrices[i]).toBeCloseTo(100 * (1 + ret / 10), 10)
      expect(shortPrices[i]).toBeCloseTo(100 * (1 - ret / 10), 10)
    })
  })

  it('prices an add on the merged row the position card will show', () => {
    // Held: M$100 long at 5× from 50 with M$1 of fees, now marked at 60
    // (+M$100 unrealized). Add M$50 at 4× at the mark for a M$0.50 fee,
    // merged exactly as the engine merges it.
    const held = makePosition('long', {
      size: 500,
      costBasis: 100,
      originalCostBasis: 100,
      takerFeeCostBasis: 1,
      entryPrice: 50,
      leverage: 5,
    })
    const opened = openPosition(
      { pool: { L: 100, S: 100 }, positions: [held] },
      'u',
      'c',
      'long',
      50,
      4,
      60,
      held
    )
    const merged = accruePerpPositionTakerFee(
      opened.state,
      opened.position,
      0.5
    ).position
    expect(merged.size).toBe(700)
    expect(merged.originalCostBasis).toBe(150)
    expect(merged.takerFeeCostBasis).toBe(1.5)
    expect(merged.entryPrice).toBeCloseTo(52.5, 10)

    // At the mark the merged row already reads +98.5 on 151.5 committed
    // (+65%), so +25% and +50% would be losses from here: only +100% is a
    // profit scenario, and it is a +100% on the WHOLE row.
    expect(getUserFacingPnlPercent(merged, 60)).toBeCloseTo(98.5 / 151.5, 10)
    const scenarios = getPerpProfitScenarios(merged, 60, tiers)
    expect(scenarios.map((s) => s.ret)).toEqual([1])
    const [{ price, pnl }] = scenarios
    expect(pnl).toBeCloseTo(151.5, 10)
    expect(price).toBeGreaterThan(60)
    expect(price).toBeCloseTo(63.975, 10)
    expect(getUserFacingPnl(merged, price)).toBeCloseTo(151.5, 10)
    expect(getUserFacingPnlPercent(merged, price)).toBeCloseTo(1, 10)

    // Past every tier, there is nothing left to show.
    expect(getPerpProfitScenarios(merged, 80, tiers)).toEqual([])
  })

  it('drops tiers a short has already passed the same way', () => {
    // 10× short from 100 with no fee, marked at 94: +25% (at 97.5) and +50%
    // (at 95) sit ABOVE the mark, i.e. would be losses; +100% (at 90) stands.
    const short = makePosition('short', {
      size: 1_000,
      costBasis: 100,
      originalCostBasis: 100,
      takerFeeCostBasis: 0,
      entryPrice: 100,
    })
    const scenarios = getPerpProfitScenarios(short, 94, tiers)
    expect(scenarios.map((s) => s.ret)).toEqual([1])
    expect(scenarios[0].price).toBeCloseTo(90, 10)
  })

  it('fails closed on inputs it cannot price', () => {
    expect(getPerpProfitScenarios(fresh, Number.NaN, tiers)).toEqual([])
    expect(getPerpProfitScenarios(fresh, 0, tiers)).toEqual([])
    expect(getPerpProfitScenarios({ ...fresh, size: 0 }, 100, tiers)).toEqual(
      []
    )
    expect(
      getPerpProfitScenarios(
        { ...fresh, takerFeeCostBasis: Number.NaN },
        100,
        tiers
      )
    ).toEqual([])
    expect(getPerpProfitScenarios(fresh, 100, [0, -1, Number.NaN])).toEqual([])
    // A 1× short's +100% would need a price of 0.
    expect(
      getPerpProfitScenarios(
        { ...fresh, direction: 'short', size: 100, takerFeeCostBasis: 0 },
        100,
        [1]
      )
    ).toEqual([])
  })
})
