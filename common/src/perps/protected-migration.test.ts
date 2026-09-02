import { liquidationPrice, PerpState } from './amm'
import { PerpDirection, PerpEvent, PerpPosition } from './position'
import { getPositionValue } from './amm'
import {
  allocateLastResortReserveBasis,
  classifyPerpMigration,
  classifyPerpMigrationSide,
  planPerpProtectedActivation,
  verifyPerpAccountingDowngrade,
} from './protected-migration'

const pos = (
  overrides: Partial<PerpPosition> & {
    userId: string
    direction: PerpDirection
    size: number
    costBasis: number
    entryPrice: number
  }
): PerpPosition => {
  const leverage = overrides.size / overrides.costBasis
  return {
    contractId: 'c1',
    originalCostBasis: overrides.costBasis,
    takerFeeCostBasis: 0,
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

const book = (poolL: number): PerpState => ({
  pool: { L: poolL, S: 500 },
  positions: [
    // At 90: values 900 and 450; Rc = 1350, C = 1500.
    pos({
      userId: 'a',
      direction: 'long',
      size: 1000,
      costBasis: 1000,
      entryPrice: 100,
    }),
    pos({
      userId: 'b',
      direction: 'long',
      size: 500,
      costBasis: 500,
      entryPrice: 100,
    }),
  ],
})

describe('classifyPerpMigrationSide', () => {
  it('classifies covered, top-up and deficit with exact required top-ups', () => {
    expect(classifyPerpMigrationSide(book(1500), 'long', 90)).toMatchObject({
      class: 'covered',
      requiredTopUp: 0,
      costBasisTotal: 1500,
      currentClaims: 1350,
    })
    expect(classifyPerpMigrationSide(book(1400), 'long', 90)).toMatchObject({
      class: 'top-up',
      requiredTopUp: 100,
    })
    expect(classifyPerpMigrationSide(book(1200), 'long', 90)).toMatchObject({
      class: 'deficit',
      requiredTopUp: 300,
    })
    expect(classifyPerpMigration(book(1400), 90).requiredTopUp).toBe(100)
  })

  it('rejects a non-finite mark', () => {
    expect(() =>
      classifyPerpMigrationSide(book(1500), 'long', Number.NaN)
    ).toThrow()
  })
})

describe('allocateLastResortReserveBasis', () => {
  it('is refused outside the top-up class', () => {
    expect(() =>
      allocateLastResortReserveBasis(book(1500), 'long', 90)
    ).toThrow('top-up')
    expect(() =>
      allocateLastResortReserveBasis(book(1200), 'long', 90)
    ).toThrow('top-up')
  })

  it('assigns the deficit pro rata to paper losses and never below min(c, V) or, for reduced rows, V', () => {
    const state = book(1400)
    const allocation = allocateLastResortReserveBasis(state, 'long', 90)
    const total = allocation.reduce(
      (s, a) => s + (a.costBasis - a.reserveBasis),
      0
    )
    expect(total).toBeCloseTo(100, 9)
    for (const a of allocation) {
      const position = state.positions.find((p) => p.userId === a.userId)!
      expect(a.reserveBasis).toBeGreaterThanOrEqual(
        Math.min(a.costBasis, getPositionValue(position, 90)) - 1e-9
      )
      if (a.reserveBasis < a.costBasis)
        expect(a.reserveBasis).toBeGreaterThanOrEqual(a.value - 1e-9)
    }
    // Losses 100 and 50 share the 100 deficit 2:1.
    expect(allocation[0].reserveBasis).toBeCloseTo(1000 - 200 / 3, 9)
    expect(allocation[1].reserveBasis).toBeCloseTo(500 - 100 / 3, 9)
  })

  it('throws when nobody is underwater at the mark', () => {
    const state: PerpState = {
      pool: { L: 900, S: 0 },
      positions: [
        pos({
          userId: 'a',
          direction: 'long',
          size: 1000,
          costBasis: 1000,
          entryPrice: 100,
        }),
      ],
    }
    // At 100 the class is top-up-by-numbers (B < C) but Rc = C so the
    // decision tree says deficit... use a price where V = c exactly.
    expect(() => allocateLastResortReserveBasis(state, 'long', 100)).toThrow()
  })
})

describe('planPerpProtectedActivation', () => {
  const base = {
    topUp: { long: 0, short: 0 },
    allocation: 'full-basis' as const,
    allowActivationAdl: false,
  }

  it('activates a covered book with b = c', () => {
    const plan = planPerpProtectedActivation(book(1500), 90, base)
    expect(plan.ok).toBe(true)
    expect(plan.reducedAnyBasis).toBe(false)
    expect(plan.activationAdl).toBeNull()
    for (const p of plan.finalState.positions)
      expect(p.reserveBasis).toBe(p.costBasis)
  })

  it('blocks a top-up book without the top-up, and activates with it', () => {
    const blocked = planPerpProtectedActivation(book(1400), 90, base)
    expect(blocked.ok).toBe(false)
    expect(blocked.blockers[0]).toContain('top up 100')
    const funded = planPerpProtectedActivation(book(1400), 90, {
      ...base,
      topUp: { long: 100, short: 0 },
    })
    expect(funded.ok).toBe(true)
    expect(funded.finalState.pool.L).toBe(1500)
  })

  it('uses the last-resort allocation only when explicitly requested and records the reduction', () => {
    const plan = planPerpProtectedActivation(book(1400), 90, {
      ...base,
      allocation: 'last-resort-snapshot',
    })
    expect(plan.ok).toBe(true)
    expect(plan.reducedAnyBasis).toBe(true)
    expect(plan.allocations.map((a) => a.reserveBasisAfter)[0]).toBeCloseTo(
      1000 - 200 / 3,
      9
    )
    expect(plan.allocations.map((a) => a.reserveBasisAfter)[1]).toBeCloseTo(
      500 - 100 / 3,
      9
    )
  })

  it('never activates a deficit book without the full top-up', () => {
    const plan = planPerpProtectedActivation(book(1200), 90, {
      ...base,
      allocation: 'last-resort-snapshot',
    })
    expect(plan.ok).toBe(false)
    expect(plan.blockers.join(' ')).toContain('requires the full 300 top-up')
    const funded = planPerpProtectedActivation(book(1200), 90, {
      ...base,
      topUp: { long: 300, short: 0 },
    })
    expect(funded.ok).toBe(true)
  })

  it('requires approval for an activation ADL when the current-claim inequalities fail, then applies it', () => {
    // Longs deep in profit against a short side that cannot back them.
    const state: PerpState = {
      pool: { L: 1000, S: 50 },
      positions: [
        pos({
          userId: 'a',
          direction: 'long',
          size: 5000,
          costBasis: 1000,
          entryPrice: 100,
        }),
      ],
    }
    const refused = planPerpProtectedActivation(state, 110, base)
    expect(refused.ok).toBe(false)
    expect(refused.blockers.join(' ')).toContain('activation ADL required')
    const approved = planPerpProtectedActivation(state, 110, {
      ...base,
      allowActivationAdl: true,
    })
    expect(approved.ok).toBe(true)
    expect(approved.activationAdl?.adlFactorLong).toBeCloseTo(0.1, 9)
  })

  it('rejects non-finite inputs and an invalid mark', () => {
    expect(planPerpProtectedActivation(book(1500), 0, base).ok).toBe(false)
    expect(
      planPerpProtectedActivation(book(1500), 90, {
        ...base,
        topUp: { long: Number.NaN, short: 0 },
      }).ok
    ).toBe(false)
  })
})

describe('verifyPerpAccountingDowngrade', () => {
  const clean = pos({
    userId: 'a',
    direction: 'long',
    size: 1000,
    costBasis: 1000,
    entryPrice: 100,
    reserveBasis: 1000,
  })
  const event = (over: Partial<PerpEvent>): PerpEvent => ({
    id: 1,
    contractId: 'c1',
    userId: 'a',
    eventType: 'close',
    appliedTime: 1,
    ts: 1,
    oraclePrice: 100,
    sizeDelta: -1000,
    costBasisDelta: -1000,
    reserveBasisDelta: -1000,
    originalCostBasisDelta: -1000,
    direction: 'long',
    leverage: 0,
    ...over,
  })

  it('allows a downgrade when nothing diverged', () => {
    expect(
      verifyPerpAccountingDowngrade({
        positions: [clean],
        eventsSinceActivation: [
          event({}),
          event({ id: 2, eventType: 'accounting-activation', userId: null }),
        ],
        activationReducedBasis: false,
      })
    ).toEqual({ allowed: true, blockers: [] })
  })

  it('refuses after any b < c, basis settlement, partial close, divergent delta, or activation reduction', () => {
    const reduced = verifyPerpAccountingDowngrade({
      positions: [{ ...clean, reserveBasis: 999 }],
      eventsSinceActivation: [],
      activationReducedBasis: false,
    })
    expect(reduced.allowed).toBe(false)
    const settled = verifyPerpAccountingDowngrade({
      positions: [clean],
      eventsSinceActivation: [
        event({
          eventType: 'basis-settlement',
          sizeDelta: 0,
          costBasisDelta: 0,
          reserveBasisDelta: -5,
          originalCostBasisDelta: 0,
        }),
      ],
      activationReducedBasis: false,
    })
    expect(settled.blockers[0]).toContain('basis settlement')
    const partial = verifyPerpAccountingDowngrade({
      positions: [clean],
      eventsSinceActivation: [event({ data: { fraction: 0.5 } })],
      activationReducedBasis: false,
    })
    expect(partial.blockers[0]).toContain('partial close')
    const divergent = verifyPerpAccountingDowngrade({
      positions: [clean],
      eventsSinceActivation: [
        event({ eventType: 'adl', costBasisDelta: -10, reserveBasisDelta: 0 }),
      ],
      activationReducedBasis: false,
    })
    expect(divergent.blockers[0]).toContain('moved reserve basis')
    expect(
      verifyPerpAccountingDowngrade({
        positions: [],
        eventsSinceActivation: [],
        activationReducedBasis: true,
      }).allowed
    ).toBe(false)
  })
})
