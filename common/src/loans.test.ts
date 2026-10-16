import {
  canTakeLoans,
  filterLoanEquityMetrics,
  sumExcludedPerpEquity,
} from './loans'

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

describe('canTakeLoans', () => {
  // The point of the change: loans are off the full-bonus axis, because they're
  // borrowed against the user's own positions and the membership table
  // advertises the 1% daily free loan to unverified users.
  it('allows unverified users (bonusEligibility undefined)', () => {
    expect(canTakeLoans({})).toBe(true)
  })

  it('allows verified, grandfathered, and purchase/admin-granted users', () => {
    expect(canTakeLoans({ bonusEligibility: 'verified' })).toBe(true)
    expect(canTakeLoans({ bonusEligibility: 'grandfathered' })).toBe(true)
    expect(canTakeLoans({ bonusEligibility: 'eligible' })).toBe(true)
  })

  it('blocks admin-flagged accounts pending review', () => {
    expect(canTakeLoans({ bonusEligibility: 'requires_verification' })).toBe(
      false
    )
  })

  // 'ineligible' is overloaded and two of its three writers are enforcement:
  // the iDenfy callback on denied/suspected/EXPIRED/DELETED, and
  // superBanUserCore alongside permanent bans. Allowing it would hand loans
  // back to superbanned accounts.
  it('blocks explicitly-ineligible accounts (superban, failed/expired KYC)', () => {
    expect(canTakeLoans({ bonusEligibility: 'ineligible' })).toBe(false)
  })

  // Regression guard: mapIdenfyStatus folds EXPIRED/DELETED into 'denied', and
  // the denial branch rewrites a non-grandfathered user to 'ineligible'. So an
  // admin hold must not become loan access just by letting a session lapse.
  it('does not let an admin hold lapse into loan access via expiry', () => {
    const flagged = { bonusEligibility: 'requires_verification' }
    expect(canTakeLoans(flagged)).toBe(false)
    // ... iDenfy session expires, callback rewrites the field:
    const afterExpiry = { bonusEligibility: 'ineligible' }
    expect(canTakeLoans(afterExpiry)).toBe(false)
  })

  // Bots self-exclude from bonuses, but that exclusion lives on isBot and the
  // bonus predicates — it must not reach through to borrowing. An unverified
  // bot borrows; the deny states still apply, bot or not.
  it('ignores bot status', () => {
    expect(canTakeLoans({ isBot: true } as any)).toBe(true)
    expect(
      canTakeLoans({ isBot: true, bonusEligibility: 'verified' } as any)
    ).toBe(true)
    expect(
      canTakeLoans({ isBot: true, bonusEligibility: 'ineligible' } as any)
    ).toBe(false)
    expect(
      canTakeLoans({
        isBot: true,
        bonusEligibility: 'requires_verification',
      } as any)
    ).toBe(false)
  })
})

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
