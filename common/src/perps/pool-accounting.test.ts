import { assertPerpPoolEventBalanced, PerpPoolEvent } from './pool-accounting'

const event = (overrides: Partial<PerpPoolEvent> = {}): PerpPoolEvent => ({
  contractId: 'contract',
  eventType: 'open',
  appliedTime: 1,
  oracleTime: 1,
  oraclePrice: 100,
  poolBefore: { L: 100, S: 100 },
  poolAfter: { L: 111, S: 100 },
  cashIn: 11,
  cashOut: 0,
  ...overrides,
})

describe('PERP pool accounting events', () => {
  it('accepts external cash entering a pool', () => {
    expect(() => assertPerpPoolEventBalanced(event())).not.toThrow()
  })

  it('accepts an internal cross-side transfer', () => {
    expect(() =>
      assertPerpPoolEventBalanced(
        event({
          eventType: 'oracle',
          poolBefore: { L: 60, S: 100 },
          poolAfter: { L: 100, S: 60 },
          cashIn: 0,
          cashOut: 0,
        })
      )
    ).not.toThrow()
  })

  it('accepts a flip with cash moving in both directions', () => {
    expect(() =>
      assertPerpPoolEventBalanced(
        event({
          eventType: 'flip',
          poolBefore: { L: 100, S: 100 },
          poolAfter: { L: 90, S: 116 },
          cashIn: 26,
          cashOut: 20,
        })
      )
    ).not.toThrow()
  })

  it('rejects an unexplained pool delta', () => {
    expect(() =>
      assertPerpPoolEventBalanced(event({ poolAfter: { L: 112, S: 100 } }))
    ).toThrow('PERP pool event is not cash-balanced')
  })

  it('allows a baseline to seed pre-ledger state', () => {
    expect(() =>
      assertPerpPoolEventBalanced(
        event({
          eventType: 'baseline',
          poolBefore: { L: 125, S: 75 },
          poolAfter: { L: 125, S: 75 },
          cashIn: 0,
        })
      )
    ).not.toThrow()
  })

  it('rejects an unbalanced baseline', () => {
    expect(() =>
      assertPerpPoolEventBalanced(
        event({
          eventType: 'baseline',
          poolBefore: { L: 0, S: 0 },
          poolAfter: { L: 125, S: 75 },
          cashIn: 0,
        })
      )
    ).toThrow('PERP pool event is not cash-balanced')
  })
})
