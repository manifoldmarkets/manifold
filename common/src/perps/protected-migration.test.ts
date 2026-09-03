import { liquidationPrice, PerpState } from './amm'
import { PerpDirection, PerpEvent, PerpPosition } from './position'
import { getPositionValue } from './amm'
import { getPerpAccountingSnapshot } from './protected-basis'
import {
  allocateLastResortReserveBasis,
  classifyPerpMigration,
  classifyPerpMigrationSide,
  perpActivationConfirmation,
  perpActivationFingerprint,
  perpActivationPlanDigest,
  perpActivationReductions,
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

  it('is refused when nobody is underwater at the mark: without paper losses the side is in the deficit class, never top-up', () => {
    // With every row at or above its cost basis, Rc = C, so B < C means
    // B < Rc: the deficit class, which the allocation refuses by name. A
    // top-up-class side with no paper loss cannot exist.
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
    expect(classifyPerpMigrationSide(state, 'long', 100).class).toBe('deficit')
    expect(() => allocateLastResortReserveBasis(state, 'long', 100)).toThrow(
      'top-up'
    )
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

describe('last-resort allocation with in-profit rows (review round 3)', () => {
  // Top-up class on the long side with one row underwater and one in
  // profit at the mark: the deficit lands on the loser only, and the
  // winner keeps b = c exactly (never b = V > c).
  const state: PerpState = {
    pool: { L: 1400, S: 500 },
    positions: [
      pos({
        userId: 'loser',
        direction: 'long',
        size: 1000,
        costBasis: 1000,
        entryPrice: 100,
      }),
      pos({
        userId: 'winner',
        direction: 'long',
        size: 500,
        costBasis: 500,
        entryPrice: 80,
      }),
    ],
  }

  it('never assigns b above c', () => {
    const allocation = allocateLastResortReserveBasis(state, 'long', 90)
    const winner = allocation.find((a) => a.userId === 'winner')!
    const loser = allocation.find((a) => a.userId === 'loser')!
    expect(winner.value).toBeGreaterThan(winner.costBasis)
    expect(winner.reserveBasis).toBe(winner.costBasis)
    expect(loser.reserveBasis).toBeCloseTo(1000 - 100, 9)
    expect(loser.reserveBasis).toBeGreaterThanOrEqual(loser.value)
  })

  it('plans cleanly and reports exactly the reduced rows as receipts', () => {
    const plan = planPerpProtectedActivation(state, 90, {
      topUp: { long: 0, short: 0 },
      allocation: 'last-resort-snapshot',
      allowActivationAdl: false,
    })
    expect(plan.ok).toBe(true)
    expect(plan.reducedAnyBasis).toBe(true)
    const reductions = perpActivationReductions(plan)
    expect(reductions.map((r) => r.userId)).toEqual(['loser'])
    expect(
      reductions[0].reserveBasisAfter - reductions[0].reserveBasisBefore
    ).toBeCloseTo(-100, 9)
    for (const a of plan.allocations)
      expect(a.reserveBasisAfter).toBeLessThanOrEqual(a.costBasis)
  })
})

describe('perpActivationFingerprint', () => {
  const state = book(1400)

  it('is deterministic and independent of row order', () => {
    const a = perpActivationFingerprint(state, 90)
    const reversed: PerpState = {
      pool: state.pool,
      positions: [...state.positions].reverse(),
    }
    expect(a).toMatch(/^[0-9a-f]{16}$/)
    expect(perpActivationFingerprint(state, 90)).toBe(a)
    expect(perpActivationFingerprint(reversed, 90)).toBe(a)
  })

  it('changes when the mark, a pool, a row or a protected basis changes — even at an identical mark', () => {
    const base = perpActivationFingerprint(state, 90)
    expect(perpActivationFingerprint(state, 90.0001)).not.toBe(base)
    expect(perpActivationFingerprint(book(1400.01), 90)).not.toBe(base)
    expect(
      perpActivationFingerprint(
        { pool: state.pool, positions: state.positions.slice(1) },
        90
      )
    ).not.toBe(base)
    expect(
      perpActivationFingerprint(
        {
          pool: state.pool,
          positions: state.positions.map((p, i) =>
            i === 0 ? { ...p, size: p.size - 1 } : p
          ),
        },
        90
      )
    ).not.toBe(base)
    expect(
      perpActivationFingerprint(
        {
          pool: state.pool,
          positions: state.positions.map((p, i) =>
            i === 0 ? { ...p, reserveBasis: p.costBasis - 1 } : p
          ),
        },
        90
      )
    ).not.toBe(base)
    // A closed (size 0) row does not count.
    expect(
      perpActivationFingerprint(
        {
          pool: state.pool,
          positions: [
            ...state.positions,
            pos({
              userId: 'gone',
              direction: 'short',
              size: 0,
              costBasis: 1,
              entryPrice: 100,
            }),
          ],
        },
        90
      )
    ).toBe(base)
  })
})

describe('activation plan digest and dust trim (review round 4)', () => {
  const lastResort = (topUp: number) => ({
    topUp: { long: topUp, short: 0 },
    allocation: 'last-resort-snapshot' as const,
    allowActivationAdl: false,
  })

  it('a different top-up on the same book is a different plan, even though the book fingerprint is identical', () => {
    const state = book(1400)
    const withTopUp = planPerpProtectedActivation(state, 90, lastResort(50))
    const without = planPerpProtectedActivation(state, 90, lastResort(0))
    expect(withTopUp.ok && without.ok).toBe(true)
    const haircut = (plan: typeof withTopUp) =>
      plan.allocations.reduce(
        (sum, a) => sum + (a.reserveBasisBefore - a.reserveBasisAfter),
        0
      )
    expect(haircut(withTopUp)).toBeCloseTo(50, 9)
    expect(haircut(without)).toBeCloseTo(100, 9)
    expect(perpActivationFingerprint(state, 90)).toBe(
      perpActivationFingerprint(state, 90)
    )
    const a = perpActivationPlanDigest(state, 90, lastResort(50), withTopUp)
    const b = perpActivationPlanDigest(state, 90, lastResort(0), without)
    expect(a).toMatch(/^[0-9a-f]{16}$/)
    expect(a).not.toBe(b)
    // Deterministic for the same inputs.
    expect(
      perpActivationPlanDigest(
        state,
        90,
        lastResort(50),
        planPerpProtectedActivation(state, 90, lastResort(50))
      )
    ).toBe(a)
  })

  it('policy inputs are part of the plan even when they change no outcome', () => {
    const state = book(1500)
    const options = {
      topUp: { long: 0, short: 0 },
      allocation: 'full-basis' as const,
      allowActivationAdl: false,
    }
    const plan = planPerpProtectedActivation(state, 90, options)
    const withAdl = { ...options, allowActivationAdl: true }
    const planWithAdl = planPerpProtectedActivation(state, 90, withAdl)
    expect(plan.activationAdl).toBeNull()
    expect(planWithAdl.activationAdl).toBeNull()
    expect(perpActivationPlanDigest(state, 90, options, plan)).not.toBe(
      perpActivationPlanDigest(state, 90, withAdl, planWithAdl)
    )
  })

  it('trims a dust reserve shortfall so the committed pools hold exactly Σb, and blocks a real one', () => {
    const flat = (pool: number): PerpState => ({
      pool: { L: pool, S: pool },
      positions: [
        pos({
          userId: 'l',
          direction: 'long',
          size: 1,
          costBasis: 1,
          entryPrice: 100,
        }),
        pos({
          userId: 's',
          direction: 'short',
          size: 1,
          costBasis: 1,
          entryPrice: 100,
        }),
      ],
    })
    const options = {
      topUp: { long: 0, short: 0 },
      allocation: 'full-basis' as const,
      allowActivationAdl: false,
    }
    const plan = planPerpProtectedActivation(flat(0.99999925), 100, options)
    expect(plan.ok).toBe(true)
    expect(plan.reducedAnyBasis).toBe(false)
    expect(plan.trims).toHaveLength(2)
    for (const trim of plan.trims) expect(trim.amount).toBeCloseTo(7.5e-7, 12)
    for (const side of ['long', 'short'] as const) {
      const reserved = plan.finalState.positions
        .filter((p) => p.direction === side)
        .reduce((sum, p) => sum + (p.reserveBasis ?? 0), 0)
      const pool =
        side === 'long' ? plan.finalState.pool.L : plan.finalState.pool.S
      expect(reserved).toBeLessThanOrEqual(pool)
    }
    expect(perpActivationReductions(plan)).toEqual([])

    const blocked = planPerpProtectedActivation(flat(0.9999), 100, options)
    expect(blocked.ok).toBe(false)
    expect(blocked.trims).toEqual([])
  })
})

describe('activation trim exactness, confirmation gate and downgrade tolerance (review round 5)', () => {
  const fullBasis = {
    topUp: { long: 0, short: 0 },
    allocation: 'full-basis' as const,
    allowActivationAdl: false,
  }

  it('re-sums after trimming so Σb never exceeds the pool in float, even on asymmetric multi-row sides', () => {
    const state: PerpState = {
      pool: { L: 4894.271539344855, S: 500 },
      positions: [
        pos({
          userId: 'a',
          direction: 'long',
          size: 2832.0008636021144,
          costBasis: 2832.0008636021144,
          entryPrice: 100,
        }),
        pos({
          userId: 'b',
          direction: 'long',
          size: 2062.270676445516,
          costBasis: 2062.270676445516,
          entryPrice: 100,
        }),
        pos({
          userId: 's',
          direction: 'short',
          size: 500,
          costBasis: 500,
          entryPrice: 100,
        }),
      ],
    }
    const plan = planPerpProtectedActivation(state, 100, fullBasis)
    expect(plan.ok).toBe(true)
    expect(plan.trims.length).toBeGreaterThan(0)
    const snapshot = getPerpAccountingSnapshot(plan.finalState, 100)
    expect(snapshot.long.reservedBasis).toBeLessThanOrEqual(
      plan.finalState.pool.L
    )
    expect(snapshot.short.reservedBasis).toBeLessThanOrEqual(
      plan.finalState.pool.S
    )
    // And across random dust shortfalls on two- to four-row sides.
    let seed = 11
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    for (let trial = 0; trial < 300; trial++) {
      const n = 2 + Math.floor(random() * 3)
      const rows = Array.from({ length: n }, (_, i) =>
        pos({
          userId: `u${i}`,
          direction: 'long',
          size: 1 + random() * 5000,
          costBasis: 1 + random() * 5000,
          entryPrice: 100,
        })
      ).map((p) => ({ ...p, size: p.costBasis }))
      const total = rows.reduce((sum, p) => sum + p.costBasis, 0)
      const book: PerpState = {
        pool: { L: total - random() * 9e-7, S: 0 },
        positions: rows,
      }
      const trial_plan = planPerpProtectedActivation(book, 100, fullBasis)
      expect(trial_plan.ok).toBe(true)
      const snap = getPerpAccountingSnapshot(trial_plan.finalState, 100)
      expect(snap.long.reservedBasis).toBeLessThanOrEqual(
        trial_plan.finalState.pool.L
      )
    }
  })

  it('gates exactly the plans the runbook says: reducing or stale need the reviewed digest, a fresh full-basis plan does not', () => {
    const state = book(1500)
    const plan = planPerpProtectedActivation(state, 90, fullBasis)
    const digest = perpActivationPlanDigest(state, 90, fullBasis, plan)
    expect(perpActivationConfirmation(fullBasis, plan, digest)).toEqual({
      required: null,
      matches: false,
    })
    expect(
      perpActivationConfirmation(
        { ...fullBasis, allowStaleMark: true },
        plan,
        digest
      ).required
    ).toBe('stale-mark')
    const lastResort = {
      ...fullBasis,
      allocation: 'last-resort-snapshot' as const,
    }
    const reducingPlan = planPerpProtectedActivation(book(1400), 90, lastResort)
    const reducingDigest = perpActivationPlanDigest(
      book(1400),
      90,
      lastResort,
      reducingPlan
    )
    expect(
      perpActivationConfirmation(lastResort, reducingPlan, reducingDigest)
    ).toEqual({ required: 'reducing', matches: false })
    expect(
      perpActivationConfirmation(
        { ...lastResort, confirmedPlan: reducingDigest },
        reducingPlan,
        reducingDigest
      )
    ).toEqual({ required: 'reducing', matches: true })
    expect(
      perpActivationConfirmation(
        { ...lastResort, confirmedPlan: digest },
        reducingPlan,
        reducingDigest
      ).matches
    ).toBe(false)
    // Any row left below c is reducing even under the full-basis policy.
    expect(
      perpActivationConfirmation(
        fullBasis,
        { ...plan, reducedAnyBasis: true },
        digest
      ).required
    ).toBe('reducing')
  })

  it('a dust-trimmed activation can still return to legacy: the verifier uses the same tolerance as the receipts', () => {
    const flat: PerpState = {
      pool: { L: 0.99999925, S: 0.99999925 },
      positions: [
        pos({
          userId: 'l',
          direction: 'long',
          size: 1,
          costBasis: 1,
          entryPrice: 100,
        }),
        pos({
          userId: 's',
          direction: 'short',
          size: 1,
          costBasis: 1,
          entryPrice: 100,
        }),
      ],
    }
    const plan = planPerpProtectedActivation(flat, 100, fullBasis)
    expect(plan.ok).toBe(true)
    expect(plan.trims).toHaveLength(2)
    const verdict = verifyPerpAccountingDowngrade({
      positions: plan.finalState.positions,
      eventsSinceActivation: [],
      activationReducedBasis: plan.reducedAnyBasis,
    })
    expect(verdict.allowed).toBe(true)
  })
})
