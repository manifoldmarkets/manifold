import { readGateTickerMid } from './xstocks'

// Fixture is a trimmed capture of a real Gate response (probed 2026-08-07),
// so the test pins the actual wire shape: numeric strings.
const gateSpyx = [
  {
    currency_pair: 'SPYX_USDT',
    last: '774.69',
    lowest_ask: '774.69',
    highest_bid: '774.57',
    base_volume: '542.206',
    quote_volume: '419995.07769',
  },
]

describe('readGateTickerMid', () => {
  it('returns the bid/ask mid of a two-sided book', () => {
    expect(readGateTickerMid(gateSpyx)).toBeCloseTo((774.57 + 774.69) / 2, 10)
  })

  it('falls back to last on a one-sided book', () => {
    expect(
      readGateTickerMid([
        { last: '774.69', lowest_ask: '', highest_bid: '774.57' },
      ])
    ).toBe(774.69)
    expect(readGateTickerMid([{ last: '774.69', highest_bid: '774.57' }])).toBe(
      774.69
    )
  })

  it('falls back to last on a crossed snapshot', () => {
    expect(
      readGateTickerMid([
        { last: '774.69', lowest_ask: '770.00', highest_bid: '775.00' },
      ])
    ).toBe(774.69)
  })

  it('returns NaN for an empty or malformed response', () => {
    expect(readGateTickerMid([])).toBeNaN()
    expect(readGateTickerMid(null)).toBeNaN()
    expect(readGateTickerMid({})).toBeNaN()
    expect(
      readGateTickerMid([{ last: '0', lowest_ask: '', highest_bid: '' }])
    ).toBeNaN()
  })
})
