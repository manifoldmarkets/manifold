import { parseStoredPosition } from './engine'

// parseStoredPosition rebuilds the position returned by an idempotent replay
// from the stored response. A protected position's reserve basis must
// survive that round trip: a replay that silently reported b = c would show
// a user a protected basis the ledger no longer backs.
describe('parseStoredPosition (idempotent replay)', () => {
  const base = {
    userId: 'u',
    contractId: 'c',
    direction: 'long',
    size: 100,
    costBasis: 10,
    originalCostBasis: 10,
    entryPrice: 100,
    leverage: 10,
    liquidationPrice: 90,
    openedTime: 1,
    updatedTime: 1,
  }

  it('mirrors b = c for records written before protected accounting', () => {
    const parsed = parseStoredPosition(base)
    expect(parsed.reserveBasis).toBe(10)
    expect(parsed.takerFeeCostBasis).toBe(0)
  })

  it('keeps a reduced protected basis, including zero', () => {
    expect(parseStoredPosition({ ...base, reserveBasis: 4 }).reserveBasis).toBe(
      4
    )
    expect(parseStoredPosition({ ...base, reserveBasis: 0 }).reserveBasis).toBe(
      0
    )
  })

  it('rejects a reserve basis outside [0, c] or non-finite', () => {
    expect(() => parseStoredPosition({ ...base, reserveBasis: -1 })).toThrow(
      /reserve basis/
    )
    expect(() => parseStoredPosition({ ...base, reserveBasis: 10.5 })).toThrow(
      /reserve basis/
    )
    expect(() =>
      parseStoredPosition({ ...base, reserveBasis: Number.NaN })
    ).toThrow(/reserve basis/)
    expect(() =>
      parseStoredPosition({ ...base, reserveBasis: 'four' })
    ).toThrow(/reserve basis/)
  })

  it('still rejects malformed records', () => {
    expect(() => parseStoredPosition(null)).toThrow(/Invalid position/)
    expect(() =>
      parseStoredPosition({ ...base, direction: 'sideways' })
    ).toThrow(/Invalid position/)
    expect(() =>
      parseStoredPosition({ ...base, costBasis: Number.POSITIVE_INFINITY })
    ).toThrow()
  })
})
