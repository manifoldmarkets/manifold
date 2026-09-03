import {
  getPerpOpenInterestCapacity,
  liquidationPrice,
  PERP_OPEN_INTEREST_COVER_MULTIPLE,
  PerpState,
} from './amm'
import { PerpDirection, PerpPosition } from './position'
import { applyPerpProtectedClaimAdl } from './protected-basis'
import {
  calculatePerpCompatAdmissionLimit,
  comparePerpAdmissionPolicies,
  evaluatePerpAdmissionShadow,
  evaluatePerpClaimAllowanceShadow,
  evaluatePerpExactStressShadow,
  PERP_ADMISSION_POLICY_CANDIDATE,
  PERP_ADMISSION_POLICY_COMPAT,
} from './risk-policy-shadow'

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

// The #4030 capacity fixtures, verbatim, with the numbers that PR pinned.
// Their assertions live in amm.test.ts; here they prove the shadow formula
// at U = M reproduces the enforcing one on every one of them.
const COMPAT_FIXTURES: {
  name: string
  side: PerpDirection
  state: PerpState
  price: number
  limit: number
  matchedCredit: number
}[] = [
  {
    name: 'caps at 10x unreserved opposing cover',
    side: 'long',
    state: {
      pool: { L: 1000, S: 1000 },
      positions: [
        makePosition({
          direction: 'long',
          size: 9999,
          costBasis: 100,
          entryPrice: 100,
        }),
      ],
    },
    price: 100,
    limit: 10_000,
    matchedCredit: 0,
  },
  {
    name: 'reserves refundable opposite-side value',
    side: 'long',
    state: {
      pool: { L: 1000, S: 1500 },
      positions: [
        makePosition({
          direction: 'short',
          size: 1000,
          costBasis: 500,
          entryPrice: 100,
        }),
      ],
    },
    price: 100,
    limit: 11_000,
    matchedCredit: 1000,
  },
  {
    name: 'releases an opposite-side unrealized loss',
    side: 'long',
    state: {
      pool: { L: 1000, S: 1500 },
      positions: [
        makePosition({
          direction: 'short',
          size: 1000,
          costBasis: 500,
          entryPrice: 100,
        }),
      ],
    },
    price: 140,
    limit: 15_000,
    matchedCredit: 1000,
  },
  {
    name: 'credits the opposing notional funded from its own losses',
    side: 'long',
    state: {
      pool: { L: 1000, S: 1000 },
      positions: [
        makePosition({
          direction: 'short',
          size: 4000,
          costBasis: 1000,
          entryPrice: 100,
        }),
      ],
    },
    price: 100,
    limit: 4000,
    matchedCredit: 4000,
  },
  {
    name: 'caps the credit by the opposing margin',
    side: 'long',
    state: {
      pool: { L: 1000, S: 100 },
      positions: [
        makePosition({
          direction: 'short',
          size: 10_000,
          costBasis: 100,
          entryPrice: 100,
        }),
      ],
    },
    price: 100,
    limit: 1000,
    matchedCredit: 1000,
  },
  {
    name: 'short-heavy book takes the balancing long',
    side: 'long',
    state: {
      pool: { L: 1000, S: 200 },
      positions: [
        makePosition({
          direction: 'long',
          size: 2000,
          costBasis: 100,
          entryPrice: 100,
        }),
        makePosition({
          userId: 'u2',
          direction: 'short',
          size: 3000,
          costBasis: 150,
          entryPrice: 100,
        }),
      ],
    },
    price: 100,
    limit: 2000,
    matchedCredit: 1500,
  },
  {
    name: 'credits nothing for a profitable opponent',
    side: 'long',
    state: {
      pool: { L: 500, S: 100 },
      positions: [
        makePosition({
          direction: 'short',
          size: 1000,
          costBasis: 100,
          entryPrice: 200,
        }),
      ],
    },
    price: 100,
    limit: 0,
    matchedCredit: 0,
  },
  {
    name: 'never promises more than the opposing pool',
    side: 'short',
    state: {
      pool: { L: 100, S: 1000 },
      positions: [
        makePosition({
          direction: 'long',
          size: 1000,
          costBasis: 200,
          entryPrice: 100,
        }),
      ],
    },
    price: 100,
    limit: 1000,
    matchedCredit: 1000,
  },
]

describe('compatibility admission at U = M = 10 and b = c', () => {
  it.each(COMPAT_FIXTURES)(
    '$name: enforcing capacity is the #4030 number',
    ({ side, state, price, limit, matchedCredit }) => {
      const capacity = getPerpOpenInterestCapacity(side, state, price)
      expect(capacity.limit).toBeCloseTo(limit, 9)
      expect(capacity.matchedCredit).toBeCloseTo(matchedCredit, 9)
      expect(PERP_OPEN_INTEREST_COVER_MULTIPLE).toBe(10)
      expect(PERP_ADMISSION_POLICY_COMPAT).toEqual({
        coverMultiple: 10,
        unreservedMultiple: 10,
      })
    }
  )

  it.each(COMPAT_FIXTURES)(
    '$name: the shadow formula at U = M agrees with the enforcing one',
    ({ side, state, price }) => {
      const capacity = getPerpOpenInterestCapacity(side, state, price)
      const shadow = evaluatePerpAdmissionShadow(
        side,
        state,
        price,
        PERP_ADMISSION_POLICY_COMPAT
      )
      expect(shadow.limit).toBeCloseTo(capacity.limit, 9)
      expect(shadow.matchedCredit).toBeCloseTo(capacity.matchedCredit, 9)
      expect(shadow.headroom).toBeCloseTo(capacity.headroom, 9)
      expect(shadow.isWithinLimit).toBe(capacity.isWithinLimit)
      expect(shadow.policy.unreservedMultiple).toBe(10)
    }
  )

  it('never mutates the state it evaluates', () => {
    const fixture = COMPAT_FIXTURES[5]
    const frozen = JSON.stringify(fixture.state)
    comparePerpAdmissionPolicies(fixture.side, fixture.state, fixture.price)
    evaluatePerpExactStressShadow(
      fixture.side,
      fixture.state,
      fixture.price,
      PERP_ADMISSION_POLICY_CANDIDATE
    )
    evaluatePerpClaimAllowanceShadow(fixture.state, fixture.price, 0.1)
    expect(JSON.stringify(fixture.state)).toBe(frozen)
  })
})

describe('calculatePerpCompatAdmissionLimit', () => {
  const base = {
    opposingUnreserved: 500,
    opposingPaperLosses: 200,
    opposingOpenInterest: 3000,
    opposingPool: 5000,
  }

  it('retains the opposing-OI cap on matchedCredit and does not collapse to U·H + M·D(P*) when it binds', () => {
    const binding = calculatePerpCompatAdmissionLimit(
      { ...base, rawMatchedCredit: 4000 },
      PERP_ADMISSION_POLICY_COMPAT
    )
    expect(binding.matchedCredit).toBe(3000)
    expect(binding.matchedCreditCapBinds).toBe(true)
    expect(binding.limit).toBe(10 * 500 + 10 * 200 + 3000)
    expect(binding.naiveStressLimit).toBe(10 * 500 + 10 * 200 + 4000)
    expect(binding.naiveAgreesWithCompat).toBe(false)

    const free = calculatePerpCompatAdmissionLimit(
      { ...base, rawMatchedCredit: 2000 },
      PERP_ADMISSION_POLICY_COMPAT
    )
    expect(free.matchedCredit).toBe(2000)
    expect(free.matchedCreditCapBinds).toBe(false)
    expect(free.limit).toBe(free.naiveStressLimit)
    expect(free.naiveAgreesWithCompat).toBe(true)
  })

  it('applies the defensive M·pool cap and floors a negative base at zero', () => {
    const capped = calculatePerpCompatAdmissionLimit(
      { ...base, opposingPool: 300, rawMatchedCredit: 2000 },
      PERP_ADMISSION_POLICY_COMPAT
    )
    expect(capped.limit).toBe(3000)
    const negative = calculatePerpCompatAdmissionLimit(
      {
        ...base,
        opposingUnreserved: -1000,
        opposingPaperLosses: 0,
        rawMatchedCredit: 100,
      },
      PERP_ADMISSION_POLICY_COMPAT
    )
    expect(negative.uncappedLimit).toBe(100)
  })

  it('weights unreserved balance by U while paper losses keep the full M', () => {
    const candidate = calculatePerpCompatAdmissionLimit(
      { ...base, rawMatchedCredit: 2000 },
      PERP_ADMISSION_POLICY_CANDIDATE
    )
    expect(candidate.limit).toBe(1 * 500 + 10 * 200 + 2000)
  })

  it('validates the policy and inputs', () => {
    expect(() =>
      calculatePerpCompatAdmissionLimit(
        { ...base, rawMatchedCredit: 0 },
        { coverMultiple: 10, unreservedMultiple: 11 }
      )
    ).toThrow()
    expect(() =>
      calculatePerpCompatAdmissionLimit(
        { ...base, rawMatchedCredit: 0 },
        { coverMultiple: 0, unreservedMultiple: 0 }
      )
    ).toThrow()
    expect(() =>
      calculatePerpCompatAdmissionLimit(
        { ...base, rawMatchedCredit: Number.NaN },
        PERP_ADMISSION_POLICY_COMPAT
      )
    ).toThrow()
  })
})

describe('candidate U = 1 and the exact stress rule (shadow only)', () => {
  it('is never looser than the compatibility gate and flags where it is stricter', () => {
    const state: PerpState = {
      pool: { L: 1000, S: 5000 },
      positions: [
        makePosition({
          direction: 'long',
          size: 20_000,
          costBasis: 1000,
          entryPrice: 100,
        }),
        makePosition({
          userId: 'u2',
          direction: 'short',
          size: 500,
          costBasis: 500,
          entryPrice: 100,
        }),
      ],
    }
    const comparison = comparePerpAdmissionPolicies('long', state, 100)
    expect(comparison.compat.isWithinLimit).toBe(true)
    expect(comparison.candidate.limit).toBeLessThanOrEqual(
      comparison.compat.limit + 1e-9
    )
    expect(comparison.candidate.isWithinLimit).toBe(false)
    expect(comparison.candidateStricter).toBe(true)
    expect(comparison.headroomDifference).toBeLessThan(0)
  })

  it.each([
    ['profitable', 80],
    ['flat', 100],
    ['underwater', 120],
  ] as const)(
    'evaluates the exact rule against a %s opposing short and may disagree with the compatibility gate',
    (_label, entry) => {
      const state: PerpState = {
        pool: { L: 1000, S: 1200 },
        positions: [
          makePosition({
            direction: 'long',
            size: 6000,
            costBasis: 600,
            entryPrice: 100,
          }),
          makePosition({
            userId: 'u2',
            direction: 'short',
            size: 2000,
            costBasis: 1000,
            entryPrice: entry,
          }),
        ],
      }
      const price = 100
      const exact = evaluatePerpExactStressShadow(
        'long',
        state,
        price,
        PERP_ADMISSION_POLICY_COMPAT
      )
      expect(exact.stressPrice).toBeCloseTo(110, 12)
      expect(exact.alpha).toBe(1)
      expect(exact.contingentClaimsAtStress).toBeGreaterThan(0)
      expect(exact.allowance).toBeCloseTo(
        exact.opposingPaperLossesAtStress + exact.opposingUnreserved,
        9
      )
      expect(exact.margin).toBeCloseTo(
        exact.allowance - exact.contingentClaimsAtStress,
        9
      )
      expect(exact.passes).toBe(exact.margin >= 0)
      const comparison = comparePerpAdmissionPolicies(
        'long',
        state,
        price,
        PERP_ADMISSION_POLICY_COMPAT
      )
      expect(typeof comparison.exactDisagrees).toBe('boolean')
      expect(comparison.exactDisagrees).toBe(
        comparison.compat.isWithinLimit !== exact.passes
      )
    }
  )

  it('does not reproduce the legacy decision at U = M: a profitable long book passes compat but fails the exact rule', () => {
    // Longs already carrying 300 of contingent claim at the stress mark
    // against a short side with no paper loss and 250 of H.
    const state: PerpState = {
      pool: { L: 1000, S: 250 },
      positions: [
        makePosition({
          direction: 'long',
          size: 2000,
          costBasis: 1000,
          entryPrice: 100,
        }),
      ],
    }
    const compat = getPerpOpenInterestCapacity('long', state, 100)
    const exact = evaluatePerpExactStressShadow(
      'long',
      state,
      100,
      PERP_ADMISSION_POLICY_COMPAT
    )
    expect(compat.isWithinLimit).toBe(true)
    expect(exact.contingentClaimsAtStress).toBeCloseTo(200, 9)
    expect(exact.allowance).toBeCloseTo(250, 9)
    expect(exact.passes).toBe(true)
    // One more standalone position right at the exact headroom sits on the boundary.
    expect(exact.standaloneHeadroom).toBeCloseTo(500, 9)
    const withExtra: PerpState = {
      pool: { L: 1000 + 50, S: 250 },
      positions: [
        ...state.positions,
        makePosition({
          userId: 'u2',
          direction: 'long',
          size: 500,
          costBasis: 50,
          entryPrice: 100,
        }),
      ],
    }
    const boundary = evaluatePerpExactStressShadow(
      'long',
      withExtra,
      100,
      PERP_ADMISSION_POLICY_COMPAT
    )
    expect(boundary.margin).toBeCloseTo(0, 9)
    expect(
      getPerpOpenInterestCapacity('long', withExtra, 100).isWithinLimit
    ).toBe(true)
    // Past it, compat still admits (2500 OI vs a 2500 limit — within
    // tolerance) while the exact rule rejects.
    const over: PerpState = {
      pool: { L: 1000 + 60, S: 250 },
      positions: [
        ...state.positions,
        makePosition({
          userId: 'u2',
          direction: 'long',
          size: 600,
          costBasis: 60,
          entryPrice: 100,
        }),
      ],
    }
    expect(
      evaluatePerpExactStressShadow(
        'long',
        over,
        100,
        PERP_ADMISSION_POLICY_COMPAT
      ).passes
    ).toBe(false)
  })
})

describe('current-claim allowance alpha (shadow only)', () => {
  const state: PerpState = {
    pool: { L: 1000, S: 400 },
    positions: [
      makePosition({
        direction: 'long',
        size: 5000,
        costBasis: 1000,
        entryPrice: 100,
      }),
      makePosition({
        userId: 'u2',
        direction: 'short',
        size: 1000,
        costBasis: 200,
        entryPrice: 100,
      }),
    ],
  }
  const price = 110

  it('reproduces the Workstream A factor at alpha = 1 and only lowers it below', () => {
    const actual = applyPerpProtectedClaimAdl(state, price)
    const full = evaluatePerpClaimAllowanceShadow(state, price, 1)
    expect(full.long.factor).toBeCloseTo(actual.adlFactorLong, 12)
    const discounted = evaluatePerpClaimAllowanceShadow(state, price, 0.1)
    expect(discounted.long.available).toBeCloseTo(
      full.long.opposingPaperLosses + 0.1 * full.long.opposingUnreserved,
      9
    )
    expect(discounted.long.factor).toBeLessThan(full.long.factor)
    expect(discounted.long.projectedAdlAmount).toBeGreaterThan(
      full.long.projectedAdlAmount
    )
    expect(
      discounted.long.wouldScaleCount + discounted.long.wouldSettleCount
    ).toBe(1)
    expect(discounted.short.factor).toBe(1)
  })

  it('validates alpha and changes nothing about the state', () => {
    expect(() => evaluatePerpClaimAllowanceShadow(state, price, 1.5)).toThrow()
    expect(() =>
      evaluatePerpClaimAllowanceShadow(state, price, Number.NaN)
    ).toThrow()
    const frozen = JSON.stringify(state)
    evaluatePerpClaimAllowanceShadow(state, price, 0.5)
    expect(JSON.stringify(state)).toBe(frozen)
  })
})
