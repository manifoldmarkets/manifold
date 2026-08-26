import {
  formatFeePct,
  perpFeeScheduleSummary,
  PERP_FEE_EXAMPLE_POOL_SHARES,
} from './format'
import {
  getPerpEffectiveTakerFeeBps,
  getPerpTakerFeeImpact,
  perpSizeFeeDetails,
  PERP_TAKER_FEE_BPS_DEFAULT,
  PERP_TAKER_FEE_IMPACT_DEFAULT,
} from './fees'

describe('formatFeePct', () => {
  it('shows two decimals below 1% and one above, so the base rate stays legible', () => {
    expect(formatFeePct(10)).toBe('0.10%')
    expect(formatFeePct(13.333333333333332)).toBe('0.13%')
    expect(formatFeePct(63.33333333333333)).toBe('0.63%')
    expect(formatFeePct(100)).toBe('1.0%')
    expect(formatFeePct(490)).toBe('4.9%')
  })

  it('never renders a POSITIVE rate as free', () => {
    // Reachable: takerFeeBps is z.number().min(0).max(100) with no .int(), and
    // base 0 with impact 1 prices a pool-sized entry at 1/3 bps.
    expect(formatFeePct(0.4)).toBe('<0.01%')
    expect(formatFeePct(1 / 3)).toBe('<0.01%')
    expect(formatFeePct(1e-9)).toBe('<0.01%')
    // Only a genuinely absent fee reads as zero.
    expect(formatFeePct(0)).toBe('0%')
    expect(formatFeePct(-1)).toBe('0%')
    expect(formatFeePct(NaN)).toBe('0%')
    expect(formatFeePct(Infinity)).toBe('0%')
  })

  it('takes its cutovers on the rounded value, so the bands cannot overlap', () => {
    // 999 bps must not print "10.0%" while 1000 bps prints "10%".
    expect(formatFeePct(999)).toBe('10%')
    expect(formatFeePct(1000)).toBe('10%')
    expect(formatFeePct(994)).toBe('9.9%')
    // Same at the 1% boundary: 99.9 bps rounds to 1.00, so it takes the
    // one-decimal band rather than printing "1.00%" next to "1.0%".
    expect(formatFeePct(99.9)).toBe('1.0%')
    expect(formatFeePct(99)).toBe('0.99%')
  })

  it('keeps large rates whole', () => {
    expect(formatFeePct(1500)).toBe('15%')
    expect(formatFeePct(10_000)).toBe('100%')
  })
})

describe('perpFeeScheduleSummary', () => {
  // The regression this suite exists for: the size term stacks on whichever
  // base the CHANNEL selected (engine.ts picks the base, then scales), so the
  // web figures are simply wrong for an API-key open. The reader-facing
  // surfaces quoted the web numbers to API traders.
  it('stacks the size term on the API base, not the web base', () => {
    // Live BTC / Trump-approval config at time of writing.
    const s = perpFeeScheduleSummary({
      takerFeeBps: 10,
      takerFeeApiBps: 30,
      takerFeeImpact: 10,
    })
    expect(s.baseBps).toBe(10)
    expect(s.apiBps).toBe(30)
    expect(s.apiDiffers).toBe(true)
    expect(s.poolSizedBps).toBeCloseTo(10 + 10 / 3, 10)
    expect(s.fourTimesPoolBps).toBeCloseTo(10 + (10 / 3) * 16, 10)
    expect(s.apiPoolSizedBps).toBeCloseTo(30 + 10 / 3, 10)
    expect(s.apiFourTimesPoolBps).toBeCloseTo(30 + (10 / 3) * 16, 10)
    // The API figures must not silently equal the web ones.
    expect(s.apiPoolSizedBps).toBeGreaterThan(s.poolSizedBps)
    expect(s.apiFourTimesPoolBps).toBeGreaterThan(s.fourTimesPoolBps)
  })

  it('agrees with the rate the engine would charge on each channel', () => {
    const contract = { takerFeeBps: 10, takerFeeApiBps: 30, takerFeeImpact: 90 }
    const s = perpFeeScheduleSummary(contract)
    for (const [isApi, expected] of [
      [false, s.poolSizedBps],
      [true, s.apiPoolSizedBps],
    ] as const) {
      const P = 466_000
      const charged = perpSizeFeeDetails({
        notionalBefore: 0,
        notionalAfter: P,
        poolDepth: P,
        baseBps: getPerpEffectiveTakerFeeBps(contract, isApi),
        impact: getPerpTakerFeeImpact(contract),
      })
      expect(expected).toBeCloseTo(charged.effectiveBps, 8)
    }
  })

  it('reports no separate API rate when one is not configured', () => {
    // Announcing an API rate identical to the base reads as a bug, so the
    // surfaces gate on this rather than on "is takerFeeApiBps present".
    const s = perpFeeScheduleSummary({ takerFeeBps: 10, takerFeeImpact: 10 })
    expect(s.apiBps).toBe(10)
    expect(s.apiDiffers).toBe(false)
    expect(s.apiPoolSizedBps).toBeCloseTo(s.poolSizedBps, 10)
    // max(base, api) — a misconfigured API rate below base never discounts.
    const low = perpFeeScheduleSummary({ takerFeeBps: 10, takerFeeApiBps: 4 })
    expect(low.apiBps).toBe(10)
    expect(low.apiDiffers).toBe(false)
  })

  it('reads defaults for an unstamped contract and flags a flat schedule', () => {
    const s = perpFeeScheduleSummary({})
    expect(s.baseBps).toBe(PERP_TAKER_FEE_BPS_DEFAULT)
    expect(s.impact).toBe(PERP_TAKER_FEE_IMPACT_DEFAULT)
    expect(s.hasSizeTerm).toBe(false)
    // With no size term every example collapses to the base.
    expect(s.poolSizedBps).toBe(s.baseBps)
    expect(s.fourTimesPoolBps).toBe(s.baseBps)
  })

  it('is total: corrupt config reads as the defaults rather than throwing', () => {
    const s = perpFeeScheduleSummary({
      takerFeeBps: NaN,
      takerFeeApiBps: -1,
      takerFeeImpact: 1e9,
    })
    expect(s.baseBps).toBe(PERP_TAKER_FEE_BPS_DEFAULT)
    expect(s.impact).toBe(PERP_TAKER_FEE_IMPACT_DEFAULT)
    expect(Number.isFinite(s.poolSizedBps)).toBe(true)
    expect(Number.isFinite(s.apiFourTimesPoolBps)).toBe(true)
  })

  it('works the examples at the shares the copy actually names', () => {
    expect(PERP_FEE_EXAMPLE_POOL_SHARES).toEqual([1, 4])
  })

  it('stays silent about the API channel when the gap vanishes in formatting', () => {
    // The regression this guards: apiDiffers compared raw bps, so base 10 vs
    // API 10.1 — a real difference the engine charges — turned on a second
    // sentence in which EVERY figure rendered identically to the first.
    const s = perpFeeScheduleSummary({
      takerFeeBps: 10,
      takerFeeApiBps: 10.1,
      takerFeeImpact: 10,
    })
    expect(s.apiBps).toBeGreaterThan(s.baseBps) // the raw gap is real
    expect(formatFeePct(s.apiBps)).toBe(formatFeePct(s.baseBps))
    expect(formatFeePct(s.apiPoolSizedBps)).toBe(formatFeePct(s.poolSizedBps))
    expect(formatFeePct(s.apiFourTimesPoolBps)).toBe(
      formatFeePct(s.fourTimesPoolBps)
    )
    expect(s.apiDiffers).toBe(false) // ...but there is nothing to SAY
  })

  it('speaks up as soon as one rendered figure separates', () => {
    const s = perpFeeScheduleSummary({
      takerFeeBps: 10,
      takerFeeApiBps: 30,
      takerFeeImpact: 10,
    })
    expect(s.apiDiffers).toBe(true)
    expect(formatFeePct(s.apiPoolSizedBps)).not.toBe(
      formatFeePct(s.poolSizedBps)
    )
  })
})
