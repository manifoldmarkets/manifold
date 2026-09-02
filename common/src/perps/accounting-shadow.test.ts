import { liquidationPrice, PerpState } from './amm'
import { PerpDirection, PerpPosition } from './position'
import {
  advancePerpShadowCheckpoint,
  parsePerpShadowCheckpoint,
  seedPerpShadowCheckpoint,
} from './accounting-shadow'
import { closePosition, openPosition } from './amm'

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

// The five-shorts scenario, replayed through the shadow while the live
// ledger commits legacy closes.
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

describe('accounting shadow checkpoint', () => {
  it('seeds from the live state with b = c and tracks a protected path the legacy ledger does not', () => {
    let live = scenario()
    let checkpoint = seedPerpShadowCheckpoint(live, 1)
    expect(
      checkpoint.positions.every((p) => p.reserveBasis === p.costBasis)
    ).toBe(true)

    for (let i = 1; i <= 5; i++) {
      const row = live.positions.find((p) => p.userId === `short${i}`)!
      const legacy = closePosition(live, row, 99)
      live = legacy.state
      const advanced = advancePerpShadowCheckpoint(
        checkpoint,
        {
          kind: 'close',
          userId: `short${i}`,
          direction: 'short',
          fraction: 1,
          price: 99,
          now: 1,
          livePayout: legacy.payout,
        },
        live,
        99
      )
      checkpoint = advanced.checkpoint
      // At b = c a close pays the same under both accountings.
      expect(advanced.report.applied).toBe(true)
      expect(Math.abs(advanced.report.payoutDifference ?? 0)).toBeLessThan(1e-6)
      expect(advanced.report.divergent).toBe(false)
    }
    // The shadow carries the reduced b the legacy row never records.
    const shadowLong = checkpoint.positions.find((p) => p.userId === 'long')!
    expect(shadowLong.reserveBasis).toBeCloseTo(4.95 * M, 6)
    expect(shadowLong.costBasis).toBe(5 * M)
    expect(checkpoint.transitions).toBe(5)
    expect(checkpoint.divergences).toBe(0)

    // The recovery tick: live legacy ADL leaves the long alone (π = 0 at 100
    // is not "profit"), while the protected shadow claim-ADLs the value above
    // the reduced b. That is exactly the divergence shadow exists to surface.
    const liveTick = live // legacy: no liquidation, no ADL at 100
    const recovery = advancePerpShadowCheckpoint(
      checkpoint,
      { kind: 'oracle', price: 100 },
      liveTick,
      100
    )
    expect(recovery.report.applied).toBe(true)
    expect(recovery.report.divergent).toBe(true)
    expect(recovery.report.positionDifferences).toHaveLength(1)
    expect(recovery.report.positionDifferences[0].sizeDifference).toBeCloseTo(
      2 * M - 5 * M,
      6
    )
    expect(recovery.report.basisDeficit).toBeGreaterThan(0)
    expect(recovery.checkpoint.divergences).toBe(1)
    // The legacy view (b = c) sees no contingent claim at all at 100 — which
    // is precisely the unfunded recovery the shadow makes visible.
    expect(recovery.report.liveInvariants.contingentClaimsBacked).toBe(true)
    expect(recovery.report.shadowInvariants.contingentClaimsBacked).toBe(true)
  })

  it('replays opens, adds and flips including the fee credit, and stays byte-identical to live at b = c', () => {
    let live: PerpState = { pool: { L: 1000, S: 1000 }, positions: [] }
    let checkpoint = seedPerpShadowCheckpoint(live, 1)
    const step = (
      userId: string,
      direction: PerpDirection,
      mana: number,
      leverage: number,
      fee: number
    ) => {
      const existingSame = live.positions.find(
        (p) => p.userId === userId && p.direction === direction && p.size > 0
      )
      const opposite = live.positions.find(
        (p) => p.userId === userId && p.direction !== direction && p.size > 0
      )
      let working = live
      if (opposite) working = closePosition(working, opposite, 100).state
      const opened = openPosition(
        working,
        userId,
        'c1',
        direction,
        mana,
        leverage,
        100,
        existingSame,
        7
      )
      live = {
        pool: {
          L: opened.state.pool.L + (direction === 'long' ? fee : 0),
          S: opened.state.pool.S + (direction === 'short' ? fee : 0),
        },
        positions: opened.state.positions.map((p) =>
          p.userId === userId && p.direction === direction
            ? { ...p, takerFeeCostBasis: (p.takerFeeCostBasis ?? 0) + fee }
            : p
        ),
      }
      const advanced = advancePerpShadowCheckpoint(
        checkpoint,
        {
          kind: 'open',
          userId,
          contractId: 'c1',
          direction,
          mana,
          leverage,
          fee,
          price: 100,
          now: 7,
        },
        live,
        100
      )
      checkpoint = advanced.checkpoint
      expect(advanced.report.divergent).toBe(false)
    }
    step('a', 'long', 100, 5, 0.5)
    step('a', 'long', 50, 2, 0.2)
    step('b', 'short', 80, 3, 0.1)
    step('a', 'short', 60, 4, 0.3) // flip
    expect(checkpoint.positions).toHaveLength(2)
    expect(checkpoint.pool.L).toBeCloseTo(live.pool.L, 9)
    expect(checkpoint.pool.S).toBeCloseTo(live.pool.S, 9)
  })

  it('re-seeds from live and records the error when the protected counterpart cannot apply', () => {
    // A legacy-wedged book: protected accounting refuses the transition.
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
    const checkpoint = seedPerpShadowCheckpoint(wedged, 1)
    const liveAfter: PerpState = {
      pool: { L: 200, S: 900 },
      positions: wedged.positions,
    }
    const advanced = advancePerpShadowCheckpoint(
      checkpoint,
      { kind: 'oracle', price: 110 },
      liveAfter,
      110
    )
    expect(advanced.report.applied).toBe(false)
    expect(advanced.report.error).toContain('transfer across sides')
    expect(advanced.report.reseeded).toBe(true)
    expect(advanced.checkpoint.reseeds).toBe(1)
    expect(advanced.checkpoint.pool).toEqual(liveAfter.pool)
    // A close of a row the shadow lacks is a recorded divergence, not a throw.
    const missing = advancePerpShadowCheckpoint(
      advanced.checkpoint,
      {
        kind: 'close',
        userId: 'zz',
        direction: 'long',
        fraction: 1,
        price: 110,
        now: 1,
      },
      liveAfter,
      110
    )
    expect(missing.report.applied).toBe(false)
    expect(missing.report.error).toContain('no long row')
  })

  it('round-trips through the persisted JSON shape and rejects malformed checkpoints', () => {
    const checkpoint = seedPerpShadowCheckpoint(scenario(), 3)
    const parsed = parsePerpShadowCheckpoint(
      JSON.parse(JSON.stringify(checkpoint)),
      3
    )
    expect(parsed).toEqual(checkpoint)
    expect(parsePerpShadowCheckpoint(null, 3)).toBeNull()
    expect(parsePerpShadowCheckpoint({ pool: { L: 1 } }, 3)).toBeNull()
    expect(
      parsePerpShadowCheckpoint(
        { pool: { L: 1, S: 1 }, positions: [{ userId: 'u' }] },
        3
      )
    ).toBeNull()
    expect(
      parsePerpShadowCheckpoint(
        { pool: { L: Number.NaN, S: 1 }, positions: [] },
        3
      )
    ).toBeNull()
  })
})
