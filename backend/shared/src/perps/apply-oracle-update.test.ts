import { PerpState } from 'common/perps/amm'
import { PerpContract } from 'common/contract'
import { PerpPosition } from 'common/perps/position'
import { PerpProtectedInvariantError } from 'common/perps/protected-basis'

import { applyOracleUpdate } from './engine'

// applyOracleUpdate is the shared core of BOTH the scheduler tick
// (runOracleUpdate) and the pre-settlement pass inside resolvePerp, so its
// validation ordering is the only thing standing between a corrupt row and
// an automated payout. It is pure, so it can be exercised directly.
describe('applyOracleUpdate validates structure BEFORE the risk transitions', () => {
  const contract = {
    id: 'c1',
    mechanism: 'perp',
    slug: 'test-perp',
    token: 'MANA',
  } as unknown as PerpContract

  const row = (over: Partial<PerpPosition> = {}): PerpPosition => ({
    userId: 'u',
    contractId: 'c1',
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

  it('accepts a sound state', () => {
    const state: PerpState = {
      pool: { L: 50_000, S: 50_000 },
      positions: [row()],
    }
    expect(() => applyOracleUpdate(contract, state, 95, 1, 1)).not.toThrow()
  })

  // processLiquidations overwrites size / costBasis / leverage with 0, so a
  // corruption in any of the three is laundered into a structurally valid
  // zero row. Checking numbers only on the OUTPUT would pass.
  it.each(['size', 'costBasis', 'leverage'] as const)(
    'throws on a corrupt %s instead of letting liquidation zero it away',
    (field) => {
      const state: PerpState = {
        pool: { L: 50_000, S: 50_000 },
        positions: [row({ [field]: Number.NaN })],
      }
      // Mark 50 is well past the 10x long's liquidation price of 90.
      expect(() => applyOracleUpdate(contract, state, 50, 1, 1)).toThrow()
    }
  )

  // A factor-zero ADL removes the position outright, taking every corrupt
  // field with it.
  it('throws on a corrupt row instead of letting a factor-zero ADL settle it away', () => {
    const state: PerpState = {
      pool: { L: 10_000, S: 0 },
      positions: [row({ originalCostBasis: Number.NaN })],
    }
    expect(() => applyOracleUpdate(contract, state, 150, 1, 1)).toThrow()
  })

  // The reason the pre-transition check is numbers-only: liquidation and ADL
  // exist to REPAIR insolvency, so asserting solvency on their input would
  // fail closed on exactly the states they are here to fix.
  it('still processes a legitimately insolvent book', () => {
    const state: PerpState = {
      pool: { L: 10_000, S: 0 },
      positions: [row()],
    }
    const applied = applyOracleUpdate(contract, state, 150, 1, 1)
    expect(applied.adlFactorLong).toBe(0)
    expect(applied.adlSettled).toHaveLength(1)
  })
})

// Protected accounting through the same entry point. The scheduler and the
// resolution path both pass the accounting read under the lock, so these are
// the transitions a protected contract actually receives.
describe('applyOracleUpdate under protected accounting', () => {
  const contract = {
    id: 'c1',
    mechanism: 'perp',
    slug: 'test-perp',
    token: 'MANA',
  } as unknown as PerpContract
  const protectedAccounting = {
    mode: 'protected' as const,
    epoch: 2,
    riskPolicyMode: 'off' as const,
  }

  const row = (over: Partial<PerpPosition> = {}): PerpPosition => ({
    userId: 'u',
    contractId: 'c1',
    direction: 'long',
    size: 5000,
    costBasis: 1000,
    reserveBasis: 1000,
    originalCostBasis: 1000,
    takerFeeCostBasis: 0,
    entryPrice: 100,
    leverage: 5,
    liquidationPrice: 80,
    openedTime: 1,
    updatedTime: 1,
    ...over,
  })

  it('refuses a book legacy ADL would repair by cross-side transfer', () => {
    const wedged: PerpState = {
      pool: { L: 100, S: 1000 },
      positions: [
        row({ size: 1000, costBasis: 200, reserveBasis: 200, leverage: 5 }),
        row({
          userId: 'v',
          direction: 'short',
          size: 100,
          costBasis: 10,
          reserveBasis: 10,
          leverage: 10,
          liquidationPrice: 110,
        }),
      ],
    }
    // Legacy: the transfer makes it representable.
    expect(() => applyOracleUpdate(contract, wedged, 110, 1, 1)).not.toThrow()
    // Protected: never moves pool balance across sides — halts instead.
    let error: unknown
    try {
      applyOracleUpdate(contract, wedged, 110, 1, 1, protectedAccounting)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(PerpProtectedInvariantError)
    expect((error as PerpProtectedInvariantError).kind).toBe(
      'cross-side-transfer'
    )
  })

  it('claim-ADLs a recovery above a reduced b and stamps the events with reserve deltas', () => {
    // b = 800 < c = 1000; at 100 the row is worth 1000, so E = 200 against
    // an empty short side with H = 50: factor 0.25.
    const state: PerpState = {
      pool: { L: 800, S: 50 },
      positions: [row({ reserveBasis: 800 })],
    }
    const applied = applyOracleUpdate(
      contract,
      state,
      100,
      1,
      1,
      protectedAccounting
    )
    expect(applied.adlFactorLong).toBeCloseTo(0.25, 9)
    const survivor = applied.finalState.positions[0]
    expect(survivor.size).toBeCloseTo(1250, 9)
    expect(survivor.costBasis).toBeCloseTo(850, 9)
    expect(survivor.reserveBasis).toBe(800)
    const adlEvent = applied.events.find(
      (e) => e.eventType === 'adl' && e.userId === 'u'
    )!
    expect(adlEvent.costBasisDelta).toBeCloseTo(-150, 9)
    expect(adlEvent.reserveBasisDelta).toBe(0)
    expect(adlEvent.data?.costBasisAfter).toBeCloseTo(850, 9)
  })

  it('pays the protected basis once at factor zero and records a full reserve delta', () => {
    const state: PerpState = {
      pool: { L: 800, S: 0 },
      positions: [row({ reserveBasis: 800 })],
    }
    const applied = applyOracleUpdate(
      contract,
      state,
      100,
      1,
      1,
      protectedAccounting
    )
    expect(applied.adlFactorLong).toBe(0)
    expect(applied.adlSettled).toHaveLength(1)
    expect(applied.adlSettled[0].payout).toBe(800)
    expect(applied.finalState.positions).toHaveLength(0)
    const settled = applied.events.find(
      (e) => e.eventType === 'adl' && e.userId === 'u'
    )!
    expect(settled.reserveBasisDelta).toBe(-800)
    expect(settled.costBasisDelta).toBe(-1000)
    expect(settled.data?.payout).toBe(800)
  })

  it('liquidation events carry the forfeited protected basis', () => {
    const state: PerpState = {
      pool: { L: 1000, S: 1000 },
      positions: [row({ reserveBasis: 900 })],
    }
    const applied = applyOracleUpdate(
      contract,
      state,
      70,
      1,
      1,
      protectedAccounting
    )
    expect(applied.liquidated).toHaveLength(1)
    const liq = applied.events.find((e) => e.eventType === 'liquidation')!
    expect(liq.reserveBasisDelta).toBe(-900)
    expect(liq.costBasisDelta).toBe(-1000)
  })

  it('legacy accounting is the default and is unchanged', () => {
    const state: PerpState = {
      pool: { L: 10_000, S: 0 },
      positions: [
        row({
          size: 100_000,
          costBasis: 10_000,
          reserveBasis: 10_000,
          leverage: 10,
          liquidationPrice: 90,
        }),
      ],
    }
    const applied = applyOracleUpdate(contract, state, 150, 1, 1)
    expect(applied.adlFactorLong).toBe(0)
    expect(applied.adlSettled).toHaveLength(1)
    const settled = applied.events.find(
      (e) => e.eventType === 'adl' && e.userId === 'u'
    )!
    // Legacy mirror: Δb = Δc.
    expect(settled.reserveBasisDelta).toBe(settled.costBasisDelta)
  })
})
