import {
  isEligiblePerpTick,
  MNX_SOURCE_CLOCK_ALLOWANCE_MS as ALLOWANCE,
  perpEligibilityCutoff,
} from './orders'

describe('next-price eligibility', () => {
  it('requires an observation strictly after commitment, including unchanged prices', () => {
    expect(isEligiblePerpTick('btc-usd', 100, { ts: 100, price: 50 })).toBe(
      false
    )
    expect(isEligiblePerpTick('btc-usd', 100, { ts: 101, price: 50 })).toBe(
      true
    )
  })
  it('does not mistake a newly received cached MNX mark for a future source observation', () => {
    const ts = 100 + ALLOWANCE + 500
    expect(
      isEligiblePerpTick('mnx-openai-mark', 100, {
        ts,
        sourceTs: 99,
        price: 50,
      })
    ).toBe(false)
    expect(
      isEligiblePerpTick('mnx-openai-mark', 100, {
        ts,
        sourceTs: 101 + ALLOWANCE,
        price: 50,
      })
    ).toBe(true)
    expect(
      isEligiblePerpTick('mnx-openai-mark', 100, {
        ts,
        sourceTs: ts + 1,
        price: 50,
      })
    ).toBe(false)
  })
  it("leaves room for MNX's clock running ahead of ours", () => {
    // Stamped after the order by MNX's clock, but within the lead it shows.
    expect(
      isEligiblePerpTick('mnx-openai-mark', 100, {
        ts: 100 + ALLOWANCE + 500,
        sourceTs: 100 + ALLOWANCE,
        price: 50,
      })
    ).toBe(false)
  })
  it('does not interpret the reporting day on daily metrics as publication time', () => {
    expect(
      isEligiblePerpTick('trump-approval-rating', 100, {
        ts: 101,
        sourceTs: 1,
        price: 50,
      })
    ).toBe(true)
  })
  it.each([NaN, Infinity, 0, -1])('rejects invalid prices %s', (price) => {
    expect(isEligiblePerpTick('btc-usd', 100, { ts: 101, price })).toBe(false)
  })
})

describe('next-price eligibility cutoff', () => {
  it('is the latest creation time a point can fill, as the predicate decides', () => {
    expect(perpEligibilityCutoff('btc-usd', { ts: 500, price: 1 })).toBe(500)
    expect(
      perpEligibilityCutoff('mnx-openai-mark', {
        ts: 10_000,
        sourceTs: 9_000,
        price: 1,
      })
    ).toBe(9_000 - ALLOWANCE)
    expect(
      perpEligibilityCutoff('mnx-openai-mark', {
        ts: 1_000,
        sourceTs: 1_000 + ALLOWANCE + 1,
        price: 1,
      })
    ).toBeNull()
    expect(
      perpEligibilityCutoff('mnx-openai-mark', { ts: 1_000, price: 1 })
    ).toBeNull()
    expect(perpEligibilityCutoff('btc-usd', { ts: NaN, price: 1 })).toBeNull()
    for (const created of [0, 4_999, 5_000, 6_999, 7_000])
      for (const point of [
        { ts: 7_000, price: 1 },
        { ts: 9_000, sourceTs: 7_000, price: 1 },
        { ts: 9_000, sourceTs: 9_001, price: 1 },
      ])
        for (const feed of ['btc-usd', 'mnx-openai-mark']) {
          const cutoff = perpEligibilityCutoff(feed, point)
          expect(isEligiblePerpTick(feed, created, point)).toBe(
            cutoff != null && created < cutoff
          )
        }
  })
})
