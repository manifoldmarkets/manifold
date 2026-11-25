import {
  canTakeLoans,
  filterLoanEquityMetrics,
  getGeneralLoanHeadroom,
  sizeGeneralLoan,
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
  // Loans are borrowed against the user's own positions, so never-verified
  // accounts can take them like everyone else in good standing.
  it('allows never-verified users (bonusEligibility undefined)', () => {
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

  // 'ineligible' is written by superBanUserCore alongside permanent bans (and,
  // on older rows, by failed/expired iDenfy sessions). Allowing it would hand
  // loans back to superbanned accounts.
  it('blocks explicitly-ineligible accounts (superban, legacy failed KYC)', () => {
    expect(canTakeLoans({ bonusEligibility: 'ineligible' })).toBe(false)
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

describe('getGeneralLoanHeadroom', () => {
  it('leaves room under the total and daily limits', () => {
    expect(getGeneralLoanHeadroom(1000, 1, 300, 40)).toEqual({
      maxLoan: 1000,
      dailyLimit: 100,
      availableTotal: 700,
      availableToday: 60,
    })
  })

  it('never goes negative', () => {
    const headroom = getGeneralLoanHeadroom(1000, 1, 1200, 150)
    expect(headroom.availableTotal).toBe(0)
    expect(headroom.availableToday).toBe(0)
  })
})

describe('sizeGeneralLoan', () => {
  // Here (d - t) + t rounds above d, so the old `todayLoans + amount >
  // dailyLimit` check rejected the exact figure get-next-loan-amount had
  // just shown.
  it('accepts the exact headroom it reported despite float rounding', () => {
    const todayLoans = 340.937559505199
    const headroom = getGeneralLoanHeadroom(9097.196438903555, 1, 0, todayLoans)
    expect(todayLoans + headroom.availableToday).toBeGreaterThan(
      headroom.dailyLimit
    )
    expect(sizeGeneralLoan(headroom.availableToday, false, headroom)).toEqual({
      loanAmount: headroom.availableToday,
    })
  })

  it('lends an amount within the headroom unchanged', () => {
    const headroom = { availableTotal: 700, availableToday: 60 }
    expect(sizeGeneralLoan(59.5, false, headroom)).toEqual({ loanAmount: 59.5 })
    expect(sizeGeneralLoan(59.5, true, headroom)).toEqual({ loanAmount: 59.5 })
  })

  it('rejects an exact amount over the headroom, naming the limit', () => {
    expect(
      sizeGeneralLoan(701, false, { availableTotal: 700, availableToday: 800 })
    ).toEqual({ exceeded: 'total' })
    expect(
      sizeGeneralLoan(60.01, false, { availableTotal: 700, availableToday: 60 })
    ).toEqual({ exceeded: 'daily' })
  })

  describe('with clampToLimit', () => {
    it('cuts a stale max down to the live limit', () => {
      // The modal showed 15.29 available; a price move since left 15.1.
      expect(
        sizeGeneralLoan(15.29, true, {
          availableTotal: 500,
          availableToday: 15.1,
        })
      ).toEqual({ loanAmount: 15.1 })
    })

    it('takes the tighter of the two limits', () => {
      expect(
        sizeGeneralLoan(100, true, { availableTotal: 42, availableToday: 60 })
      ).toEqual({ loanAmount: 42 })
    })

    it('never lends more than asked when the limit has grown', () => {
      expect(
        sizeGeneralLoan(15.29, true, {
          availableTotal: 500,
          availableToday: 90,
        })
      ).toEqual({ loanAmount: 15.29 })
    })

    it('fails rather than lend under M$1', () => {
      expect(
        sizeGeneralLoan(15, true, { availableTotal: 0.4, availableToday: 50 })
      ).toEqual({ exceeded: 'total' })
      expect(
        sizeGeneralLoan(15, true, { availableTotal: 50, availableToday: 0.99 })
      ).toEqual({ exceeded: 'daily' })
    })
  })

  it.each([false, true])(
    'fails on empty or non-finite headroom (clampToLimit: %s)',
    (clampToLimit) => {
      expect(
        sizeGeneralLoan(10, clampToLimit, {
          availableTotal: NaN,
          availableToday: 50,
        })
      ).toEqual({ exceeded: 'total' })
      expect(
        sizeGeneralLoan(10, clampToLimit, {
          availableTotal: 50,
          availableToday: 0,
        })
      ).toEqual({ exceeded: 'daily' })
    }
  )

  it.each([false, true])(
    'fails on a non-finite amount (clampToLimit: %s)',
    (clampToLimit) => {
      const headroom = { availableTotal: 700, availableToday: 60 }
      expect(sizeGeneralLoan(Infinity, clampToLimit, headroom)).toEqual({
        exceeded: 'total',
      })
      expect(sizeGeneralLoan(NaN, clampToLimit, headroom)).toEqual({
        exceeded: 'total',
      })
    }
  )

  it('tolerates float error at the limit, but no more', () => {
    const headroom = { availableTotal: 700, availableToday: 60 }
    expect(sizeGeneralLoan(60 + 1e-9, false, headroom)).toEqual({
      loanAmount: 60 + 1e-9,
    })
    expect(sizeGeneralLoan(60 + 1e-6, false, headroom)).toEqual({
      exceeded: 'daily',
    })
  })

  it('lends an amount under M$1 that fits, with or without clampToLimit', () => {
    const headroom = { availableTotal: 0.8, availableToday: 60 }
    expect(sizeGeneralLoan(0.5, false, headroom)).toEqual({ loanAmount: 0.5 })
    expect(sizeGeneralLoan(0.5, true, headroom)).toEqual({ loanAmount: 0.5 })
    // Asked for less than M$1, so the clamp won't go below what was asked.
    expect(
      sizeGeneralLoan(0.5, true, { availableTotal: 0.3, availableToday: 60 })
    ).toEqual({ exceeded: 'total' })
  })
})
