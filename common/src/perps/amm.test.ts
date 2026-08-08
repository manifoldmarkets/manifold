import {
  applyADL,
  applyFunding,
  applyFundingWithSolvency,
  assertPerpFundingConfig,
  assertPerpStateSolvent,
  closePosition,
  computeFundingRate,
  getPerpBackingPool,
  getPerpOpenInterest,
  getPerpOpenInterestCapacity,
  getUnrealizedEquity,
  imbalance,
  isLiquidated,
  liquidationPrice,
  mergedEntryPrice,
  MIN_PERP_LEVERAGE,
  openPosition,
  PERP_OPEN_INTEREST_COVER_MULTIPLE,
  PerpState,
  processLiquidations,
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
