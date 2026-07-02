import {
  applyADL,
  applyFunding,
  closePosition,
  computeFundingRate,
  getUnrealizedEquity,
  imbalance,
  isLiquidated,
  liquidationPrice,
  openPosition,
  PerpState,
  processLiquidations,
  solvencyFactor,
} from './amm'
import { PerpDirection, PerpPosition } from './position'

const makePosition = (
  overrides: Partial<PerpPosition> & {
    direction: PerpDirection
    size: number
    costBasis: number
    entryPrice: number
  }
): PerpPosition => {
  const leverage =
    overrides.costBasis > 0 ? overrides.size / overrides.costBasis : 0
  return {
    userId: 'u1',
    contractId: 'c1',
    originalCostBasis: overrides.costBasis,
    leverage,
    liquidationPrice: liquidationPrice(
      overrides.direction,
      overrides.entryPrice,
      leverage
    ),
    openedTime: 0,
    updatedTime: 0,
    ...overrides,
  }
}

describe('liquidationPrice', () => {
  it('computes paper eq. 1 for both directions', () => {
    expect(liquidationPrice('long', 100, 4)).toBe(75)
    expect(liquidationPrice('short', 100, 4)).toBe(125)
    expect(liquidationPrice('long', 100, 1)).toBe(0)
  })

  it('degenerate leverage never liquidates', () => {
    expect(liquidationPrice('long', 100, 0)).toBe(0)
    expect(liquidationPrice('short', 100, 0)).toBe(Infinity)
  })
})

describe('getUnrealizedEquity', () => {
  it('is signed by direction (paper eq. 13)', () => {
    const long = makePosition({
      direction: 'long',
      size: 1000,
      costBasis: 100,
      entryPrice: 50,
    })
    expect(getUnrealizedEquity(long, 100)).toBe(1000)
    expect(getUnrealizedEquity(long, 25)).toBe(-500)

    const short = makePosition({
      direction: 'short',
      size: 1000,
      costBasis: 100,
      entryPrice: 50,
    })
    expect(getUnrealizedEquity(short, 100)).toBe(-1000)
    expect(getUnrealizedEquity(short, 25)).toBe(500)
  })
})

describe('funding', () => {
  it('imbalance is 0 at or below balance and rises with r', () => {
    expect(imbalance(1, 1)).toBe(0)
    expect(imbalance(0.5, 1)).toBe(0)
    expect(imbalance(2, 1)).toBe(0.5)
    expect(imbalance(2, 0)).toBe(0)
  })

  it('computeFundingRate sign follows the dominant side', () => {
    expect(computeFundingRate(1000, 500, 1, 0.01)).toBeCloseTo(0.005, 10)
    expect(computeFundingRate(500, 1000, 1, 0.01)).toBeCloseTo(-0.005, 10)
    expect(computeFundingRate(700, 700, 1, 0.01)).toBe(0)
    expect(computeFundingRate(0, 500, 1, 0.01)).toBe(0)
  })

  it('applyFunding conserves total pool and scales both sides', () => {
    const long = makePosition({
      direction: 'long',
      size: 200,
      costBasis: 100,
      entryPrice: 100,
    })
    const short = makePosition({
      userId: 'u2',
      direction: 'short',
      size: 100,
      costBasis: 50,
      entryPrice: 100,
    })
    const state: PerpState = {
      pool: { L: 1000, S: 500 },
      positions: [long, short],
    }
    // rate for L=1000, S=500, k=1, fMax=0.01 → +0.005 (longs pay)
    const next = applyFunding(state, 0.005)

    expect(next.pool.L).toBeCloseTo(995, 10)
    expect(next.pool.S).toBeCloseTo(505, 10)
    expect(next.pool.L + next.pool.S).toBeCloseTo(1500, 10)

    const nextLong = next.positions.find((p) => p.direction === 'long')!
    const nextShort = next.positions.find((p) => p.direction === 'short')!
    // Dominant side haircut by f = 0.005.
    expect(nextLong.size).toBeCloseTo(199, 10)
    expect(nextLong.costBasis).toBeCloseTo(99.5, 10)
    // Minority side scaled up by g = (f·L)/S = 5/500 = 0.01.
    expect(nextShort.size).toBeCloseTo(101, 10)
    expect(nextShort.costBasis).toBeCloseTo(50.5, 10)
    // Leverage is size/costBasis and is preserved by uniform scaling.
    expect(nextLong.leverage).toBeCloseTo(long.leverage, 10)
    expect(nextShort.leverage).toBeCloseTo(short.leverage, 10)
  })

  it('zero rate or one-sided pool is a no-op', () => {
    const state: PerpState = { pool: { L: 1000, S: 0 }, positions: [] }
    expect(applyFunding(state, 0.005)).toBe(state)
    const balanced: PerpState = { pool: { L: 10, S: 10 }, positions: [] }
    expect(applyFunding(balanced, 0)).toBe(balanced)
  })
})

describe('liquidation', () => {
  const long = makePosition({
    direction: 'long',
    size: 400,
    costBasis: 100,
    entryPrice: 100,
  }) // leverage 4, liq at 75

  it('triggers at exactly the liquidation price, not just above', () => {
    expect(isLiquidated(long, 75)).toBe(true)
    expect(isLiquidated(long, 75.01)).toBe(false)

    const short = makePosition({
      direction: 'short',
      size: 400,
      costBasis: 100,
      entryPrice: 100,
    }) // liq at 125
    expect(isLiquidated(short, 125)).toBe(true)
    expect(isLiquidated(short, 124.99)).toBe(false)
  })

  it('zeroes the position but leaves margin in the pool (eq. 10)', () => {
    const state: PerpState = { pool: { L: 100, S: 50 }, positions: [long] }
    const { state: next, liquidated } = processLiquidations(state, 70)

    expect(liquidated).toHaveLength(1)
    expect(liquidated[0].userId).toBe('u1')
    expect(next.positions[0].size).toBe(0)
    expect(next.positions[0].costBasis).toBe(0)
    // Forfeited margin stays in L for the shorts to win.
    expect(next.pool).toEqual({ L: 100, S: 50 })
  })
})

describe('ADL', () => {
  it('scales only profitable positions on the underfunded side', () => {
    const winner = makePosition({
      direction: 'long',
      size: 1000,
      costBasis: 100,
      entryPrice: 50,
    }) // π at price 100 = 1000
    const loserLong = makePosition({
      userId: 'u2',
      direction: 'long',
      size: 100,
      costBasis: 100,
      entryPrice: 200,
    }) // π at price 100 < 0 → must be untouched
    const short = makePosition({
      userId: 'u3',
      direction: 'short',
      size: 400,
      costBasis: 100,
      entryPrice: 100,
    }) // π at price 100 = 0 → value = costBasis = 100

    const state: PerpState = {
      pool: { L: 200, S: 600 },
      positions: [winner, loserLong, short],
    }
    // EL = 1000, CS = min(100, 100) = 100, sL = (600 - 100) / 1000 = 0.5
    const { state: next, adlFactorLong, adlFactorShort } = applyADL(state, 100)

    expect(adlFactorLong).toBeCloseTo(0.5, 10)
    expect(adlFactorShort).toBe(1)

    const nextWinner = next.positions.find((p) => p.userId === 'u1')!
    expect(nextWinner.size).toBeCloseTo(500, 10)
    // Cost basis is NOT scaled by ADL — only exposure shrinks.
    expect(nextWinner.costBasis).toBe(100)
    expect(nextWinner.leverage).toBeCloseTo(5, 10)

    expect(next.positions.find((p) => p.userId === 'u2')).toEqual(loserLong)
    expect(next.positions.find((p) => p.userId === 'u3')).toEqual(short)
    // Pools are untouched by ADL itself.
    expect(next.pool).toEqual({ L: 200, S: 600 })
  })

  it('is a no-op when the opposing pool covers all profit', () => {
    const winner = makePosition({
      direction: 'long',
      size: 100,
      costBasis: 100,
      entryPrice: 50,
    }) // π at 100 = 100
    const state: PerpState = {
      pool: { L: 100, S: 500 },
      positions: [winner],
    }
    const { state: next, adlFactorLong } = applyADL(state, 100)
    expect(adlFactorLong).toBe(1)
    expect(next.positions[0]).toEqual(winner)
  })
})

describe('open / close accounting', () => {
  it('open adds margin to the correct pool and prices at the oracle', () => {
    const state: PerpState = { pool: { L: 10, S: 10 }, positions: [] }
    const { state: next, position } = openPosition(
      state,
      'u1',
      'c1',
      'long',
      100,
      4,
      50,
      undefined,
      123
    )
    expect(next.pool).toEqual({ L: 110, S: 10 })
    expect(position.size).toBe(400)
    expect(position.costBasis).toBe(100)
    expect(position.entryPrice).toBe(50)
    expect(position.liquidationPrice).toBe(37.5)
  })

  it('add computes a size-weighted entry price', () => {
    const existing = makePosition({
      direction: 'long',
      size: 100,
      costBasis: 100,
      entryPrice: 100,
    })
    const state: PerpState = { pool: { L: 100, S: 10 }, positions: [existing] }
    const { position } = openPosition(
      state,
      'u1',
      'c1',
      'long',
      100,
      3,
      200,
      existing,
      123
    )
    expect(position.size).toBe(400)
    // (100·100 + 200·300) / 400 = 175
    expect(position.entryPrice).toBeCloseTo(175, 10)
    expect(position.costBasis).toBe(200)
    expect(position.leverage).toBeCloseTo(2, 10)
    expect(position.originalCostBasis).toBe(200)
  })

  it('close at a profit draws π from the opposing pool (eq. 14)', () => {
    const winner = makePosition({
      direction: 'long',
      size: 1000,
      costBasis: 100,
      entryPrice: 50,
    })
    const state: PerpState = { pool: { L: 100, S: 1200 }, positions: [winner] }
    const { state: next, payout, pnl } = closePosition(state, winner, 100)

    expect(pnl).toBe(1000)
    expect(payout).toBe(1100) // costBasis + π
    expect(next.pool.L).toBeCloseTo(0, 10) // own margin returned
    expect(next.pool.S).toBeCloseTo(200, 10) // opposing pool pays π
    expect(next.positions).toHaveLength(0)
  })

  it('close at a loss pays out of own margin only', () => {
    const loser = makePosition({
      direction: 'long',
      size: 400,
      costBasis: 100,
      entryPrice: 100,
    })
    const state: PerpState = { pool: { L: 100, S: 50 }, positions: [loser] }
    const { state: next, payout, pnl } = closePosition(state, loser, 90)

    expect(pnl).toBeCloseTo(-40, 10)
    expect(payout).toBeCloseTo(60, 10)
    expect(next.pool.L).toBeCloseTo(40, 10) // loss stays in own pool
    expect(next.pool.S).toBe(50)
  })

  it('close beyond the wipeout point pays zero, never negative', () => {
    const loser = makePosition({
      direction: 'long',
      size: 400,
      costBasis: 100,
      entryPrice: 100,
    })
    const state: PerpState = { pool: { L: 100, S: 50 }, positions: [loser] }
    const { payout, state: next } = closePosition(state, loser, 60) // π = -160

    expect(payout).toBe(0)
    expect(next.pool.L).toBeCloseTo(100, 10)
  })

  it('open + immediate close round-trips the margin exactly', () => {
    const state: PerpState = { pool: { L: 10, S: 10 }, positions: [] }
    const opened = openPosition(state, 'u1', 'c1', 'short', 100, 5, 80)
    const closed = closePosition(opened.state, opened.position, 80)
    expect(closed.pnl).toBe(0)
    expect(closed.payout).toBe(100)
    expect(closed.state.pool).toEqual({ L: 10, S: 10 })
  })
})

describe('solvencyFactor', () => {
  it('is Infinity when the side has no unrealized profit', () => {
    const state: PerpState = { pool: { L: 100, S: 100 }, positions: [] }
    expect(solvencyFactor('long', state, 100)).toBe(Infinity)
  })

  it('matches the ADL scale when profit exceeds available cover', () => {
    const winner = makePosition({
      direction: 'long',
      size: 1000,
      costBasis: 100,
      entryPrice: 50,
    })
    const short = makePosition({
      userId: 'u2',
      direction: 'short',
      size: 400,
      costBasis: 100,
      entryPrice: 100,
    })
    const state: PerpState = {
      pool: { L: 200, S: 600 },
      positions: [winner, short],
    }
    // (S - C) / E = (600 - 100) / 1000
    expect(solvencyFactor('long', state, 100)).toBeCloseTo(0.5, 10)
    expect(solvencyFactor('short', state, 100)).toBe(Infinity)
  })
})
