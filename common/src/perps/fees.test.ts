import {
  assertPerpTakerFeeConfig,
  accruePerpPositionTakerFee,
  calcPerpTakerFee,
  creditPerpPoolFee,
  getPerpEffectiveTakerFeeBps,
  getPerpTakerFeeBps,
  PERP_TAKER_FEE_API_BPS_MAX,
  PERP_TAKER_FEE_BPS_DEFAULT,
  PERP_TAKER_FEE_BPS_MAX,
} from './fees'
import { PerpState } from './amm'
import { PerpPosition } from './position'

describe('getPerpTakerFeeBps', () => {
  it('defaults when the field is missing (pre-fee contracts)', () => {
    expect(getPerpTakerFeeBps({})).toBe(PERP_TAKER_FEE_BPS_DEFAULT)
  })

  it('returns a valid configured value, including an explicit 0', () => {
    expect(getPerpTakerFeeBps({ takerFeeBps: 0 })).toBe(0)
    expect(getPerpTakerFeeBps({ takerFeeBps: 2 })).toBe(2)
    expect(getPerpTakerFeeBps({ takerFeeBps: PERP_TAKER_FEE_BPS_MAX })).toBe(
      PERP_TAKER_FEE_BPS_MAX
    )
  })

  it('falls back to the default on corrupt values (display path is total)', () => {
    for (const bad of [
      NaN,
      Infinity,
      -Infinity,
      -1,
      PERP_TAKER_FEE_BPS_MAX + 1,
    ])
      expect(getPerpTakerFeeBps({ takerFeeBps: bad })).toBe(
        PERP_TAKER_FEE_BPS_DEFAULT
      )
  })
})

describe('getPerpEffectiveTakerFeeBps', () => {
  it('web trades always pay the base, ignoring any API rate', () => {
    expect(getPerpEffectiveTakerFeeBps({ takerFeeBps: 10 }, false)).toBe(10)
    expect(
      getPerpEffectiveTakerFeeBps(
        { takerFeeBps: 10, takerFeeApiBps: 200 },
        false
      )
    ).toBe(10)
  })

  it('API trades pay the API rate when it is set and higher', () => {
    expect(
      getPerpEffectiveTakerFeeBps({ takerFeeBps: 10, takerFeeApiBps: 40 }, true)
    ).toBe(40)
    expect(
      getPerpEffectiveTakerFeeBps(
        { takerFeeBps: 10, takerFeeApiBps: PERP_TAKER_FEE_API_BPS_MAX },
        true
      )
    ).toBe(PERP_TAKER_FEE_API_BPS_MAX)
  })

  it('an API rate below the base can never discount API flow', () => {
    expect(
      getPerpEffectiveTakerFeeBps({ takerFeeBps: 50, takerFeeApiBps: 5 }, true)
    ).toBe(50)
    expect(
      getPerpEffectiveTakerFeeBps({ takerFeeBps: 50, takerFeeApiBps: 0 }, true)
    ).toBe(50)
  })

  it('missing or corrupt API rate reads as "no separate rate" (display path is total)', () => {
    expect(getPerpEffectiveTakerFeeBps({ takerFeeBps: 10 }, true)).toBe(10)
    for (const bad of [NaN, Infinity, -1, PERP_TAKER_FEE_API_BPS_MAX + 1])
      expect(
        getPerpEffectiveTakerFeeBps(
          { takerFeeBps: 10, takerFeeApiBps: bad },
          true
        )
      ).toBe(10)
  })

  it('defaults the base for pre-fee contracts on both channels', () => {
    expect(getPerpEffectiveTakerFeeBps({}, false)).toBe(
      PERP_TAKER_FEE_BPS_DEFAULT
    )
    expect(getPerpEffectiveTakerFeeBps({ takerFeeApiBps: 40 }, true)).toBe(40)
    // Pin the DEFAULT as the API branch's floor too. Without these two, an
    // implementation that read takerFeeBps raw on the API branch (0 when
    // absent) would charge legacy contracts 0 bps and let an API rate below
    // the default win — the exact inversion this function exists to prevent
    // — while every other assertion here stayed green.
    expect(getPerpEffectiveTakerFeeBps({}, true)).toBe(
      PERP_TAKER_FEE_BPS_DEFAULT
    )
    expect(getPerpEffectiveTakerFeeBps({ takerFeeApiBps: 5 }, true)).toBe(
      PERP_TAKER_FEE_BPS_DEFAULT
    )
  })
})

describe('assertPerpTakerFeeConfig', () => {
  it('accepts undefined and the full valid range', () => {
    expect(() => assertPerpTakerFeeConfig({})).not.toThrow()
    expect(() => assertPerpTakerFeeConfig({ takerFeeBps: 0 })).not.toThrow()
    expect(() =>
      assertPerpTakerFeeConfig({ takerFeeBps: PERP_TAKER_FEE_BPS_MAX })
    ).not.toThrow()
    expect(() =>
      assertPerpTakerFeeConfig({ takerFeeApiBps: 0 }, true)
    ).not.toThrow()
    expect(() =>
      assertPerpTakerFeeConfig(
        { takerFeeApiBps: PERP_TAKER_FEE_API_BPS_MAX },
        true
      )
    ).not.toThrow()
  })

  it('fails closed on corrupt persisted values', () => {
    for (const bad of [NaN, Infinity, -1, PERP_TAKER_FEE_BPS_MAX + 0.001])
      expect(() => assertPerpTakerFeeConfig({ takerFeeBps: bad })).toThrow()
    for (const bad of [NaN, Infinity, -1, PERP_TAKER_FEE_API_BPS_MAX + 0.001])
      expect(() =>
        assertPerpTakerFeeConfig({ takerFeeApiBps: bad }, true)
      ).toThrow()
  })

  it('a corrupt API rate does not halt the web channel', () => {
    // The API rate governs API flow only. Failing closed on it for a web
    // open would take the market dark for every ordinary trader over a
    // field their trades never read.
    for (const bad of [NaN, Infinity, -1, PERP_TAKER_FEE_API_BPS_MAX + 0.001]) {
      expect(() =>
        assertPerpTakerFeeConfig({ takerFeeBps: 10, takerFeeApiBps: bad })
      ).not.toThrow()
      expect(getPerpEffectiveTakerFeeBps({ takerFeeBps: 10 }, false)).toBe(10)
    }
    // ...but a corrupt BASE still fails closed on both channels.
    expect(() =>
      assertPerpTakerFeeConfig({ takerFeeBps: NaN, takerFeeApiBps: 30 })
    ).toThrow()
  })
})

describe('calcPerpTakerFee', () => {
  it('charges bps of notional', () => {
    // 5 bps on M$200,000 notional = M$100.
    expect(calcPerpTakerFee(200_000, 5)).toBeCloseTo(100, 10)
    expect(calcPerpTakerFee(10 * 2, 5)).toBeCloseTo(0.01, 12)
  })

  it('scales with notional, so the fee cannot be outgrown by sizing up', () => {
    const fee = calcPerpTakerFee(1_000, 5)
    expect(calcPerpTakerFee(10_000, 5)).toBeCloseTo(10 * fee, 10)
  })

  it('crosses the margin exactly at feeBps x leverage = 10_000', () => {
    // The engine rejects an open whose fee meets or exceeds its margin
    // (openFee >= mana). Because the fee is charged on NOTIONAL, that floor
    // is a pure statement about this function, so pin it here: the two
    // config domains are validated independently of maxLeverage, and this
    // is the arithmetic that decides whether a given pair is survivable.
    const mana = 1_000
    const feeAt = (bps: number, leverage: number) =>
      calcPerpTakerFee(mana * leverage, bps)

    // Honest settings sit far below the floor.
    expect(feeAt(PERP_TAKER_FEE_BPS_DEFAULT, 100)).toBeCloseTo(0.1 * mana, 10)
    expect(feeAt(30, 100)).toBeCloseTo(0.3 * mana, 10)

    // The boundary itself, from both sides.
    expect(feeAt(100, 100)).toBeCloseTo(mana, 10) // 100 x 100 = 10_000
    expect(feeAt(100, 99)).toBeLessThan(mana)
    expect(feeAt(101, 100)).toBeGreaterThan(mana)

    // The API domain crosses it well inside the allowed leverage range:
    // at the ceiling the floor is breached above ~33x, and at maxLeverage
    // 100 the fee would be 3x the margin posted.
    expect(feeAt(PERP_TAKER_FEE_API_BPS_MAX, 34)).toBeGreaterThan(mana)
    expect(feeAt(PERP_TAKER_FEE_API_BPS_MAX, 33)).toBeLessThan(mana)
    expect(feeAt(PERP_TAKER_FEE_API_BPS_MAX, 100)).toBeCloseTo(3 * mana, 10)
  })

  it('returns 0 for degenerate inputs', () => {
    for (const notional of [0, -1, NaN, Infinity])
      expect(calcPerpTakerFee(notional, 5)).toBe(0)
    for (const bps of [0, -5, NaN, Infinity])
      expect(calcPerpTakerFee(1_000, bps)).toBe(0)
  })

  it('exceeds the measured tick-sniping edge at the default rate', () => {
    // The BTC bots' realized edge was ~1.5 bps of notional per round trip.
    // Closing is free, so the open-side default IS the round-trip cost and
    // must price that out with margin to spare.
    expect(PERP_TAKER_FEE_BPS_DEFAULT).toBeGreaterThan(0.73 * 2)
  })
})

describe('creditPerpPoolFee', () => {
  const state: PerpState = { pool: { L: 100, S: 50 }, positions: [] }

  it('credits the given side only', () => {
    expect(creditPerpPoolFee(state, 'long', 5).pool).toEqual({ L: 105, S: 50 })
    expect(creditPerpPoolFee(state, 'short', 5).pool).toEqual({ L: 100, S: 55 })
  })

  it('conserves total pool + fee', () => {
    const next = creditPerpPoolFee(state, 'short', 2.5)
    expect(next.pool.L + next.pool.S).toBeCloseTo(
      state.pool.L + state.pool.S + 2.5,
      12
    )
  })

  it('is identity for zero or degenerate fees', () => {
    for (const fee of [0, -1, NaN, Infinity])
      expect(creditPerpPoolFee(state, 'long', fee)).toBe(state)
  })

  it('does not mutate the input state', () => {
    creditPerpPoolFee(state, 'long', 5)
    expect(state.pool).toEqual({ L: 100, S: 50 })
  })
})

describe('accruePerpPositionTakerFee', () => {
  const position: PerpPosition = {
    userId: 'u1',
    contractId: 'c1',
    direction: 'long',
    size: 1_000,
    costBasis: 100,
    originalCostBasis: 100,
    takerFeeCostBasis: 0.5,
    entryPrice: 100,
    leverage: 10,
    liquidationPrice: 90,
    openedTime: 1,
    updatedTime: 1,
  }
  const other = { ...position, userId: 'u2' }
  const state: PerpState = {
    pool: { L: 100, S: 50 },
    positions: [position, other],
  }

  it('tracks cumulative fees without changing margin or other positions', () => {
    const next = accruePerpPositionTakerFee(state, position, 0.25)
    expect(next.position).toEqual({ ...position, takerFeeCostBasis: 0.75 })
    expect(next.state.positions).toEqual([next.position, other])
    expect(next.position.costBasis).toBe(position.costBasis)
    expect(next.position.originalCostBasis).toBe(position.originalCostBasis)
    expect(state.positions[0]).toBe(position)
  })

  it('is an identity for zero or invalid new fees', () => {
    for (const fee of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const next = accruePerpPositionTakerFee(state, position, fee)
      expect(next).toEqual({ state, position })
    }
  })

  it('fails closed on corrupt stored fee basis', () => {
    expect(() =>
      accruePerpPositionTakerFee(
        state,
        { ...position, takerFeeCostBasis: Number.NaN },
        1
      )
    ).toThrow()
  })
})
