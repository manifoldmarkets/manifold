import {
  applyADL,
  applyFunding,
  applyFundingWithSolvency,
  assertPerpFundingConfig,
  assertPerpPositionNumbers,
  assertPerpStateNumbers,
  assertPerpStateSolvent,
  closePosition,
  computeFundingRate,
  getPerpBackingPool,
  getPerpOpenInterest,
  getPerpOpenInterestCapacity,
  getPositionValue,
  getUnrealizedEquity,
  imbalance,
  isLiquidated,
  liquidationPrice,
  mergedEntryPrice,
  MIN_PERP_LEVERAGE,
  openPosition,
  PERP_MIN_CLOSE_FRACTION,
  PERP_MIN_REMAINDER_COST_BASIS,
  PERP_OPEN_INTEREST_COVER_MULTIPLE,
  PerpState,
  processLiquidations,
  resolvePerpCloseFraction,
  solvencyFactor,
  unmergeEntryPrice,
} from './amm'
import { PerpDirection, PerpPosition } from './position'

describe('getPerpBackingPool', () => {
  it('adds the current long and short backing pools', () => {
    expect(getPerpBackingPool(125, 75)).toBe(200)
  })

  it('does not surface corrupt pool values as market backing', () => {
    expect(getPerpBackingPool(NaN, 75)).toBe(0)
    expect(getPerpBackingPool(125, Infinity)).toBe(0)
    expect(getPerpBackingPool(-1, 75)).toBe(0)
  })
})

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

  it('overflows to ±Infinity for subnormal leverage — the reason trade requests enforce MIN_PERP_LEVERAGE', () => {
    // 1/ℓ ≈ 6.25e303, × entry 64850 exceeds Number.MAX_VALUE. A request that
    // reached openPosition with this leverage produced a non-finite candidate
    // position and a 500 from assertPerpStateNumbers (prod, 2026-08-07).
    expect(liquidationPrice('short', 64850, 1.6e-304)).toBe(Infinity)
    expect(liquidationPrice('long', 64850, 1.6e-304)).toBe(-Infinity)
    expect(
      Number.isFinite(liquidationPrice('short', 64850, MIN_PERP_LEVERAGE))
    ).toBe(true)
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

describe('getPerpOpenInterest', () => {
  // Leverage varies by side on purpose: open interest must track notional,
  // and these margins would give the opposite ranking.
  const pos = (
    direction: PerpDirection,
    size: number,
    costBasis: number,
    userId: string
  ) => makePosition({ direction, size, costBasis, entryPrice: 100, userId })

  it('sums open notional per side', () => {
    expect(
      getPerpOpenInterest([
        pos('long', 1000, 50, 'u1'),
        pos('long', 500, 25, 'u2'),
        pos('short', 200, 200, 'u3'),
      ])
    ).toEqual({ long: 1500, short: 200 })
  })

  it('ignores closed positions and reports an empty book as zero', () => {
    // processLiquidations zeroes size but keeps the row until the engine
    // deletes it; a liquidated position carries no exposure.
    expect(
      getPerpOpenInterest([
        pos('long', 0, 0, 'u1'),
        pos('short', 300, 100, 'u2'),
      ])
    ).toEqual({ long: 0, short: 300 })
    expect(getPerpOpenInterest([])).toEqual({ long: 0, short: 0 })
  })

  it('does not let a corrupt size poison the funding input', () => {
    expect(
      getPerpOpenInterest([
        pos('long', NaN, 10, 'u1'),
        pos('long', 400, 10, 'u2'),
        pos('short', Infinity, 10, 'u3'),
      ])
    ).toEqual({ long: 400, short: 0 })
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

  it('charges the side that is crowded by NOTIONAL, not by margin', () => {
    // Live BTC market, 2026-08-08: longs held more exposure on less margin
    // (18.4x vs 9.9x), so the pools read short-heavy while the book was
    // long-heavy. Funding keyed on pools paid the crowded side.
    const [oiLong, oiShort] = [453771, 348184]
    const [poolLong, poolShort] = [59555, 82975]
    const [k, fMax] = [1, 0.000228]

    const fromOpenInterest = computeFundingRate(oiLong, oiShort, k, fMax)
    const fromPools = computeFundingRate(poolLong, poolShort, k, fMax)

    expect(fromOpenInterest).toBeGreaterThan(0) // longs crowded → longs pay
    expect(fromPools).toBeLessThan(0) // what shipped: shorts paid longs
  })

  it('does not fund a side that nobody is on', () => {
    // Funding is a transfer between the two sides' positions. With one side
    // empty there is no counterparty to receive it, so no rate is applied —
    // rather than haircutting the lone side into the pool.
    expect(computeFundingRate(1000, 0, 1, 0.01)).toBe(0)
    expect(computeFundingRate(0, 0, 1, 0.01)).toBe(0)
  })

  it('stays finite and below the cap for extreme finite pool ratios', () => {
    const cap = 1 - Number.EPSILON
    const longDominant = computeFundingRate(
      Number.MAX_VALUE,
      Number.MIN_VALUE,
      1,
      cap
    )
    const shortDominant = computeFundingRate(
      Number.MIN_VALUE,
      Number.MAX_VALUE,
      1,
      cap
    )

    expect(Number.isFinite(longDominant)).toBe(true)
    expect(Number.isFinite(shortDominant)).toBe(true)
    expect(longDominant).toBe(cap)
    expect(shortDominant).toBe(-cap)
    expect(Math.abs(longDominant)).toBeLessThan(1)
    expect(Math.abs(shortDominant)).toBeLessThan(1)
  })

  it('fails closed on invalid persisted funding configuration', () => {
    expect(() =>
      assertPerpFundingConfig({
        fundingSensitivity: 1,
        maxFundingRate: 1 - Number.EPSILON,
      })
    ).not.toThrow()

    for (const maxFundingRate of [0, 1, Number.POSITIVE_INFINITY, Number.NaN]) {
      expect(() =>
        assertPerpFundingConfig({
          fundingSensitivity: 1,
          maxFundingRate,
        })
      ).toThrow('max funding rate must be finite and in (0, 1)')
    }

    for (const fundingSensitivity of [
      0,
      -1,
      Number.POSITIVE_INFINITY,
      Number.NaN,
    ]) {
      expect(() =>
        assertPerpFundingConfig({
          fundingSensitivity,
          maxFundingRate: 0.01,
        })
      ).toThrow('funding sensitivity must be finite and positive')
    }
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

  it('ADLs the profitable receiver after funding to preserve solvency', () => {
    const short = makePosition({
      direction: 'short',
      size: 2000,
      costBasis: 100,
      entryPrice: 200,
    })
    const state: PerpState = {
      pool: { L: 1000, S: 500 },
      positions: [short],
    }

    // Before funding the short has 1000 profit backed by exactly 1000 L.
    expect(solvencyFactor('short', state, 100)).toBeCloseTo(1, 12)

    // Funding alone moves 5 mana out of L and scales the short's profit up to
    // 1010, so an immediate close would overdraw L by 15 mana.
    const fundedOnly = applyFunding(state, 0.005)
    expect(solvencyFactor('short', fundedOnly, 100)).toBeLessThan(1)
    expect(
      closePosition(fundedOnly, fundedOnly.positions[0], 100).state.pool.L
    ).toBeLessThan(0)

    const corrected = applyFundingWithSolvency(state, 0.005, 100)
    expect(corrected.adlFactorLong).toBe(1)
    expect(corrected.adlFactorShort).toBeCloseTo(995 / 1010, 12)
    expect(corrected.state.pool).toEqual({ L: 995, S: 505 })
    expect(solvencyFactor('short', corrected.state, 100)).toBeCloseTo(1, 12)
    expect(() => assertPerpStateSolvent(corrected.state, 100)).not.toThrow()

    // ADL preserves the funding-adjusted margin and only trims exposure.
    const correctedShort = corrected.state.positions[0]
    expect(correctedShort.costBasis).toBeCloseTo(101, 12)
    expect(correctedShort.size).toBeCloseTo(1990, 12)

    const closed = closePosition(corrected.state, correctedShort, 100)
    expect(closed.state.pool.L).toBeCloseTo(0, 10)
    expect(closed.state.pool.S).toBeCloseTo(404, 10)
    expect(
      closed.payout + closed.state.pool.L + closed.state.pool.S
    ).toBeCloseTo(1500, 10)
  })

  it('settles retained margin when an oracle move requires factor-zero ADL', () => {
    const profitableLong = makePosition({
      direction: 'long',
      size: 1000,
      costBasis: 1000,
      entryPrice: 50,
    })
    const newlyProfitableShort = makePosition({
      userId: 'u2',
      direction: 'short',
      size: 100,
      costBasis: 100,
      entryPrice: 100,
    })
    const state: PerpState = {
      pool: { L: 1000, S: 1100 },
      positions: [profitableLong, newlyProfitableShort],
    }

    // At 100 the state is exactly solvent. At 99 the long is still
    // profitable, so all of L remains reserved for its margin while the
    // short gains a positive profit claim: its ADL factor is exactly zero.
    expect(() => assertPerpStateSolvent(state, 100)).not.toThrow()
    const liquidated = processLiquidations(state, 99)
    expect(liquidated.liquidated).toEqual([])
    const corrected = applyADL(liquidated.state, 99)

    expect(corrected.adlFactorShort).toBe(0)
    expect(corrected.settled).toEqual([
      { position: newlyProfitableShort, payout: 100 },
    ])
    expect(corrected.state.positions).toEqual([profitableLong])
    expect(corrected.state.pool).toEqual({ L: 1000, S: 1000 })
    expect(() => assertPerpStateSolvent(corrected.state, 99)).not.toThrow()
    expect(
      corrected.state.pool.L +
        corrected.state.pool.S +
        corrected.settled[0].payout
    ).toBe(state.pool.L + state.pool.S)
  })

  it('does not silently repair insolvency during a funding event', () => {
    const flatLong = makePosition({
      direction: 'long',
      size: 999.999999,
      costBasis: 999.999999,
      entryPrice: 100,
    })
    const winningShort = makePosition({
      userId: 'u2',
      direction: 'short',
      size: 100,
      costBasis: 100,
      entryPrice: 200,
    })
    const state: PerpState = {
      pool: { L: 1000, S: 500 },
      positions: [flatLong, winningShort],
    }

    expect(() => applyFundingWithSolvency(state, 0, 100)).toThrow(
      'short solvency factor'
    )
  })

  it('fails closed on non-finite or negative funding state', () => {
    const valid: PerpState = { pool: { L: 100, S: 100 }, positions: [] }
    expect(() =>
      applyFundingWithSolvency(
        { ...valid, pool: { L: Number.NaN, S: 100 } },
        0.001,
        100
      )
    ).toThrow('long pool must be finite')
    expect(() =>
      applyFundingWithSolvency(valid, Number.POSITIVE_INFINITY, 100)
    ).toThrow('funding rate must be finite')
    expect(() =>
      applyFundingWithSolvency(
        { ...valid, pool: { L: -1, S: 100 } },
        0.001,
        100
      )
    ).toThrow('pools must be non-negative')
  })

  it('preserves pool value and close solvency across randomized states', () => {
    let seed = 0x5eed1234
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 2 ** 32
    }

    for (let i = 0; i < 500; i++) {
      const price = 100
      const dominantLong = random() < 0.5
      const dominantPool = 500 + random() * 9500
      const minorityPool = dominantPool * (0.2 + random() * 0.7)
      const flatCost = dominantPool * (0.05 + random() * 0.45)
      const availableCover = dominantPool - flatCost
      const preFundingFactor = 1.000001 + random() * 0.02
      const winnerProfit = availableCover / preFundingFactor
      const winnerCost = minorityPool * (0.05 + random() * 0.4)

      const flat = makePosition({
        userId: `flat-${i}`,
        direction: dominantLong ? 'long' : 'short',
        size: flatCost,
        costBasis: flatCost,
        entryPrice: price,
      })
      const winner = makePosition({
        userId: `winner-${i}`,
        direction: dominantLong ? 'short' : 'long',
        size: dominantLong ? 2 * winnerProfit : winnerProfit,
        costBasis: winnerCost,
        entryPrice: dominantLong ? 200 : 50,
      })
      const state: PerpState = {
        pool: dominantLong
          ? { L: dominantPool, S: minorityPool }
          : { L: minorityPool, S: dominantPool },
        positions: [flat, winner],
      }
      assertPerpStateSolvent(state, price)

      // Funding keys off open interest, which is independent of the pool
      // ratio: the side with more notional can be the side with the SMALLER
      // pool. Drive the sign independently so the fuzz covers the direction
      // that pool-derived rates could never produce (paying side = smaller
      // pool), not just the one that shipped.
      const magnitude = computeFundingRate(
        state.pool.L,
        state.pool.S,
        0.5 + random() * 2,
        0.001 + random() * 0.049
      )
      const longsPay = random() < 0.5
      const fundingRate = longsPay ? Math.abs(magnitude) : -Math.abs(magnitude)
      const corrected = applyFundingWithSolvency(state, fundingRate, price)

      expect(() => assertPerpStateSolvent(corrected.state, price)).not.toThrow()
      expect(corrected.settled).toEqual([])
      expect(Number.isFinite(corrected.state.pool.L)).toBe(true)
      expect(Number.isFinite(corrected.state.pool.S)).toBe(true)
      expect(corrected.state.pool.L).toBeGreaterThanOrEqual(0)
      expect(corrected.state.pool.S).toBeGreaterThanOrEqual(0)
      expect(corrected.state.pool.L + corrected.state.pool.S).toBeCloseTo(
        state.pool.L + state.pool.S,
        8
      )

      // Aggregate solvency must hold independently of close ordering.
      for (const positions of [
        corrected.state.positions,
        [...corrected.state.positions].reverse(),
      ]) {
        let closingState = corrected.state
        let totalPayout = 0
        for (const position of positions) {
          const closed = closePosition(closingState, position, price)
          closingState = closed.state
          totalPayout += closed.payout
          expect(closingState.pool.L).toBeGreaterThanOrEqual(0)
          expect(closingState.pool.S).toBeGreaterThanOrEqual(0)
        }
        expect(
          totalPayout + closingState.pool.L + closingState.pool.S
        ).toBeCloseTo(state.pool.L + state.pool.S, 8)
      }
    }
  })

  it('clamps only floating-point close dust and keeps later funding live', () => {
    const price = 45.626853816211224
    const winners = [
      makePosition({
        userId: 'u0',
        direction: 'short',
        size: 4759.190316135551,
        costBasis: 564.7710346667371,
        originalCostBasis: 560.9697526622564,
        entryPrice: 100,
      }),
      makePosition({
        userId: 'u2',
        direction: 'short',
        size: 3551.855731290487,
        costBasis: 624.5039193480568,
        originalCostBasis: 620.3005955856294,
        entryPrice: 100,
      }),
      makePosition({
        userId: 'u4',
        direction: 'short',
        size: 126.30030505174204,
        costBasis: 46.369980919038426,
        originalCostBasis: 46.05788032747805,
        entryPrice: 100,
      }),
    ]
    const losingShort = makePosition({
      userId: 'loser',
      direction: 'short',
      size: 20,
      costBasis: 10,
      entryPrice: 40,
    })
    let state: PerpState = {
      pool: { L: 4587.650666265313, S: 2038.7567534218244 },
      positions: [...winners, losingShort],
    }
    expect(() => assertPerpStateSolvent(state, price)).not.toThrow()

    for (const winner of winners) {
      state = closePosition(state, winner, price).state
    }

    // Straight IEEE-754 subtraction leaves L=-1.19e-12 here. Persisting that
    // value would make the next strict funding validation fail even though
    // the market paid exactly its aggregate obligation.
    expect(state.pool.L).toBe(0)
    expect(state.positions).toEqual([losingShort])
    expect(() => applyFundingWithSolvency(state, 0, price)).not.toThrow()
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

  it('add computes a units-weighted entry price that conserves equity', () => {
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
    // Units add: 100/100 + 300/200 = 2.5, so Pe = 400/2.5 = 160.
    // NOT the arithmetic mean 175 — that would delete M$42.86 of the
    // trader's already-earned profit at the instant of the add.
    expect(position.entryPrice).toBeCloseTo(160, 10)
    expect(position.costBasis).toBe(200)
    expect(position.leverage).toBeCloseTo(2, 10)
    expect(position.originalCostBasis).toBe(200)

    // The added tranche is opened at the current price, so it carries zero
    // P&L: merged equity must equal the original tranche's equity.
    expect(getUnrealizedEquity(position, 200)).toBeCloseTo(
      getUnrealizedEquity(existing, 200),
      10
    )
  })

  describe('adds conserve value', () => {
    // The property that the arithmetic-mean merge violated: collapsing two
    // tranches into one row must not change what the trader can withdraw.
    const cases: {
      direction: PerpDirection
      entry: number
      addPrice: number
      markPrice: number
    }[] = [
      { direction: 'short', entry: 100, addPrice: 50, markPrice: 50 },
      { direction: 'short', entry: 100, addPrice: 50, markPrice: 30 },
      { direction: 'short', entry: 100, addPrice: 150, markPrice: 120 },
      { direction: 'long', entry: 100, addPrice: 200, markPrice: 200 },
      { direction: 'long', entry: 100, addPrice: 200, markPrice: 350 },
      { direction: 'long', entry: 100, addPrice: 40, markPrice: 60 },
      { direction: 'long', entry: 1, addPrice: 1000, markPrice: 500 },
    ]

    it.each(cases)(
      'merged equity equals separate tranches ($direction, $entry -> $addPrice, mark $markPrice)',
      ({ direction, entry, addPrice, markPrice }) => {
        const existing = makePosition({
          direction,
          size: 1000,
          costBasis: 100,
          entryPrice: entry,
        })
        const state: PerpState = {
          pool: { L: 100_000, S: 100_000 },
          positions: [existing],
        }
        const { position } = openPosition(
          state,
          'u1',
          'c1',
          direction,
          100,
          10,
          addPrice,
          existing,
          123
        )

        // What the two tranches would be worth if kept separate, per the
        // paper's model.
        const separate = makePosition({
          direction,
          size: 1000,
          costBasis: 100,
          entryPrice: addPrice,
        })
        const separateEquity =
          getUnrealizedEquity(existing, markPrice) +
          getUnrealizedEquity(separate, markPrice)

        expect(getUnrealizedEquity(position, markPrice)).toBeCloseTo(
          separateEquity,
          8
        )
      }
    )

    it('laddering into a falling market cannot mint equity', () => {
      // The extraction loop: short, then top up at each lower price. Under
      // the arithmetic merge this produced steadily more equity than the
      // tranches were worth.
      let position = makePosition({
        direction: 'short',
        size: 1000,
        costBasis: 100,
        entryPrice: 100,
      })
      const tranches = [position]
      for (const price of [90, 80, 70, 60, 50]) {
        const state: PerpState = {
          pool: { L: 500_000, S: 500_000 },
          positions: [position],
        }
        position = openPosition(
          state,
          'u1',
          'c1',
          'short',
          100,
          10,
          price,
          position,
          123
        ).position
        tranches.push(
          makePosition({
            direction: 'short',
            size: 1000,
            costBasis: 100,
            entryPrice: price,
          })
        )
      }

      const mark = 50
      const separateEquity = tranches.reduce(
        (sum, t) => sum + getUnrealizedEquity(t, mark),
        0
      )
      expect(getUnrealizedEquity(position, mark)).toBeCloseTo(separateEquity, 8)
      // Deposited M$600 across six tranches; withdrawable must be the honest
      // figure, not the M$2600 the arithmetic merge produced.
      expect(
        position.costBasis + getUnrealizedEquity(position, mark)
      ).toBeCloseTo(600 + separateEquity, 8)
    })

    it('merged entry price always lies between the two entry prices', () => {
      for (const [q1, p1, q2, p2] of [
        [1000, 100, 1000, 50],
        [1, 1e-6, 1e6, 1e6],
        [123.456, 7.89, 0.001, 1000],
      ]) {
        const merged = mergedEntryPrice(q1, p1, q2, p2)
        expect(merged).toBeGreaterThanOrEqual(Math.min(p1, p2) - 1e-9)
        expect(merged).toBeLessThanOrEqual(Math.max(p1, p2) + 1e-9)
      }
    })

    it('unmergeEntryPrice inverts mergedEntryPrice', () => {
      for (const [q1, p1, q2, p2] of [
        [1000, 100, 1000, 50],
        [2001450, 161.01, 10000000, 162.08],
        [100, 10, 10000, 1000],
      ]) {
        const merged = mergedEntryPrice(q1, p1, q2, p2)
        const recovered = unmergeEntryPrice(q1, q1 + q2, merged, q2, p2)
        expect(recovered).toBeDefined()
        expect(recovered as number).toBeCloseTo(p1, 6)
      }
    })
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

  it('is negative Infinity when reserves are deficient without side profit', () => {
    const short = makePosition({
      direction: 'short',
      size: 100,
      costBasis: 100,
      entryPrice: 100,
    })
    const state: PerpState = {
      pool: { L: 100, S: 99 },
      positions: [short],
    }
    expect(solvencyFactor('long', state, 100)).toBe(-Infinity)
    expect(() => assertPerpStateSolvent(state, 100)).toThrow(
      'long solvency factor'
    )
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

describe('open interest capacity', () => {
  it('caps aggregate exposure at 10x unreserved opposing cover', () => {
    const state: PerpState = {
      pool: { L: 1000, S: 1000 },
      positions: [
        makePosition({
          direction: 'long',
          size: 9999,
          costBasis: 100,
          entryPrice: 100,
        }),
      ],
    }

    const capacity = getPerpOpenInterestCapacity('long', state, 100)
    expect(PERP_OPEN_INTEREST_COVER_MULTIPLE).toBe(10)
    expect(capacity).toEqual({
      openInterest: 9999,
      availableCover: 1000,
      limit: 10_000,
      headroom: 1,
      isWithinLimit: true,
    })

    const overLimit = {
      ...state,
      positions: [{ ...state.positions[0], size: 10_000.01 }],
    }
    expect(
      getPerpOpenInterestCapacity('long', overLimit, 100).isWithinLimit
    ).toBe(false)
  })

  it('reserves refundable opposite-side value before granting capacity', () => {
    const flatShort = makePosition({
      direction: 'short',
      size: 1000,
      costBasis: 500,
      entryPrice: 100,
    })
    const state: PerpState = {
      pool: { L: 1000, S: 1500 },
      positions: [flatShort],
    }

    const capacity = getPerpOpenInterestCapacity('long', state, 100)
    expect(capacity.openInterest).toBe(0)
    expect(capacity.availableCover).toBe(1000)
    expect(capacity.limit).toBe(10_000)
    expect(capacity.headroom).toBe(10_000)
  })

  it('releases an opposite-side unrealized loss into available cover', () => {
    const losingShort = makePosition({
      direction: 'short',
      size: 1000,
      costBasis: 500,
      entryPrice: 100,
    })
    const state: PerpState = {
      pool: { L: 1000, S: 1500 },
      positions: [losingShort],
    }

    // At 140 the short has lost M$400, so only M$100 remains refundable.
    const capacity = getPerpOpenInterestCapacity('long', state, 140)
    expect(capacity.availableCover).toBeCloseTo(1400, 10)
    expect(capacity.limit).toBeCloseTo(14_000, 10)
  })

  it('fails closed on non-finite aggregate exposure', () => {
    const state: PerpState = {
      pool: { L: 1000, S: 1000 },
      positions: [
        makePosition({
          direction: 'long',
          size: Number.POSITIVE_INFINITY,
          costBasis: 100,
          entryPrice: 100,
        }),
      ],
    }

    expect(() => getPerpOpenInterestCapacity('long', state, 100)).toThrow(
      'position 0 size must be finite'
    )
  })
})

describe('assertPerpPositionNumbers', () => {
  const sound = (over: Partial<PerpPosition> = {}): PerpPosition => ({
    userId: 'u',
    contractId: 'c',
    direction: 'long',
    size: 200_000,
    costBasis: 200_000,
    originalCostBasis: 200_000,
    takerFeeCostBasis: 200,
    entryPrice: 100,
    leverage: 1,
    liquidationPrice: 0,
    openedTime: 1,
    updatedTime: 1,
    ...over,
  })

  it('accepts a sound row', () => {
    expect(() => assertPerpPositionNumbers(sound())).not.toThrow()
  })

  it.each([
    ['entryPrice', { entryPrice: 0 }],
    ['negative entryPrice', { entryPrice: -100 }],
    ['non-finite entryPrice', { entryPrice: Number.NaN }],
    ['non-finite size', { size: Number.POSITIVE_INFINITY }],
    ['negative costBasis', { costBasis: -1 }],
    ['zero costBasis with live exposure', { costBasis: 0 }],
    // The mirror case, and the one a naive "size > 0" filter hides: a row
    // carrying margin at size 0 is corrupt, not closed. The web hook's
    // partition depends on this rejecting.
    ['zero size still carrying margin', { size: 0 }],
    ['negative originalCostBasis', { originalCostBasis: -1 }],
    ['negative takerFeeCostBasis', { takerFeeCostBasis: -1 }],
    ['non-finite takerFeeCostBasis', { takerFeeCostBasis: Number.NaN }],
    ['non-positive leverage', { leverage: 0 }],
    ['non-finite liquidationPrice', { liquidationPrice: Number.NaN }],
  ])('rejects %s', (_label, over) => {
    expect(() => assertPerpPositionNumbers(sound(over))).toThrow()
  })

  it('labels the row so a caller can say WHICH position is corrupt', () => {
    expect(() =>
      assertPerpPositionNumbers(sound({ entryPrice: 0 }), 'opposite leg')
    ).toThrow(/opposite leg entry price must be positive/)
  })

  // Why the engine scans rows IRRESPECTIVE of size, not just the ones its
  // `size > 0` selection returns.
  it('replaces a same-direction row regardless of size, so malformed rows must be rejected first', () => {
    for (const badSize of [Number.NaN, -5, 0]) {
      const corrupt = sound({ size: badSize })
      const state: PerpState = {
        pool: { L: 250_000, S: 250_000 },
        positions: [corrupt],
      }

      // The predicate both engine paths select with does NOT match it, so a
      // guard applied only to the selected rows never sees this row.
      expect(
        state.positions.find(
          (p) => p.userId === 'u' && p.direction === 'long' && p.size > 0
        )
      ).toBeUndefined()

      // But openPosition's replacement filter keys on (userId, direction)
      // ONLY — it never re-checks size — so the trade would overwrite the row
      // and its 200,000 cost basis would vanish from the position table while
      // the pool still held the margin.
      const res = openPosition(
        state,
        'u',
        'c',
        'long',
        100,
        1,
        100,
        undefined,
        1
      )
      expect(res.state.positions).toHaveLength(1)
      expect(res.state.positions[0].costBasis).toBe(100)

      // Hence the guard, which reads every row the user holds.
      expect(() => assertPerpPositionNumbers(corrupt)).toThrow()
    }
  })

  // Why the engine must run this BEFORE closing an opposite leg on a flip.
  it('catches the corrupt row that would otherwise pay out its full margin', () => {
    // getUnrealizedEquity short-circuits to 0 when entryPrice <= 0, so a
    // corrupt row marks as FLAT: closePosition computes pi = 0 and pays
    // costBasis in full, wherever the oracle actually is. Nothing downstream
    // catches it either — the close REMOVES the row from state, so the
    // post-close assertPerpStateSolvent has nothing left to inspect.
    const corrupt = sound({ entryPrice: 0 })
    const state: PerpState = {
      pool: { L: 250_000, S: 250_000 },
      positions: [corrupt],
    }
    const soundAtSameDrawdown = sound()
    expect(getPositionValue(soundAtSameDrawdown, 20)).toBeCloseTo(40_000, 6)
    // Same position, corrupt entry price: worth its full basis at any mark.
    expect(getPositionValue(corrupt, 20)).toBe(200_000)

    const closed = closePosition(state, corrupt, 20)
    expect(closed.payout).toBe(200_000)
    expect(closed.state.positions).toHaveLength(0)
    // The post-close state is "solvent" precisely because the corrupt row is
    // gone — which is why the guard has to run first.
    expect(() => assertPerpStateSolvent(closed.state, 20)).not.toThrow()
    expect(() => assertPerpPositionNumbers(corrupt)).toThrow()
  })
})

describe('assertPerpStateNumbers ordering vs the risk transitions', () => {
  const soundRow = (over: Partial<PerpPosition> = {}): PerpPosition => ({
    userId: 'u',
    contractId: 'c',
    direction: 'long',
    size: 100_000,
    costBasis: 10_000,
    originalCostBasis: 10_000,
    takerFeeCostBasis: 10,
    entryPrice: 100,
    leverage: 10,
    liquidationPrice: 90,
    openedTime: 1,
    updatedTime: 1,
    ...over,
  })

  // processLiquidations OVERWRITES size / costBasis / leverage with 0, so a
  // corruption in any of those three is laundered into a valid zero row.
  it.each(['size', 'costBasis', 'leverage'] as const)(
    'rejects a corrupt %s that liquidation would otherwise zero away',
    (field) => {
      // A 10x long at entry 100 liquidates at 90; mark 50 is well past it.
      const corrupt = soundRow({ [field]: Number.NaN })
      const state: PerpState = {
        pool: { L: 50_000, S: 50_000 },
        positions: [corrupt],
      }

      // Pre-transition: the corruption is visible.
      expect(() => assertPerpStateNumbers(state, 50)).toThrow()

      // Post-transition: it is not. The row survives but its corrupt field
      // has been replaced with 0, leaving a structurally valid zero row.
      const liquidated = processLiquidations(state, 50)
      expect(liquidated.liquidated).toHaveLength(1)
      expect(liquidated.state.positions[0]).toMatchObject({
        size: 0,
        costBasis: 0,
        leverage: 0,
      })
      expect(() => assertPerpStateNumbers(liquidated.state, 50)).not.toThrow()
      expect(() => assertPerpStateSolvent(liquidated.state, 50)).not.toThrow()
    }
  )

  it('rejects a corrupt row that a factor-zero ADL would otherwise settle away', () => {
    // ADL removes a profitable position outright when the factor hits 0, so
    // the same blind spot exists on that transition.
    const corrupt = soundRow({ originalCostBasis: Number.NaN })
    const state: PerpState = {
      pool: { L: 10_000, S: 0 },
      positions: [corrupt],
    }
    expect(() => assertPerpStateNumbers(state, 150)).toThrow()

    const adl = applyADL(state, 150)
    expect(adl.adlFactorLong).toBe(0)
    expect(adl.settled).toHaveLength(1)
    expect(adl.state.positions).toHaveLength(0)
    // Blind after the fact — the row it would have flagged no longer exists.
    expect(() => assertPerpStateNumbers(adl.state, 150)).not.toThrow()
    expect(() => assertPerpStateSolvent(adl.state, 150)).not.toThrow()
  })

  it('is the numbers check, NOT the solvency check — transitions must still repair insolvency', () => {
    // The distinction that makes it safe to assert on the INPUT: a legitimately
    // insolvent book is exactly what liquidation and ADL are for, so asserting
    // solvency there would fail closed on the states they exist to fix.
    const underwater = soundRow({
      direction: 'long',
      entryPrice: 100,
      size: 100_000,
      costBasis: 10_000,
      leverage: 10,
    })
    const insolvent: PerpState = {
      pool: { L: 10_000, S: 0 },
      positions: [underwater],
    }
    // Structurally sound...
    expect(() => assertPerpStateNumbers(insolvent, 150)).not.toThrow()
    // ...but not solvent, and ADL is what repairs that.
    expect(() => assertPerpStateSolvent(insolvent, 150)).toThrow()
    const repaired = applyADL(insolvent, 150)
    expect(() => assertPerpStateSolvent(repaired.state, 150)).not.toThrow()
  })
})

describe('partial close', () => {
  // A long in profit, funded by a short pool with room to pay it.
  const profitableLong = () => {
    const position = makePosition({
      direction: 'long',
      size: 400,
      costBasis: 100,
      entryPrice: 100,
      takerFeeCostBasis: 4,
    })
    const state: PerpState = {
      pool: { L: 100, S: 500 },
      positions: [position],
    }
    return { position, state }
  }

  describe('resolvePerpCloseFraction', () => {
    const row = { size: 400, costBasis: 100 }

    it('refuses a fraction outside (0, 1]', () => {
      expect(() => resolvePerpCloseFraction(row, 0)).toThrow(/in \(0, 1\]/)
      expect(() => resolvePerpCloseFraction(row, -0.5)).toThrow(/in \(0, 1\]/)
      expect(() => resolvePerpCloseFraction(row, 1.5)).toThrow(/in \(0, 1\]/)
      expect(() => resolvePerpCloseFraction(row, NaN)).toThrow(/in \(0, 1\]/)
    })

    it('refuses a close too small to be worth its own event', () => {
      expect(() =>
        resolvePerpCloseFraction(row, PERP_MIN_CLOSE_FRACTION / 2)
      ).toThrow(/at least/)
    })

    it('passes a valid partial through and reads 1 as a full close', () => {
      expect(resolvePerpCloseFraction(row, 0.25)).toBe(0.25)
      expect(resolvePerpCloseFraction(row, PERP_MIN_CLOSE_FRACTION)).toBe(
        PERP_MIN_CLOSE_FRACTION
      )
      expect(resolvePerpCloseFraction(row, 1)).toBe(1)
    })

    it('promotes a close whose remainder would be dust', () => {
      // Half a mana-cent of margin left open — a row that would still accrue
      // funding every period and still need closing by hand.
      expect(resolvePerpCloseFraction(row, 0.99995)).toBe(1)
      // The bound is on the REMAINING margin, not on 1 - fraction, so the
      // same fraction survives on a position large enough for the remainder
      // to be real money.
      expect(
        resolvePerpCloseFraction({ size: 40_000, costBasis: 10_000 }, 0.99995)
      ).toBe(0.99995)
      // At the bound the remainder is kept: PERP_MIN_REMAINDER_COST_BASIS is
      // the smallest margin still worth a row.
      expect(
        resolvePerpCloseFraction(
          { size: 4, costBasis: 1 },
          1 - PERP_MIN_REMAINDER_COST_BASIS
        )
      ).toBe(1 - PERP_MIN_REMAINDER_COST_BASIS)
    })
  })

  it('leaves the full close bit-for-bit what it was', () => {
    const { position, state } = profitableLong()
    const full = closePosition(state, position, 150)

    // π = (150-100)/100 · 400 = 200, paid out of the short pool; the M$100
    // margin comes back out of the long pool.
    expect(full.payout).toBe(300)
    expect(full.pnl).toBe(200)
    expect(full.state.pool).toEqual({ L: 0, S: 300 })
    expect(full.state.positions).toEqual([])
    expect(full.fraction).toBe(1)
    expect(full.remainingPosition).toBeNull()
    expect(full.closedSize).toBe(position.size)
    expect(full.closedCostBasis).toBe(position.costBasis)
    expect(full.closedOriginalCostBasis).toBe(position.originalCostBasis)
    expect(full.closedTakerFeeCostBasis).toBe(4)
  })

  it('pays exactly its fraction of the full close, out of the same pools', () => {
    const { position, state } = profitableLong()
    const full = closePosition(state, position, 150)
    const quarter = closePosition(state, position, 150, 0.25)

    expect(quarter.payout).toBeCloseTo(0.25 * full.payout, 9)
    expect(quarter.pnl).toBeCloseTo(0.25 * full.pnl, 9)
    expect(quarter.poolLongDelta).toBeCloseTo(0.25 * full.poolLongDelta, 9)
    expect(quarter.poolShortDelta).toBeCloseTo(0.25 * full.poolShortDelta, 9)
    expect(quarter.fraction).toBe(0.25)
  })

  it('leaves a survivor at the same entry, leverage and liquidation price', () => {
    const { position, state } = profitableLong()
    const { remainingPosition } = closePosition(state, position, 150, 0.25)
    if (!remainingPosition) throw new Error('expected a surviving position')

    // The whole point: reducing exposure must not move the price at which
    // what is left gets liquidated.
    expect(remainingPosition.entryPrice).toBe(position.entryPrice)
    expect(remainingPosition.leverage).toBeCloseTo(position.leverage, 12)
    expect(remainingPosition.liquidationPrice).toBeCloseTo(
      position.liquidationPrice,
      12
    )
    expect(remainingPosition.size).toBeCloseTo(300, 9)
    expect(remainingPosition.costBasis).toBeCloseTo(75, 9)
    expect(remainingPosition.originalCostBasis).toBeCloseTo(75, 9)
    expect(remainingPosition.takerFeeCostBasis).toBeCloseTo(3, 9)
    // openedTime is what `expectedOpenedTime` matches on, so a partial close
    // must not look like a new position to the next one.
    expect(remainingPosition.openedTime).toBe(position.openedTime)
  })

  it('splits the row without losing or minting any of it', () => {
    const { position, state } = profitableLong()
    // Exact, not close-to: metric-periods rebuilds the pre-close row by
    // adding this event's deltas back onto the survivor, and any drift here
    // is drift in every historical P&L that replays through it.
    for (const fraction of [0.01, 0.25, 1 / 3, 0.5, 0.9]) {
      const res = closePosition(state, position, 150, fraction)
      const survivor = res.remainingPosition
      if (!survivor) throw new Error('expected a surviving position')
      expect(res.closedSize + survivor.size).toBe(position.size)
      expect(res.closedCostBasis + survivor.costBasis).toBe(position.costBasis)
      expect(res.closedOriginalCostBasis + survivor.originalCostBasis).toBe(
        position.originalCostBasis
      )
      expect(
        res.closedTakerFeeCostBasis + (survivor.takerFeeCostBasis ?? 0)
      ).toBe(position.takerFeeCostBasis)
    }
  })

  it('pays the same in two steps as in one', () => {
    const { position, state } = profitableLong()
    const full = closePosition(state, position, 150)

    const first = closePosition(state, position, 150, 0.4)
    const survivor = first.remainingPosition
    if (!survivor) throw new Error('expected a surviving position')
    const second = closePosition(first.state, survivor, 150)

    expect(first.payout + second.payout).toBeCloseTo(full.payout, 9)
    expect(second.state.pool.L).toBeCloseTo(full.state.pool.L, 9)
    expect(second.state.pool.S).toBeCloseTo(full.state.pool.S, 9)
    expect(second.state.positions).toEqual([])
  })

  it('is the state a smaller position would have been in all along', () => {
    const { position, state } = profitableLong()
    const partial = closePosition(state, position, 150, 0.25)

    // Same book, but the trader only ever opened 75% of the position.
    const smaller = makePosition({
      direction: 'long',
      size: 300,
      costBasis: 75,
      entryPrice: 100,
      originalCostBasis: 75,
      takerFeeCostBasis: 3,
    })
    const reference = closePosition(
      { pool: { L: 100, S: 500 }, positions: [smaller] },
      smaller,
      150
    )
    // Closing the survivor next must land exactly where closing the
    // never-larger position would.
    const survivor = partial.remainingPosition
    if (!survivor) throw new Error('expected a surviving position')
    const closeOut = closePosition(partial.state, survivor, 150)
    expect(closeOut.payout).toBeCloseTo(reference.payout, 9)
  })

  it('draws a losing close from the closer own pool only', () => {
    const position = makePosition({
      direction: 'long',
      size: 400,
      costBasis: 100,
      entryPrice: 100,
    })
    const state: PerpState = { pool: { L: 100, S: 500 }, positions: [position] }
    // π = (90-100)/100 · 100 = -10 on a quarter of the notional.
    const res = closePosition(state, position, 90, 0.25)
    expect(res.pnl).toBeCloseTo(-10, 9)
    expect(res.payout).toBeCloseTo(15, 9)
    expect(res.poolLongDelta).toBeCloseTo(-15, 9)
    expect(res.poolShortDelta).toBe(0)
    expect(res.state.pool.S).toBe(500)
  })

  it('pays nothing when the closed leg is past its own margin', () => {
    const position = makePosition({
      direction: 'long',
      size: 400,
      costBasis: 100,
      entryPrice: 100,
    })
    const state: PerpState = { pool: { L: 100, S: 500 }, positions: [position] }
    // A 50% move against a 4x long wipes the margin out entirely.
    const res = closePosition(state, position, 50, 0.5)
    expect(res.payout).toBe(0)
    // toBeCloseTo, not toBe: a zero payout debits the pool by -0, exactly as
    // a full close of the same position always has. Both read as no debit.
    expect(res.poolLongDelta).toBeCloseTo(0, 12)
    expect(res.remainingPosition?.costBasis).toBeCloseTo(50, 9)
  })

  it('leaves a survivor the state validators accept, and a solvent book', () => {
    const { position, state } = profitableLong()
    const res = closePosition(state, position, 150, 0.25)
    expect(() =>
      assertPerpPositionNumbers(res.remainingPosition as PerpPosition)
    ).not.toThrow()
    expect(() => assertPerpStateSolvent(res.state, 150)).not.toThrow()
  })

  it('replaces the row in place rather than reordering the book', () => {
    const other = makePosition({
      userId: 'u2',
      direction: 'short',
      size: 100,
      costBasis: 50,
      entryPrice: 100,
    })
    const { position } = profitableLong()
    const state: PerpState = {
      pool: { L: 100, S: 500 },
      positions: [position, other],
    }
    const res = closePosition(state, position, 150, 0.5)
    expect(res.state.positions).toHaveLength(2)
    expect(res.state.positions[0].userId).toBe('u1')
    expect(res.state.positions[1]).toBe(other)
  })

  it('closes the whole position when the remainder would be dust', () => {
    const position = makePosition({
      direction: 'long',
      size: 400,
      costBasis: 100,
      entryPrice: 100,
    })
    const state: PerpState = { pool: { L: 100, S: 500 }, positions: [position] }
    const res = closePosition(state, position, 150, 1 - 1e-5)
    expect(res.fraction).toBe(1)
    expect(res.remainingPosition).toBeNull()
    expect(res.payout).toBe(300)
    expect(res.state.positions).toEqual([])
  })

  it('keeps a remainder that is still real money', () => {
    const position = makePosition({
      direction: 'long',
      size: 400,
      costBasis: 100,
      entryPrice: 100,
    })
    const state: PerpState = { pool: { L: 100, S: 500 }, positions: [position] }
    // 1% of M$100 is M$1 left open — well above the dust bound.
    const res = closePosition(state, position, 150, 0.99)
    expect(res.fraction).toBe(0.99)
    expect(res.remainingPosition?.costBasis).toBeGreaterThan(
      PERP_MIN_REMAINDER_COST_BASIS
    )
  })

  it('prices a short partial close off the long pool', () => {
    const position = makePosition({
      direction: 'short',
      size: 200,
      costBasis: 100,
      entryPrice: 100,
    })
    const state: PerpState = { pool: { L: 500, S: 100 }, positions: [position] }
    // π = (100-80)/100 · 200 = 40 in profit; half of that is 20.
    const res = closePosition(state, position, 80, 0.5)
    expect(res.pnl).toBeCloseTo(20, 9)
    expect(res.payout).toBeCloseTo(70, 9)
    expect(res.poolShortDelta).toBeCloseTo(-50, 9)
    expect(res.poolLongDelta).toBeCloseTo(-20, 9)
  })
})
