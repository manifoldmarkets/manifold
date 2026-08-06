import { filterLoanEquityMetrics } from './loans'

// Build minimal shapes — the helper only reads contractId and mechanism.
const metric = (contractId: string, extra?: Record<string, unknown>) => ({
  contractId,
  ...extra,
})

const contractsById = {
  perp1: { mechanism: 'perp' as const },
  perp2: { mechanism: 'perp' as const },
  binary: { mechanism: 'cpmm-1' as const },
  multi: { mechanism: 'cpmm-multi-1' as const },
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
