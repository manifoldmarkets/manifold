import { isEligiblePerpTick } from './orders'

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
    expect(
      isEligiblePerpTick('mnx-openai-mark', 100, {
        ts: 200,
        sourceTs: 99,
        price: 50,
      })
    ).toBe(false)
    expect(
      isEligiblePerpTick('mnx-openai-mark', 100, {
        ts: 200,
        sourceTs: 101,
        price: 50,
      })
    ).toBe(true)
    expect(
      isEligiblePerpTick('mnx-openai-mark', 100, {
        ts: 200,
        sourceTs: 201,
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
