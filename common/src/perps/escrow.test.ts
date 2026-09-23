import {
  getPerpEscrowDifference,
  getPerpEscrowTolerance,
  isPerpEscrowBalanced,
} from './escrow'

describe('PERP escrow invariant', () => {
  test('accepts an exactly backed pool', () => {
    const snapshot = {
      ledgerBalance: 1_250,
      poolLong: 750,
      poolShort: 500,
    }
    expect(getPerpEscrowDifference(snapshot)).toBe(0)
    expect(isPerpEscrowBalanced(snapshot)).toBe(true)
  })

  test('allows only floating-point dust', () => {
    expect(
      isPerpEscrowBalanced({
        ledgerBalance: 0.3,
        poolLong: 0.1,
        poolShort: 0.2,
      })
    ).toBe(true)
    expect(
      isPerpEscrowBalanced({
        ledgerBalance: -Number.EPSILON,
        poolLong: 0,
        poolShort: 0,
      })
    ).toBe(true)
    expect(
      isPerpEscrowBalanced({
        ledgerBalance: 1_000,
        poolLong: 500,
        poolShort: 499.99,
      })
    ).toBe(false)
  })

  test('caps tolerance below a meaningful amount of mana', () => {
    const snapshot = {
      ledgerBalance: 1e15,
      poolLong: 5e14,
      poolShort: 5e14,
    }
    expect(getPerpEscrowTolerance(snapshot)).toBe(1e-3)
  })

  test.each([
    {
      ledgerBalance: Number.NaN,
      poolLong: 1,
      poolShort: 1,
    },
    {
      ledgerBalance: 2,
      poolLong: Number.POSITIVE_INFINITY,
      poolShort: 1,
    },
    {
      ledgerBalance: -1,
      poolLong: 0,
      poolShort: 0,
    },
    {
      ledgerBalance: 0,
      poolLong: -1,
      poolShort: 1,
    },
  ])('rejects invalid accounting values: %p', (snapshot) => {
    expect(isPerpEscrowBalanced(snapshot)).toBe(false)
  })
})
