import {
  applyADL,
  applyFunding,
  closePosition,
  getPositionValue,
  getUnrealizedEquity,
  liquidationPrice,
  openPosition,
  PerpState,
  processLiquidations,
} from './amm'
import { PerpDirection, PerpPosition } from './position'
import {
  applyPerpProtectedClaimAdl,
  applyPerpProtectedFunding,
  applyPerpProtectedOracleTransition,
  assertPerpProtectedState,
  canonicalPerpPositions,
  closePerpProtectedPosition,
  getPerpAccountingSnapshot,
  getPerpCrossSideDeficit,
  getPerpPositionClaims,
  getPerpSideAccounting,
  isPerpClaimBacked,
  maxPerpLiquidityWithdrawal,
  payPerpContingentClaim,
  perpClaimTolerance,
  perpDustTolerance,
  PERP_MIN_CLOSE_FRACTION,
  PerpProtectedInvariantError,
  resolvePerpProtectedBatch,
  settlePerpPaperLoss,
} from './protected-basis'

const M = 1_000_000

const pos = (
  overrides: Partial<PerpPosition> & {
    userId: string
    direction: PerpDirection
    size: number
    costBasis: number
    entryPrice: number
  }
): PerpPosition => {
  const leverage =
    overrides.costBasis > 0 ? overrides.size / overrides.costBasis : 0
  return {
    contractId: 'c1',
    originalCostBasis: overrides.costBasis,
    takerFeeCostBasis: 0,
    reserveBasis: overrides.reserveBasis ?? overrides.costBasis,
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

// Deterministic PRNG so a property failure is reproducible from its seed.
const rng = (seed: number) => {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const randomState = (random: () => number, price: number): PerpState => {
  const count = 1 + Math.floor(random() * 6)
  const positions: PerpPosition[] = []
  for (let i = 0; i < count; i++) {
    const direction: PerpDirection = random() < 0.5 ? 'long' : 'short'
    const costBasis = 10 + random() * 5000
    const leverage = 1 + random() * 20
    // Entries above and below the mark, some at the liquidation boundary.
    const move = (random() - 0.5) * 0.3
    const entryPrice = price * (1 + move)
    const reserveFraction = random() < 0.3 ? 1 : random()
    positions.push(
      pos({
        userId: `u${i}`,
        direction,
        size: costBasis * leverage,
        costBasis,
        entryPrice,
        reserveBasis: costBasis * reserveFraction,
      })
    )
  }
  // Pools cover Σb on each side, with some unreserved balance.
  const sum = (d: PerpDirection) =>
    positions
      .filter((p) => p.direction === d)
      .reduce((s, p) => s + (p.reserveBasis ?? p.costBasis), 0)
  return {
    pool: {
      L: sum('long') + random() * 5000,
      S: sum('short') + random() * 5000,
    },
    positions,
  }
}

const shuffle = <T>(items: T[], random: () => number) => {
  const copy = items.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const bySideTotals = (state: PerpState, price: number) =>
  getPerpAccountingSnapshot(state, price)

describe('claim decomposition', () => {
  it('satisfies V = R + E, b = R + D and B − R = H + D on randomized valid positions', () => {
    const random = rng(7)
    for (let trial = 0; trial < 300; trial++) {
      const price = 50 + random() * 100
      const state = randomState(random, price)
      for (const p of state.positions) {
        const claims = getPerpPositionClaims(p, price)
        expect(claims.own + claims.contingent).toBeCloseTo(claims.value, 9)
        expect(claims.own + claims.paperLoss).toBeCloseTo(
          claims.reserveBasis,
          9
        )
        expect(claims.own).toBeGreaterThanOrEqual(0)
        expect(claims.contingent).toBeGreaterThanOrEqual(0)
        expect(claims.paperLoss).toBeGreaterThanOrEqual(0)
      }
      for (const side of ['long', 'short'] as const) {
        const acc = getPerpSideAccounting(state, side, price)
        expect(acc.pool - acc.ownClaims).toBeCloseTo(
          acc.unreserved + acc.paperLosses,
          6
        )
        expect(acc.reservedBasis).toBeLessThanOrEqual(acc.costBasis + 1e-9)
      }
    }
  })

  it('handles zero bases and values at or near zero', () => {
    // A long wiped out by price: V floors at 0 so R = 0 and D = b.
    const wiped = pos({
      userId: 'u',
      direction: 'long',
      size: 1000,
      costBasis: 100,
      entryPrice: 100,
    })
    const claims = getPerpPositionClaims(wiped, 80)
    expect(claims.value).toBe(0)
    expect(claims.own).toBe(0)
    expect(claims.contingent).toBe(0)
    expect(claims.paperLoss).toBe(100)

    // b = 0: the whole value is contingent.
    const unprotected = pos({
      userId: 'u',
      direction: 'short',
      size: 1000,
      costBasis: 100,
      entryPrice: 100,
      reserveBasis: 0,
    })
    const c2 = getPerpPositionClaims(unprotected, 100)
    expect(c2.own).toBe(0)
    expect(c2.contingent).toBe(100)
    expect(c2.paperLoss).toBe(0)
  })

  it('reads a row without reserveBasis as the legacy mirror b = c', () => {
    const legacy = pos({
      userId: 'u',
      direction: 'long',
      size: 1000,
      costBasis: 100,
      entryPrice: 100,
    })
    delete (legacy as { reserveBasis?: number }).reserveBasis
    const claims = getPerpPositionClaims(legacy, 110)
    expect(claims.reserveBasis).toBe(100)
    expect(claims.own).toBe(100)
    expect(claims.contingent).toBeCloseTo(100, 9)
  })
})

describe('assertPerpProtectedState', () => {
  const healthy = (): PerpState => ({
    pool: { L: 1200, S: 1100 },
    positions: [
      pos({
        userId: 'a',
        direction: 'long',
        size: 1000,
        costBasis: 1000,
        entryPrice: 100,
        reserveBasis: 900,
      }),
      pos({
        userId: 'b',
        direction: 'short',
        size: 500,
        costBasis: 500,
        entryPrice: 100,
      }),
    ],
  })

  it('accepts a state that satisfies every invariant', () => {
    expect(() => assertPerpProtectedState(healthy(), 100)).not.toThrow()
  })

  it('rejects b > c, a missing b, and a pool below Σb', () => {
    const overBasis = healthy()
    overBasis.positions[0] = { ...overBasis.positions[0], reserveBasis: 1001 }
    expect(() => assertPerpProtectedState(overBasis, 100)).toThrow(
      'reserve basis exceeds its cost basis'
    )

    const missing = healthy()
    delete (missing.positions[0] as { reserveBasis?: number }).reserveBasis
    expect(() => assertPerpProtectedState(missing, 100)).toThrow(
      'has no protected basis'
    )

    const thin = healthy()
    thin.pool.L = 899
    expect(() => assertPerpProtectedState(thin, 100)).toThrow(
      'below its protected reserves'
    )
  })

  it('rejects contingent claims the opposing side cannot back', () => {
    // Long value 1000 + 100 = 1100 at 110 with b = 900: E = 200. Short side
    // has D = 50 (its 500 basis is now worth 450) and H = 1100 − 500 = 600,
    // so 650 backs it. Drain S to 520: H = 20, D = 50, cover 70 < 200.
    const state = healthy()
    expect(() => assertPerpProtectedState(state, 110)).not.toThrow()
    state.pool.S = 520
    let error: unknown
    try {
      assertPerpProtectedState(state, 110)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(PerpProtectedInvariantError)
    expect((error as PerpProtectedInvariantError).kind).toBe(
      'contingent-claims'
    )
  })
})

describe('just-in-time paper-loss settlement', () => {
  it('reduces the underwater side pro rata, never below current value, and consumes no H while D suffices', () => {
    const state: PerpState = {
      pool: { L: 3000, S: 1000 },
      positions: [
        // Underwater longs at 90: values 900 and 1800, paper losses 100 & 200.
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
          size: 2000,
          costBasis: 2000,
          entryPrice: 100,
        }),
        // A long in profit contributes no paper loss.
        pos({
          userId: 'c',
          direction: 'long',
          size: 500,
          costBasis: 500,
          entryPrice: 80,
        }),
      ],
    }
    const { state: after, settlement } = settlePerpPaperLoss(
      state,
      'long',
      150,
      90
    )
    expect(settlement.paperLoss).toBeCloseTo(300, 9)
    expect(settlement.settled).toBeCloseTo(150, 9)
    expect(settlement.unreservedConsumed).toBe(0)
    expect(settlement.allocations.map((a) => [a.userId, a.delta])).toEqual([
      ['a', 50],
      ['b', 100],
    ])
    const a = after.positions.find((p) => p.userId === 'a')!
    const b = after.positions.find((p) => p.userId === 'b')!
    const c = after.positions.find((p) => p.userId === 'c')!
    expect(a.reserveBasis).toBeCloseTo(950, 9)
    expect(b.reserveBasis).toBeCloseTo(1900, 9)
    expect(c.reserveBasis).toBe(500)
    // Everything else on the row is untouched.
    for (const [before, afterRow] of [
      [state.positions[0], a],
      [state.positions[1], b],
    ] as const) {
      expect(afterRow.size).toBe(before.size)
      expect(afterRow.costBasis).toBe(before.costBasis)
      expect(afterRow.entryPrice).toBe(before.entryPrice)
      expect(afterRow.leverage).toBe(before.leverage)
      expect(afterRow.liquidationPrice).toBe(before.liquidationPrice)
      expect(getPositionValue(afterRow, 90)).toBe(getPositionValue(before, 90))
    }
    // The pool is untouched by settlement itself; payment composes it.
    expect(after.pool).toEqual(state.pool)
  })

  it('caps the reduction at D and takes the remainder from H', () => {
    const state: PerpState = {
      pool: { L: 1500, S: 0 },
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
    const paid = payPerpContingentClaim(state, 'short', 250, 90)
    expect(paid.settlement.settled).toBeCloseTo(100, 9)
    expect(paid.settlement.unreservedConsumed).toBeCloseTo(150, 9)
    expect(paid.state.pool.L).toBeCloseTo(1250, 9)
    const a = paid.state.positions[0]
    expect(a.reserveBasis).toBeCloseTo(900, 9)
    expect(a.reserveBasis).toBeGreaterThanOrEqual(getPositionValue(a, 90))
  })

  it('performs no allocation when D = 0', () => {
    const state: PerpState = {
      pool: { L: 1500, S: 0 },
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
    const { settlement, state: after } = settlePerpPaperLoss(
      state,
      'long',
      100,
      110
    )
    expect(settlement.paperLoss).toBe(0)
    expect(settlement.settled).toBe(0)
    expect(settlement.unreservedConsumed).toBe(100)
    expect(settlement.allocations).toEqual([])
    expect(after.positions).toBe(state.positions)
  })

  it('fails closed when the unmatched remainder exceeds unreserved balance', () => {
    const state: PerpState = {
      pool: { L: 1000, S: 0 },
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
    // D = 100, H = 0: a 101 claim needs 1 of H that does not exist.
    expect(() => payPerpContingentClaim(state, 'short', 101, 90)).toThrow(
      'unreserved balance'
    )
    expect(() => settlePerpPaperLoss(state, 'long', Number.NaN, 90)).toThrow()
    expect(() => settlePerpPaperLoss(state, 'long', -1, 90)).toThrow()
    expect(() => settlePerpPaperLoss(state, 'long', 1, 0)).toThrow()
  })

  it('is tolerance-bounded under row reordering, account splitting and claim partitioning', () => {
    const random = rng(11)
    for (let trial = 0; trial < 100; trial++) {
      const price = 90
      const rows: PerpPosition[] = []
      const n = 2 + Math.floor(random() * 5)
      for (let i = 0; i < n; i++) {
        const costBasis = 100 + random() * 1000
        rows.push(
          pos({
            userId: `u${i}`,
            direction: 'long',
            size: costBasis * (1 + random() * 3),
            costBasis,
            entryPrice: 95 + random() * 20,
          })
        )
      }
      const sumB = rows.reduce((s, p) => s + p.costBasis, 0)
      const base: PerpState = { pool: { L: sumB + 500, S: 0 }, positions: rows }
      const D = getPerpSideAccounting(base, 'long', price).paperLosses
      const claim = Math.min(D * 0.8, D + 400) * random()

      const direct = settlePerpPaperLoss(base, 'long', claim, price)
      const reordered = settlePerpPaperLoss(
        { ...base, positions: shuffle(rows, random) },
        'long',
        claim,
        price
      )
      // Two partial claims that sum to the same total.
      const first = settlePerpPaperLoss(base, 'long', claim * 0.3, price)
      const second = settlePerpPaperLoss(
        first.state,
        'long',
        claim * 0.7,
        price
      )
      // Account splitting: one holder's row split into two half-size rows.
      const split: PerpPosition[] = rows.flatMap((p, i) =>
        i === 0
          ? [
              pos({
                ...p,
                userId: `${p.userId}-x`,
                size: p.size / 2,
                costBasis: p.costBasis / 2,
                reserveBasis: (p.reserveBasis ?? p.costBasis) / 2,
                originalCostBasis: p.originalCostBasis / 2,
              }),
              pos({
                ...p,
                userId: `${p.userId}-y`,
                size: p.size / 2,
                costBasis: p.costBasis / 2,
                reserveBasis: (p.reserveBasis ?? p.costBasis) / 2,
                originalCostBasis: p.originalCostBasis / 2,
              }),
            ]
          : [p]
      )
      const splitResult = settlePerpPaperLoss(
        { ...base, positions: split },
        'long',
        claim,
        price
      )

      const tolerance = 1e-6
      const total = (s: { settlement: { settled: number } }) =>
        s.settlement.settled
      expect(Math.abs(total(direct) - total(reordered))).toBeLessThanOrEqual(
        tolerance
      )
      expect(
        Math.abs(
          total(direct) - (first.settlement.settled + second.settlement.settled)
        )
      ).toBeLessThanOrEqual(tolerance)
      expect(Math.abs(total(direct) - total(splitResult))).toBeLessThanOrEqual(
        tolerance
      )

      for (const p of direct.state.positions) {
        const other = reordered.state.positions.find(
          (q) => q.userId === p.userId
        )!
        expect(
          Math.abs((p.reserveBasis ?? 0) - (other.reserveBasis ?? 0))
        ).toBeLessThanOrEqual(tolerance)
        const twice = second.state.positions.find((q) => q.userId === p.userId)!
        expect(
          Math.abs((p.reserveBasis ?? 0) - (twice.reserveBasis ?? 0))
        ).toBeLessThanOrEqual(tolerance)
        expect(p.reserveBasis).toBeGreaterThanOrEqual(
          getPositionValue(p, price) - 1e-9
        )
        if (p.userId === 'u0') {
          const halves = splitResult.state.positions.filter((q) =>
            q.userId.startsWith('u0-')
          )
          const combined = halves.reduce((s, q) => s + (q.reserveBasis ?? 0), 0)
          expect(
            Math.abs(combined - (p.reserveBasis ?? 0))
          ).toBeLessThanOrEqual(tolerance)
        }
      }
      // Allocations sum to the settled total.
      const allocated = direct.settlement.allocations.reduce(
        (s, a) => s + a.delta,
        0
      )
      expect(
        Math.abs(allocated - direct.settlement.settled)
      ).toBeLessThanOrEqual(perpDustTolerance(claim, D))
    }
  })
})

describe('generalized claim ADL', () => {
  it('reduces to the paper formula (q scaled, c unchanged) at b = c', () => {
    const state: PerpState = {
      pool: { L: 1000, S: 300 },
      positions: [
        pos({
          userId: 'a',
          direction: 'long',
          size: 5000,
          costBasis: 1000,
          entryPrice: 100,
        }),
        pos({
          userId: 'b',
          direction: 'short',
          size: 1000,
          costBasis: 200,
          entryPrice: 100,
        }),
      ],
    }
    const price = 110
    const legacy = applyADL(state, price)
    const protectedAdl = applyPerpProtectedClaimAdl(state, price)
    expect(legacy.crossSideTransfer).toBe(0)
    expect(protectedAdl.adlFactorLong).toBeCloseTo(legacy.adlFactorLong, 12)
    expect(protectedAdl.adlFactorShort).toBe(legacy.adlFactorShort)
    const a = protectedAdl.state.positions.find((p) => p.userId === 'a')!
    const la = legacy.state.positions.find((p) => p.userId === 'a')!
    expect(a.size).toBeCloseTo(la.size, 9)
    expect(a.costBasis).toBeCloseTo(la.costBasis, 9)
    expect(a.reserveBasis).toBe(1000)
    expect(protectedAdl.state.pool).toEqual(legacy.state.pool)
  })

  it('maps E to s·E and targets value above b, not merely positive price PnL', () => {
    // Long 10% underwater by price (V = 900 < c = 1000) but above b = 800:
    // E = 100 even though π < 0. Only 40 of backing exists.
    const state: PerpState = {
      pool: { L: 800, S: 40 },
      positions: [
        pos({
          userId: 'a',
          direction: 'long',
          size: 1000,
          costBasis: 1000,
          entryPrice: 100,
          reserveBasis: 800,
        }),
      ],
    }
    const price = 90
    expect(getUnrealizedEquity(state.positions[0], price)).toBeLessThan(0)
    const result = applyPerpProtectedClaimAdl(state, price)
    expect(result.adlFactorLong).toBeCloseTo(0.4, 12)
    const a = result.state.positions[0]
    const claims = getPerpPositionClaims(a, price)
    expect(claims.contingent).toBeCloseTo(40, 9)
    expect(a.size).toBeCloseTo(400, 9)
    expect(a.costBasis).toBeCloseTo(800 + 0.4 * 200, 9)
    expect(a.reserveBasis).toBe(800)
    expect(a.entryPrice).toBe(100)
    expect(a.originalCostBasis).toBe(1000)
    expect(a.leverage).toBeCloseTo(a.size / a.costBasis, 12)
    expect(a.liquidationPrice).toBeCloseTo(
      liquidationPrice('long', 100, a.leverage),
      12
    )
    expect(result.contingentReduced.long).toBeCloseTo(60, 9)
    expect(() => assertPerpProtectedState(result.state, price)).not.toThrow()
  })

  it('at factor zero pays the protected basis once and removes the row', () => {
    const state: PerpState = {
      pool: { L: 800, S: 0 },
      positions: [
        pos({
          userId: 'a',
          direction: 'long',
          size: 1000,
          costBasis: 1000,
          entryPrice: 100,
          reserveBasis: 800,
          takerFeeCostBasis: 5,
        }),
      ],
    }
    const result = applyPerpProtectedClaimAdl(state, 90)
    expect(result.adlFactorLong).toBe(0)
    expect(result.settled).toHaveLength(1)
    expect(result.settled[0].payout).toBe(800)
    expect(result.settled[0].position.takerFeeCostBasis).toBe(5)
    expect(result.state.positions).toHaveLength(0)
    expect(result.state.pool.L).toBe(0)
  })

  it('leaves positions with no contingent claim alone', () => {
    const state: PerpState = {
      pool: { L: 1000, S: 0 },
      positions: [
        pos({
          userId: 'a',
          direction: 'long',
          size: 1000,
          costBasis: 1000,
          entryPrice: 100,
          reserveBasis: 950,
        }),
      ],
    }
    // V = 900 < b = 950: D = 50, E = 0 → nothing to ADL even with S empty.
    const result = applyPerpProtectedClaimAdl(state, 90)
    expect(result.adlFactorLong).toBe(1)
    expect(result.state.positions[0]).toEqual(state.positions[0])
  })
})

describe('worked counterparty-exit scenario (five M$1m shorts vs one M$5m long)', () => {
  const scenario = (): PerpState => ({
    pool: { L: 5 * M, S: 5 * M + 20_000 },
    positions: [
      pos({
        userId: 'long',
        direction: 'long',
        size: 5 * M,
        costBasis: 5 * M,
        entryPrice: 100,
      }),
      ...[1, 2, 3, 4, 5].map((i) =>
        pos({
          userId: `short${i}`,
          direction: 'short',
          size: M,
          costBasis: M,
          entryPrice: 100,
        })
      ),
    ],
  })

  it('reduces the long aggregate b to M$4.95m while preserving q, c, Pe and value; the exit does not scale the long', () => {
    let state = scenario()
    const price = 99
    expect(() => assertPerpProtectedState(state, price)).not.toThrow()
    let paidToShorts = 0
    for (let i = 1; i <= 5; i++) {
      const close = closePerpProtectedPosition(
        state,
        { userId: `short${i}`, direction: 'short' },
        price
      )
      paidToShorts += close.payout
      expect(close.ownPayout).toBeCloseTo(M, 6)
      expect(close.contingentPayout).toBeCloseTo(10_000, 6)
      expect(close.settlement?.unreservedConsumed).toBeCloseTo(0, 6)
      state = close.state
      expect(() => assertPerpProtectedState(state, price)).not.toThrow()
    }
    expect(paidToShorts).toBeCloseTo(5 * M + 50_000, 6)
    const long = state.positions.find((p) => p.userId === 'long')!
    expect(state.positions).toHaveLength(1)
    expect(long.reserveBasis).toBeCloseTo(4.95 * M, 6)
    expect(long.size).toBe(5 * M)
    expect(long.costBasis).toBe(5 * M)
    expect(long.entryPrice).toBe(100)
    expect(long.leverage).toBe(1)
    expect(getPositionValue(long, price)).toBeCloseTo(4.95 * M, 6)
    expect(state.pool.L).toBeCloseTo(4.95 * M, 6)
    expect(state.pool.S).toBeCloseTo(20_000, 6)
    // Nothing force-closed or scaled the long on the counterparty exit.
    const transition = applyPerpProtectedOracleTransition(state, price)
    expect(transition.adlFactorLong).toBe(1)
    expect(transition.liquidated).toHaveLength(0)
  })

  it('later recovery above M$4.95m is contingent and claim ADL limits it to then-available backing', () => {
    let state = scenario()
    for (let i = 1; i <= 5; i++)
      state = closePerpProtectedPosition(
        state,
        { userId: `short${i}`, direction: 'short' },
        99
      ).state
    // Mark recovers to 100: V = 5m, E = 50k, but only S = 20k of backing.
    const recovered = applyPerpProtectedOracleTransition(state, 100)
    expect(recovered.adlFactorLong).toBeCloseTo(0.4, 12)
    const long = recovered.state.positions[0]
    expect(long.size).toBeCloseTo(2 * M, 6)
    expect(long.reserveBasis).toBeCloseTo(4.95 * M, 6)
    expect(long.costBasis).toBeCloseTo(4.95 * M + 0.4 * 50_000, 6)
    expect(getPerpPositionClaims(long, 100).contingent).toBeCloseTo(20_000, 6)
    expect(long.originalCostBasis).toBe(5 * M)

    // New opposing paper loss raises backing for the surviving claim and
    // lowers the next ADL, without restoring q or c already removed.
    const withShort: PerpState = {
      pool: { L: recovered.state.pool.L, S: recovered.state.pool.S + 100_000 },
      positions: [
        ...recovered.state.positions,
        pos({
          userId: 'newshort',
          direction: 'short',
          size: M,
          costBasis: 100_000,
          entryPrice: 100,
        }),
      ],
    }
    const price = 101
    const withBacking = applyPerpProtectedOracleTransition(withShort, price)
    const withoutBacking = applyPerpProtectedOracleTransition(
      { pool: recovered.state.pool, positions: recovered.state.positions },
      price
    )
    expect(withBacking.adlFactorLong).toBeGreaterThan(
      withoutBacking.adlFactorLong
    )
    expect(withBacking.adlFactorLong).toBeCloseTo(0.75, 9)
    const survivor = withBacking.state.positions.find(
      (p) => p.userId === 'long'
    )!
    expect(survivor.size).toBeLessThanOrEqual(2 * M + 1e-6)
  })
})

describe('unified full / partial close', () => {
  it('closes a b < V < c position through both pools although its price PnL is negative', () => {
    // The short is in profit at 95 (no paper loss), so its side backs the
    // long's contingent 50 purely from its 100 of unreserved balance.
    const state: PerpState = {
      pool: { L: 1000, S: 600 },
      positions: [
        pos({
          userId: 'a',
          direction: 'long',
          size: 1000,
          costBasis: 1000,
          entryPrice: 100,
          reserveBasis: 900,
        }),
        pos({
          userId: 'b',
          direction: 'short',
          size: 500,
          costBasis: 500,
          entryPrice: 100,
        }),
      ],
    }
    const price = 95
    expect(getUnrealizedEquity(state.positions[0], price)).toBeCloseTo(-50, 9)
    expect(() => assertPerpProtectedState(state, price)).not.toThrow()
    const close = closePerpProtectedPosition(
      state,
      { userId: 'a', direction: 'long' },
      price
    )
    expect(close.payout).toBeCloseTo(950, 9)
    expect(close.ownPayout).toBeCloseTo(900, 9)
    expect(close.contingentPayout).toBeCloseTo(50, 9)
    expect(close.state.pool.L).toBeCloseTo(100, 9)
    expect(close.state.pool.S).toBeCloseTo(550, 9)
    expect(close.pricePnl).toBeCloseTo(-50, 9)
    expect(close.remainingPosition).toBeNull()
    // The short is in profit at 95 (D = 0), so the whole 50 came from H.
    expect(close.settlement?.settled).toBe(0)
    expect(close.settlement?.unreservedConsumed).toBeCloseTo(50, 9)
  })

  it('partial close scales q, c, b, original and fee bases by 1 − z and conserves pools plus payout', () => {
    const state: PerpState = {
      pool: { L: 1200, S: 700 },
      positions: [
        pos({
          userId: 'a',
          direction: 'long',
          size: 2000,
          costBasis: 1000,
          entryPrice: 100,
          reserveBasis: 950,
          takerFeeCostBasis: 4,
        }),
        pos({
          userId: 'b',
          direction: 'short',
          size: 500,
          costBasis: 500,
          entryPrice: 100,
        }),
      ],
    }
    const price = 105
    const before = state.pool.L + state.pool.S
    const close = closePerpProtectedPosition(
      state,
      { userId: 'a', direction: 'long' },
      price,
      0.25,
      123
    )
    const kept = close.remainingPosition!
    expect(kept.size).toBeCloseTo(1500, 9)
    expect(kept.costBasis).toBeCloseTo(750, 9)
    expect(kept.reserveBasis).toBeCloseTo(712.5, 9)
    expect(kept.originalCostBasis).toBeCloseTo(750, 9)
    expect(kept.takerFeeCostBasis).toBeCloseTo(3, 9)
    expect(kept.leverage).toBeCloseTo(2, 12)
    expect(kept.entryPrice).toBe(100)
    expect(kept.liquidationPrice).toBeCloseTo(
      state.positions[0].liquidationPrice,
      12
    )
    expect(kept.updatedTime).toBe(123)
    expect(close.closedSize).toBeCloseTo(500, 9)
    expect(close.closedOriginalCostBasis).toBeCloseTo(250, 9)
    expect(close.closedTakerFeeCostBasis).toBeCloseTo(1, 9)
    const after = close.state.pool.L + close.state.pool.S
    expect(before - after).toBeCloseTo(close.payout, 6)
    expect(close.payout).toBeCloseTo(0.25 * 1100, 9)
    expect(() => assertPerpProtectedState(close.state, price)).not.toThrow()
  })

  it('agrees with the legacy close at b = c for both signs of PnL', () => {
    for (const price of [90, 110]) {
      const state: PerpState = {
        pool: { L: 2000, S: 2000 },
        positions: [
          pos({
            userId: 'a',
            direction: 'long',
            size: 3000,
            costBasis: 1000,
            entryPrice: 100,
          }),
          pos({
            userId: 'b',
            direction: 'short',
            size: 500,
            costBasis: 500,
            entryPrice: 100,
          }),
        ],
      }
      const legacy = closePosition(state, state.positions[0], price)
      const protectedClose = closePerpProtectedPosition(
        state,
        { userId: 'a', direction: 'long' },
        price
      )
      expect(protectedClose.payout).toBeCloseTo(legacy.payout, 9)
      expect(protectedClose.state.pool.L).toBeCloseTo(legacy.state.pool.L, 9)
      expect(protectedClose.state.pool.S).toBeCloseTo(legacy.state.pool.S, 9)
      expect(protectedClose.pricePnl).toBeCloseTo(legacy.pnl, 9)
    }
  })

  it('fails closed on an invalid fraction, price, or missing position', () => {
    const state: PerpState = {
      pool: { L: 1000, S: 0 },
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
    for (const fraction of [0, -0.5, 1.5, Number.NaN, Number.POSITIVE_INFINITY])
      expect(() =>
        closePerpProtectedPosition(
          state,
          { userId: 'a', direction: 'long' },
          100,
          fraction
        )
      ).toThrow()
    expect(() =>
      closePerpProtectedPosition(
        state,
        { userId: 'a', direction: 'long' },
        Number.NaN
      )
    ).toThrow()
    expect(() =>
      closePerpProtectedPosition(
        state,
        { userId: 'zz', direction: 'long' },
        100
      )
    ).toThrow()
  })
})

describe('funding, liquidation and open/add with protected basis', () => {
  it('scales b with q and c and preserves the invariants across randomized states', () => {
    const random = rng(23)
    for (let trial = 0; trial < 200; trial++) {
      const price = 100
      const state = randomState(random, price)
      // Only states that are protected-valid to begin with.
      try {
        assertPerpProtectedState(state, price)
      } catch {
        continue
      }
      const rate = (random() - 0.5) * 0.04
      const result = applyPerpProtectedFunding(state, rate, price)
      for (const before of state.positions) {
        const funded = result.fundedState.positions.find(
          (p) => p.userId === before.userId
        )!
        const factor = funded.size / before.size
        expect(funded.costBasis / before.costBasis).toBeCloseTo(factor, 9)
        expect(
          (funded.reserveBasis ?? 0) / (before.reserveBasis ?? 1)
        ).toBeCloseTo(before.reserveBasis ? factor : 0, 9)
      }
      expect(() => assertPerpProtectedState(result.state, price)).not.toThrow()
      expect(result.state.pool.L + result.state.pool.S).toBeLessThanOrEqual(
        state.pool.L + state.pool.S + 1e-6
      )
    }
  })

  it('rejects non-finite or out-of-range funding rates', () => {
    const state: PerpState = { pool: { L: 100, S: 100 }, positions: [] }
    expect(() => applyPerpProtectedFunding(state, Number.NaN, 100)).toThrow()
    expect(() => applyPerpProtectedFunding(state, 1, 100)).toThrow()
    expect(() => applyPerpProtectedFunding(state, -1, 100)).toThrow()
  })

  it('applyFunding scales reserveBasis by the same factor as size and cost basis', () => {
    const state: PerpState = {
      pool: { L: 1000, S: 500 },
      positions: [
        pos({
          userId: 'a',
          direction: 'long',
          size: 1000,
          costBasis: 1000,
          entryPrice: 100,
          reserveBasis: 900,
        }),
        pos({
          userId: 'b',
          direction: 'short',
          size: 500,
          costBasis: 500,
          entryPrice: 100,
          reserveBasis: 400,
        }),
      ],
    }
    const funded = applyFunding(state, 0.01)
    const a = funded.positions[0]
    const b = funded.positions[1]
    expect(a.reserveBasis).toBeCloseTo(900 * 0.99, 12)
    expect(a.costBasis).toBeCloseTo(990, 12)
    expect(b.reserveBasis).toBeCloseTo(400 * (1 + 10 / 500), 12)
  })

  it('liquidation removes b along with q and c; the margin becomes unreserved balance', () => {
    const state: PerpState = {
      pool: { L: 1000, S: 0 },
      positions: [
        pos({
          userId: 'a',
          direction: 'long',
          size: 10_000,
          costBasis: 1000,
          entryPrice: 100,
          reserveBasis: 900,
        }),
      ],
    }
    const liquidated = processLiquidations(state, 89)
    expect(liquidated.liquidated).toHaveLength(1)
    expect(liquidated.state.positions[0].reserveBasis).toBe(0)
    expect(getPerpSideAccounting(liquidated.state, 'long', 89).unreserved).toBe(
      1000
    )
  })

  it('open and add raise b by exactly the new margin, keeping 0 <= b <= c', () => {
    const state: PerpState = {
      pool: { L: 1000, S: 0 },
      positions: [
        pos({
          userId: 'a',
          direction: 'long',
          size: 1000,
          costBasis: 1000,
          entryPrice: 100,
          reserveBasis: 900,
        }),
      ],
    }
    const added = openPosition(
      state,
      'a',
      'c1',
      'long',
      500,
      2,
      110,
      state.positions[0],
      1
    )
    expect(added.position.reserveBasis).toBeCloseTo(1400, 12)
    expect(added.position.costBasis).toBe(1500)
    const fresh = openPosition(
      state,
      'z',
      'c1',
      'short',
      250,
      4,
      110,
      undefined,
      1
    )
    expect(fresh.position.reserveBasis).toBe(250)
    expect(fresh.position.costBasis).toBe(250)
  })
})

describe('batch resolution', () => {
  const build = (random: () => number, price: number) => {
    const state = randomState(random, price)
    try {
      assertPerpProtectedState(state, price)
      return state
    } catch {
      return null
    }
  }

  it('is order independent within tolerance and conserves pools plus payouts', () => {
    const random = rng(41)
    let checked = 0
    for (let trial = 0; trial < 200 && checked < 60; trial++) {
      const price = 80 + random() * 40
      const state = build(random, price)
      if (!state) continue
      checked += 1
      const a = resolvePerpProtectedBatch(state, price)
      const b = resolvePerpProtectedBatch(
        { pool: state.pool, positions: shuffle(state.positions, random) },
        price
      )
      const totalA = a.payouts.reduce((s, p) => s + p.payout, 0)
      const totalB = b.payouts.reduce((s, p) => s + p.payout, 0)
      expect(Math.abs(totalA - totalB)).toBeLessThanOrEqual(1e-6)
      expect(Math.abs(a.residual - b.residual)).toBeLessThanOrEqual(1e-6)
      expect(totalA + a.residual).toBeCloseTo(state.pool.L + state.pool.S, 6)
      for (const payout of a.payouts) {
        const other = b.payouts.find(
          (q) => q.position.userId === payout.position.userId
        )!
        expect(Math.abs(payout.payout - other.payout)).toBeLessThanOrEqual(1e-6)
        expect(payout.payout).toBeCloseTo(
          getPositionValue(payout.position, price),
          9
        )
      }
      expect(a.state.pool.L).toBeGreaterThanOrEqual(0)
      expect(a.state.pool.S).toBeGreaterThanOrEqual(0)
    }
    expect(checked).toBeGreaterThan(20)
  })

  it('matches sequential protected closes at one immutable mark', () => {
    const random = rng(43)
    let checked = 0
    for (let trial = 0; trial < 200 && checked < 40; trial++) {
      const price = 80 + random() * 40
      const state = build(random, price)
      if (!state) continue
      checked += 1
      const batch = resolvePerpProtectedBatch(state, price)
      let running = state
      let sequential = 0
      for (const p of canonicalPerpPositions(state.positions)) {
        const close = closePerpProtectedPosition(running, p, price)
        running = close.state
        sequential += close.payout
      }
      const total = batch.payouts.reduce((s, p) => s + p.payout, 0)
      expect(Math.abs(total - sequential)).toBeLessThanOrEqual(1e-6)
      expect(
        Math.abs(batch.residual - (running.pool.L + running.pool.S))
      ).toBeLessThanOrEqual(1e-6)
    }
    expect(checked).toBeGreaterThan(10)
  })

  it('refuses a state that violates the invariants', () => {
    const state: PerpState = {
      pool: { L: 100, S: 0 },
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
    expect(() => resolvePerpProtectedBatch(state, 100)).toThrow()
  })
})

describe('protected oracle transition', () => {
  it('halts on a book legacy ADL would repair by cross-side transfer', () => {
    const wedged: PerpState = {
      pool: { L: 100, S: 1000 },
      positions: [
        pos({
          userId: 'a',
          direction: 'long',
          size: 1000,
          costBasis: 200,
          entryPrice: 100,
        }),
        pos({
          userId: 'b',
          direction: 'short',
          size: 100,
          costBasis: 10,
          entryPrice: 100,
        }),
      ],
    }
    expect(getPerpCrossSideDeficit(wedged, 110).long).toBeCloseTo(100, 9)
    let error: unknown
    try {
      applyPerpProtectedOracleTransition(wedged, 110)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(PerpProtectedInvariantError)
    expect((error as PerpProtectedInvariantError).kind).toBe(
      'cross-side-transfer'
    )
  })

  it('liquidates, then claim-ADLs, and returns a valid state', () => {
    const state: PerpState = {
      pool: { L: 1100, S: 50 },
      positions: [
        pos({
          userId: 'a',
          direction: 'long',
          size: 5000,
          costBasis: 1000,
          entryPrice: 100,
        }),
        pos({
          userId: 'b',
          direction: 'short',
          size: 2000,
          costBasis: 100,
          entryPrice: 100,
        }),
      ],
    }
    // 106: the 20x short liquidates (liq price 105). Its 100 of margin was
    // already in S, so forfeiting it turns reserved balance into unreserved:
    // H_short = 50, D_short = 0, and the long's 300 of E gets factor 1/6.
    const result = applyPerpProtectedOracleTransition(state, 106)
    expect(result.liquidated.map((p) => p.userId)).toEqual(['b'])
    expect(result.adlFactorLong).toBeCloseTo(50 / 300, 9)
    expect(
      getPerpSideAccounting(result.state, 'short', 106).unreserved
    ).toBeCloseTo(50, 9)
    expect(() => assertPerpProtectedState(result.state, 106)).not.toThrow()
  })

  it('fails closed on NaN, infinity and negative inputs without touching state', () => {
    const state: PerpState = {
      pool: { L: 1000, S: 1000 },
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
    expect(() =>
      applyPerpProtectedOracleTransition(state, Number.NaN)
    ).toThrow()
    expect(() => applyPerpProtectedOracleTransition(state, -1)).toThrow()
    expect(() =>
      applyPerpProtectedOracleTransition(
        {
          ...state,
          positions: [
            { ...state.positions[0], reserveBasis: Number.POSITIVE_INFINITY },
          ],
        },
        100
      )
    ).toThrow()
    expect(() =>
      applyPerpProtectedOracleTransition(
        { ...state, positions: [{ ...state.positions[0], reserveBasis: -1 }] },
        100
      )
    ).toThrow()
    expect(state.positions[0].reserveBasis).toBe(1000)
  })
})

describe('liquidity withdrawal bound', () => {
  it('keeps B >= Σb and the opposing contingent claims backed', () => {
    const state: PerpState = {
      pool: { L: 1500, S: 800 },
      positions: [
        pos({
          userId: 'a',
          direction: 'long',
          size: 1000,
          costBasis: 1000,
          entryPrice: 100,
        }),
        pos({
          userId: 'b',
          direction: 'short',
          size: 500,
          costBasis: 500,
          entryPrice: 100,
        }),
      ],
    }
    // At 110 the long has E = 100 against S: D_short = 50, H_short = 300.
    expect(maxPerpLiquidityWithdrawal(state, 'short', 110)).toBeCloseTo(250, 9)
    expect(maxPerpLiquidityWithdrawal(state, 'long', 110)).toBeCloseTo(500, 9)
    const clipped: PerpState = { ...state, pool: { L: 1500, S: 550 } }
    expect(() => assertPerpProtectedState(clipped, 110)).not.toThrow()
  })
})

describe('snapshot diagnostics', () => {
  it('counts reduced-basis rows and the aggregate c − b', () => {
    const state: PerpState = {
      pool: { L: 3000, S: 0 },
      positions: [
        pos({
          userId: 'a',
          direction: 'long',
          size: 1000,
          costBasis: 1000,
          entryPrice: 100,
          reserveBasis: 900,
        }),
        pos({
          userId: 'b',
          direction: 'long',
          size: 1000,
          costBasis: 1000,
          entryPrice: 100,
        }),
      ],
    }
    const snap = bySideTotals(state, 100)
    expect(snap.long.reducedBasisCount).toBe(1)
    expect(snap.long.basisDeficit).toBeCloseTo(100, 9)
    expect(snap.long.unreserved).toBeCloseTo(1100, 9)
  })
})

describe('one affordability predicate for invariant, ADL, payment and debit', () => {
  it('a state the invariant accepts at M$5m scale can always be closed in full (review P1-2)', () => {
    // E = 5,000,000 of contingent claim against 4,999,999.9999995 of backing:
    // inside the relative tolerance, so the invariant accepts it. The close
    // must then be payable under the SAME rule, and the pool must land on 0.
    const state: PerpState = {
      pool: { L: 0, S: 4_999_999.9999995 },
      positions: [
        pos({
          userId: 'a',
          direction: 'long',
          size: 5 * M,
          costBasis: 5 * M,
          entryPrice: 100,
          reserveBasis: 0,
        }),
      ],
    }
    expect(() => assertPerpProtectedState(state, 100)).not.toThrow()
    const close = closePerpProtectedPosition(
      state,
      { userId: 'a', direction: 'long' },
      100
    )
    expect(close.payout).toBeCloseTo(5 * M, 6)
    expect(close.contingentPayout).toBeCloseTo(5 * M, 6)
    expect(close.state.pool.S).toBe(0)
    expect(close.state.positions).toHaveLength(0)
    // The same is true through resolution and through a fractional close.
    expect(resolvePerpProtectedBatch(state, 100).state.pool.S).toBe(0)
    expect(() =>
      closePerpProtectedPosition(
        state,
        { userId: 'a', direction: 'long' },
        100,
        0.5
      )
    ).not.toThrow()
  })

  it('is one rule: the predicate and the tolerance agree with each other and scale with the basis', () => {
    expect(isPerpClaimBacked(100, 100)).toBe(true)
    expect(isPerpClaimBacked(100 + perpClaimTolerance(100, 100), 100)).toBe(
      true
    )
    expect(isPerpClaimBacked(100 + 2 * perpClaimTolerance(100, 100), 100)).toBe(
      false
    )
    expect(perpClaimTolerance(1e-9, 1e-9, 1e6)).toBeGreaterThan(
      perpClaimTolerance(1e-9, 1e-9)
    )
    expect(isPerpClaimBacked(Number.NaN, 1)).toBe(false)
    expect(isPerpClaimBacked(1, Number.POSITIVE_INFINITY)).toBe(false)
  })

  it('rejects a genuine shortfall at the same scale', () => {
    const state: PerpState = {
      pool: { L: 0, S: 4_999_999.99 },
      positions: [
        pos({
          userId: 'a',
          direction: 'long',
          size: 5 * M,
          costBasis: 5 * M,
          entryPrice: 100,
          reserveBasis: 0,
        }),
      ],
    }
    expect(() => assertPerpProtectedState(state, 100)).toThrow('exceed')
  })
})

describe('claim ADL representability (review P1-3)', () => {
  it('snaps a dust allowance against a large basis to factor zero instead of a rounding overshoot', () => {
    // b = c = 1,000,000 long worth 1,100,000 (E = 100,000) with only 5e-10 of
    // backing. s ≈ 5e-15 cannot be represented against a million-mana basis:
    // c' rounds and the scaled claim would exceed the allowance. Factor zero
    // settles the row at b and the state stays valid.
    const state: PerpState = {
      pool: { L: M, S: 5e-10 },
      positions: [
        pos({
          userId: 'a',
          direction: 'long',
          size: M,
          costBasis: M,
          entryPrice: 100,
        }),
      ],
    }
    const result = applyPerpProtectedClaimAdl(state, 110)
    expect(result.adlFactorLong).toBe(0)
    expect(result.settled).toHaveLength(1)
    expect(result.settled[0].payout).toBe(M)
    expect(result.state.positions).toHaveLength(0)
    expect(() => assertPerpProtectedState(result.state, 110)).not.toThrow()
    // And the oracle transition, which is the path a tick takes, does not halt.
    expect(() => applyPerpProtectedOracleTransition(state, 110)).not.toThrow()
  })

  it('leaves a dust contingent claim alone rather than settling the row', () => {
    const state: PerpState = {
      pool: { L: M, S: 0 },
      positions: [
        pos({
          userId: 'a',
          direction: 'long',
          size: M,
          costBasis: M,
          entryPrice: 100,
          reserveBasis: M - 1e-9,
        }),
      ],
    }
    // E = 1e-9 at the mark: within the basis dust, so no ADL and no settlement.
    const result = applyPerpProtectedClaimAdl(state, 100)
    expect(result.adlFactorLong).toBe(1)
    expect(result.state.positions).toHaveLength(1)
    expect(() => assertPerpProtectedState(result.state, 100)).not.toThrow()
  })

  it('still scales normally when the allowance is representable', () => {
    const state: PerpState = {
      pool: { L: M, S: 25_000 },
      positions: [
        pos({
          userId: 'a',
          direction: 'long',
          size: M,
          costBasis: M,
          entryPrice: 100,
        }),
      ],
    }
    const result = applyPerpProtectedClaimAdl(state, 110)
    expect(result.adlFactorLong).toBeCloseTo(0.25, 12)
    expect(
      getPerpPositionClaims(result.state.positions[0], 110).contingent
    ).toBeCloseTo(25_000, 6)
  })
})

describe('partial close materiality (review P2)', () => {
  const state = (): PerpState => ({
    pool: { L: 1200, S: 700 },
    positions: [
      pos({
        userId: 'a',
        direction: 'long',
        size: 2000,
        costBasis: 1000,
        entryPrice: 100,
        reserveBasis: 950,
      }),
      pos({
        userId: 'b',
        direction: 'short',
        size: 500,
        costBasis: 500,
        entryPrice: 100,
      }),
    ],
  })

  it('refuses fractions below the minimum and rounding no-ops, accepts the minimum', () => {
    for (const fraction of [1e-12, 1e-17, 0.001, PERP_MIN_CLOSE_FRACTION / 2])
      expect(() =>
        closePerpProtectedPosition(
          state(),
          { userId: 'a', direction: 'long' },
          105,
          fraction
        )
      ).toThrow()
    const ok = closePerpProtectedPosition(
      state(),
      { userId: 'a', direction: 'long' },
      105,
      PERP_MIN_CLOSE_FRACTION
    )
    expect(ok.remainingPosition?.size).toBeCloseTo(1980, 9)
    expect(ok.payout).toBeGreaterThan(0)
  })

  it('a fraction that cannot change the surviving row is rejected even above the minimum on a dust position', () => {
    const dust: PerpState = {
      pool: { L: 1e-13, S: 0 },
      positions: [
        pos({
          userId: 'a',
          direction: 'long',
          size: 1e-12,
          costBasis: 1e-13,
          entryPrice: 100,
        }),
      ],
    }
    expect(() =>
      closePerpProtectedPosition(
        dust,
        { userId: 'a', direction: 'long' },
        100,
        0.5
      )
    ).toThrow('too small')
  })
})
