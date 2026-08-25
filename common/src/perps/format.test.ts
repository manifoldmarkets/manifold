import { formatFeePct } from './format'

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
