import { APIError } from './api/utils'
import { LimitBet } from './bet'
import { computeFills, getCpmmProbability } from './calculate-cpmm'
import {
  MAX_CPMM_PROB,
  MAX_FINE_CPMM_PROB,
  MIN_CPMM_PROB,
  MIN_FINE_CPMM_PROB,
} from './contract'
import { noFees } from './fees'
import { getRoundedLimitProb } from './new-bet'

const STANDARD_BOUNDS = { max: MAX_CPMM_PROB, min: MIN_CPMM_PROB }
const FINE_BOUNDS = { max: MAX_FINE_CPMM_PROB, min: MIN_FINE_CPMM_PROB }

const makeLimitBet = (props: {
  id: string
  userId: string
  outcome: 'YES' | 'NO'
  limitProb: number
  orderAmount: number
}): LimitBet =>
  ({
    ...props,
    amount: 0,
    shares: 0,
    contractId: 'contract1',
    createdTime: 1,
    isFilled: false,
    isCancelled: false,
    fills: [],
    probBefore: 0.5,
    probAfter: 0.5,
    fees: noFees,
    isRedemption: false,
    visibility: 'public',
  } as unknown as LimitBet)

// p = 0.5, so prob(YES) = NO / (YES + NO)
const poolAtProb = (prob: number, liquidity = 1000) => ({
  pool: { YES: liquidity * (1 - prob), NO: liquidity * prob },
  p: 0.5,
  collectedFees: noFees,
})

describe('getRoundedLimitProb', () => {
  it('passes undefined through', () => {
    expect(getRoundedLimitProb(undefined)).toBeUndefined()
    expect(getRoundedLimitProb(undefined, true)).toBeUndefined()
  })

  describe('without fineProbBetting (legacy behavior)', () => {
    it('accepts whole percentage points', () => {
      expect(getRoundedLimitProb(0.97)).toBe(0.97)
      expect(getRoundedLimitProb(0.99)).toBe(0.99)
      expect(getRoundedLimitProb(0.01)).toBe(0.01)
      expect(getRoundedLimitProb(0.5)).toBe(0.5)
    })

    it('rejects sub-percentage-point increments everywhere', () => {
      expect(() => getRoundedLimitProb(0.975)).toThrow(APIError)
      expect(() => getRoundedLimitProb(0.005)).toThrow(APIError)
      expect(() => getRoundedLimitProb(0.999)).toThrow(APIError)
      expect(() => getRoundedLimitProb(0.001)).toThrow(APIError)
    })

    it('rounds float noise to whole percentage points', () => {
      expect(getRoundedLimitProb(0.9700000000001)).toBe(0.97)
    })
  })

  describe('with fineProbBetting', () => {
    it('accepts 0.1pp increments at the tails', () => {
      expect(getRoundedLimitProb(0.975, true)).toBe(0.975)
      expect(getRoundedLimitProb(0.999, true)).toBe(0.999)
      expect(getRoundedLimitProb(0.001, true)).toBe(0.001)
      expect(getRoundedLimitProb(0.029, true)).toBe(0.029)
    })

    it('still accepts whole percentage points everywhere', () => {
      expect(getRoundedLimitProb(0.03, true)).toBe(0.03)
      expect(getRoundedLimitProb(0.97, true)).toBe(0.97)
      expect(getRoundedLimitProb(0.55, true)).toBe(0.55)
    })

    it('rejects 0.1pp increments between 3% and 97%', () => {
      expect(() => getRoundedLimitProb(0.045, true)).toThrow(APIError)
      expect(() => getRoundedLimitProb(0.505, true)).toThrow(APIError)
      expect(() => getRoundedLimitProb(0.965, true)).toThrow(APIError)
    })

    it('rejects increments finer than 0.1pp even at the tails', () => {
      expect(() => getRoundedLimitProb(0.9995, true)).toThrow(APIError)
      expect(() => getRoundedLimitProb(0.0295, true)).toThrow(APIError)
      expect(() => getRoundedLimitProb(0.9705, true)).toThrow(APIError)
    })
  })
})

describe('computeFills with fine prob bounds', () => {
  it('lets a NO taker fill a resting YES maker at 99.5% without moving the pool', () => {
    const state = poolAtProb(0.98)
    const maker = makeLimitBet({
      id: 'maker1',
      userId: 'alice',
      outcome: 'YES',
      limitProb: 0.995,
      orderAmount: 1000,
    })

    const { takers, makers, cpmmState } = computeFills(
      state,
      'NO',
      1,
      undefined,
      [maker],
      { alice: 10000 },
      STANDARD_BOUNDS,
      true // freeFees, for exact price assertions
    )

    expect(takers).toHaveLength(1)
    expect(takers[0].matchedBetId).toBe('maker1')
    // Taker buys NO at 1 - 0.995 = 0.005 per share.
    expect(takers[0].amount / takers[0].shares).toBeCloseTo(0.005, 10)
    expect(makers[0].amount / makers[0].shares).toBeCloseTo(0.995, 10)
    // Direct match: the pool is untouched.
    expect(cpmmState.pool).toEqual(state.pool)
  })

  it('still stops an unflagged market order at 99%', () => {
    const state = poolAtProb(0.98)
    const { cpmmState } = computeFills(
      state,
      'YES',
      1e6,
      undefined,
      [],
      {},
      STANDARD_BOUNDS,
      true
    )
    expect(getCpmmProbability(cpmmState.pool, cpmmState.p)).toBeCloseTo(
      MAX_CPMM_PROB,
      6
    )
  })

  it('lets a flagged market order move the pool to 99.9%', () => {
    const state = poolAtProb(0.98)
    const { cpmmState } = computeFills(
      state,
      'YES',
      1e6,
      undefined,
      [],
      {},
      FINE_BOUNDS,
      true
    )
    expect(getCpmmProbability(cpmmState.pool, cpmmState.p)).toBeCloseTo(
      MAX_FINE_CPMM_PROB,
      6
    )
  })

  it('still clamps an unflagged explicit limit to 99%', () => {
    const state = poolAtProb(0.98)
    const { cpmmState } = computeFills(
      state,
      'YES',
      1e6,
      0.995, // beyond standard bounds; clamped without the fine flag
      [],
      {},
      STANDARD_BOUNDS,
      true
    )
    expect(getCpmmProbability(cpmmState.pool, cpmmState.p)).toBeCloseTo(
      MAX_CPMM_PROB,
      6
    )
  })

  it('lets an unflagged user at a >99% pool bet only toward 50%', () => {
    const state = poolAtProb(0.995)

    const yesBet = computeFills(
      state,
      'YES',
      100,
      undefined,
      [],
      {},
      STANDARD_BOUNDS,
      true
    )
    expect(yesBet.takers).toHaveLength(0)

    const noBet = computeFills(
      state,
      'NO',
      100,
      undefined,
      [],
      {},
      STANDARD_BOUNDS,
      true
    )
    expect(noBet.takers.length).toBeGreaterThan(0)
    expect(
      getCpmmProbability(noBet.cpmmState.pool, noBet.cpmmState.p)
    ).toBeLessThan(0.995)
  })

  it('lets a flagged YES limit at 99.5% cross a resting NO maker at 99.5%', () => {
    const state = poolAtProb(0.98)
    const maker = makeLimitBet({
      id: 'maker2',
      userId: 'bob',
      outcome: 'NO',
      limitProb: 0.995,
      orderAmount: 5,
    })

    const { takers, cpmmState } = computeFills(
      state,
      'YES',
      1e6,
      0.995,
      [maker],
      { bob: 10000 },
      FINE_BOUNDS,
      true
    )

    // Fills from the pool up to 99.5%, then directly against the maker.
    expect(takers.some((t) => t.matchedBetId === 'maker2')).toBe(true)
    expect(getCpmmProbability(cpmmState.pool, cpmmState.p)).toBeCloseTo(
      0.995,
      6
    )
  })
})
