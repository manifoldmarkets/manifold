import {
  assertPerpTakerFeeConfig,
  accruePerpPositionTakerFee,
  calcPerpTakerFee,
  calculatePerpOpenCashFlow,
  creditPerpPoolFee,
  getPerpTakerFeeBps,
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

describe('assertPerpTakerFeeConfig', () => {
  it('accepts undefined and the full valid range', () => {
    expect(() => assertPerpTakerFeeConfig({})).not.toThrow()
    expect(() => assertPerpTakerFeeConfig({ takerFeeBps: 0 })).not.toThrow()
    expect(() =>
      assertPerpTakerFeeConfig({ takerFeeBps: PERP_TAKER_FEE_BPS_MAX })
    ).not.toThrow()
  })

  it('fails closed on corrupt persisted values', () => {
    for (const bad of [NaN, Infinity, -1, PERP_TAKER_FEE_BPS_MAX + 0.001])
      expect(() => assertPerpTakerFeeConfig({ takerFeeBps: bad })).toThrow()
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

describe('calculatePerpOpenCashFlow', () => {
  const base = {
    balance: 100,
    margin: 100,
    leverage: 100,
    feeBps: 10,
  }

  it('includes the opening fee in the required debit', () => {
    expect(calculatePerpOpenCashFlow(base)).toEqual({
      notional: 10_000,
      openFee: 10,
      totalDebit: 110,
      spendableBalance: 100,
      isAffordable: false,
    })
  })

  it('rejects a raw-balance maximum when a fractional fee is still due', () => {
    expect(
      calculatePerpOpenCashFlow({
        balance: 10,
        margin: 10,
        leverage: 2,
        feeBps: 10,
      })
    ).toEqual({
      notional: 20,
      openFee: 0.02,
      totalDebit: 10.02,
      spendableBalance: 10,
      isAffordable: false,
    })
  })

  it('lets a free flip payout fund the new margin and fee', () => {
    expect(
      calculatePerpOpenCashFlow({ ...base, balance: 0, closePayout: 110 })
    ).toMatchObject({ spendableBalance: 110, isAffordable: true })
  })

  it('accepts the exact boundary and preserves zero-fee behavior', () => {
    expect(
      calculatePerpOpenCashFlow({ ...base, balance: 109.999 })?.isAffordable
    ).toBe(false)
    expect(
      calculatePerpOpenCashFlow({ ...base, balance: 110 })?.isAffordable
    ).toBe(true)
    expect(calculatePerpOpenCashFlow({ ...base, feeBps: 0 })).toMatchObject({
      openFee: 0,
      totalDebit: 100,
      isAffordable: true,
    })
  })

  it('fails closed on invalid or overflowing inputs', () => {
    expect(
      calculatePerpOpenCashFlow({ ...base, balance: Number.NaN })
    ).toBeUndefined()
    expect(calculatePerpOpenCashFlow({ ...base, margin: 0 })).toBeUndefined()
    expect(
      calculatePerpOpenCashFlow({ ...base, leverage: Infinity })
    ).toBeUndefined()
    expect(
      calculatePerpOpenCashFlow({ ...base, closePayout: -1 })
    ).toBeUndefined()
    expect(
      calculatePerpOpenCashFlow({
        ...base,
        margin: Number.MAX_VALUE,
        leverage: 2,
      })
    ).toBeUndefined()
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
