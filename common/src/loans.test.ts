import { filterLoanEquityMetrics, sumExcludedPerpEquity } from './loans'

// Build minimal shapes — the helper only reads contractId and mechanism.
const metric = (contractId: string, extra?: Record<string, unknown>) => ({
  contractId,
  ...extra,
})

const contractsById = {
  perp1: { mechanism: 'perp' as const, token: 'MANA' as const },
  perp2: { mechanism: 'perp' as const, token: 'MANA' as const },
  cashPerp: { mechanism: 'perp' as const, token: 'CASH' as const },
  binary: { mechanism: 'cpmm-1' as const, token: 'MANA' as const },
  multi: { mechanism: 'cpmm-multi-1' as const, token: 'MANA' as const },
}

describe('filterLoanEquityMetrics', () => {
  it('excludes perp positions from loan equity', () => {
    const metrics = [
      metric('perp1'),
      metric('binary'),
      metric('multi'),
      metric('perp2'),
    ]
    const result = filterLoanEquityMetrics(metrics, contractsById)
    expect(result.map((m) => m.contractId)).toEqual(['binary', 'multi'])
  })

  it('returns all metrics when none are perps', () => {
    const metrics = [metric('binary'), metric('multi')]
    expect(filterLoanEquityMetrics(metrics, contractsById)).toEqual(metrics)
  })

  it('returns empty for all-perp portfolios', () => {
    const metrics = [metric('perp1'), metric('perp2')]
    expect(filterLoanEquityMetrics(metrics, contractsById)).toEqual([])
  })

  it('keeps metrics whose contract is missing from the map', () => {
    const metrics = [metric('unknown'), metric('perp1')]
    const result = filterLoanEquityMetrics(metrics, contractsById)
    expect(result.map((m) => m.contractId)).toEqual(['unknown'])
  })

  it('preserves metric fields and order', () => {
    const metrics = [
      metric('multi', { answerId: 'a', payout: 100 }),
      metric('perp1', { payout: 5000 }),
      metric('binary', { payout: 50 }),
    ]
    const result = filterLoanEquityMetrics(metrics, contractsById)
    expect(result).toEqual([
      { contractId: 'multi', answerId: 'a', payout: 100 },
      { contractId: 'binary', payout: 50 },
    ])
  })
})

describe('sumExcludedPerpEquity', () => {
  it('sums the perp payout left out of the equity base', () => {
    const metrics = [
      metric('perp1', { payout: 5000 }),
      metric('binary', { payout: 50 }),
      metric('perp2', { payout: 250 }),
    ]
    expect(sumExcludedPerpEquity(metrics, contractsById)).toEqual(5250)
  })

  it('is zero when the portfolio holds no perps', () => {
    const metrics = [metric('binary', { payout: 50 }), metric('multi', {})]
    expect(sumExcludedPerpEquity(metrics, contractsById)).toEqual(0)
  })

  it('only counts perps of the requested token', () => {
    const metrics = [
      metric('perp1', { payout: 100 }),
      metric('cashPerp', { payout: 900 }),
    ]
    expect(sumExcludedPerpEquity(metrics, contractsById)).toEqual(100)
    expect(sumExcludedPerpEquity(metrics, contractsById, 'CASH')).toEqual(900)
  })

  it('ignores non-finite payouts rather than returning NaN', () => {
    const metrics = [
      metric('perp1', { payout: NaN }),
      metric('perp2', { payout: 300 }),
    ]
    expect(sumExcludedPerpEquity(metrics, contractsById)).toEqual(300)
  })

  it('never reports a negative excluded value', () => {
    const metrics = [metric('perp1', { payout: -40 })]
    expect(sumExcludedPerpEquity(metrics, contractsById)).toEqual(0)
  })

  it('agrees with what filterLoanEquityMetrics drops', () => {
    const metrics = [
      metric('perp1', { payout: 700 }),
      metric('binary', { payout: 50 }),
    ]
    const kept = filterLoanEquityMetrics(metrics, contractsById)
    expect(kept.map((m) => m.contractId)).toEqual(['binary'])
    expect(sumExcludedPerpEquity(metrics, contractsById)).toEqual(700)
  })
})
