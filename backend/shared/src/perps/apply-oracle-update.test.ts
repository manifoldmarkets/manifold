import { PerpState } from 'common/perps/amm'
import { PerpContract } from 'common/contract'
import { PerpPosition } from 'common/perps/position'

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
