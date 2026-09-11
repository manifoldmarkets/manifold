import {
  MAX_PLAUSIBLE_EUR_USD,
  MAX_QUOTE_SPREAD_FRAC,
  MIN_PLAUSIBLE_EUR_USD,
  eurUsdFromBtcLegs,
  isPlausibleEurUsd,
  parseTwoSidedMid,
} from './fx-cross'

describe('parseTwoSidedMid', () => {
  it('takes the midpoint of a healthy book', () => {
    expect(parseTwoSidedMid(1.1631, 1.1635)).toBeCloseTo(1.1633, 10)
  })

  it('accepts the decimal strings venues actually serve', () => {
    // Kraken and Bitstamp both stringify prices; a parser that only took
    // numbers would silently drop every vote.
    expect(parseTwoSidedMid('1.1631', '1.1635')).toBeCloseTo(1.1633, 10)
  })

  it('rejects a crossed book', () => {
    // Either corrupt data or a venue mid-glitch. Never a price.
    expect(parseTwoSidedMid(1.1635, 1.1631)).toBeNull()
  })

  it('accepts a locked book', () => {
    // bid == ask is degenerate but not wrong, and its mid is unambiguous.
    expect(parseTwoSidedMid(1.1633, 1.1633)).toBe(1.1633)
  })

  it('rejects a spread wider than the tolerance', () => {
    // 2% apart: the midpoint would be a level neither side will trade at.
    expect(parseTwoSidedMid(1.15, 1.173)).toBeNull()
  })

  it('draws the line at the tolerance, measured against the mid', () => {
    // 1.00/1.01 is a 1% spread on the BID but 0.995% on the mid, so it
    // survives a 1% tolerance; widening it a hundredth of a pip does not.
    expect(MAX_QUOTE_SPREAD_FRAC).toBe(0.01)
    expect(parseTwoSidedMid(1, 1.01)).toBe(1.005)
    expect(parseTwoSidedMid(1, 1.0101)).toBeNull()
  })

  it('honours a caller-supplied tolerance', () => {
    expect(parseTwoSidedMid(1.15, 1.173, 0.05)).toBeCloseTo(1.1615, 10)
  })

  it.each([
    ['missing bid', undefined, 1.1635],
    ['missing ask', 1.1631, undefined],
    ['null bid', null, 1.1635],
    ['zero ask', 1.1631, 0],
    ['negative bid', -1.1631, 1.1635],
    ['empty string', '', 1.1635],
    ['whitespace', '   ', 1.1635],
    ['non-numeric', 'n/a', 1.1635],
    ['object', {}, 1.1635],
  ])('rejects %s', (_label, bid, ask) => {
    expect(parseTwoSidedMid(bid, ask)).toBeNull()
  })
})

describe('eurUsdFromBtcLegs', () => {
  it('divides the USD leg by the EUR leg', () => {
    // 100,000 EUR per BTC and 116,340 USD per BTC means a euro costs $1.1634.
    expect(eurUsdFromBtcLegs(100_000, 116_340)).toBeCloseTo(1.1634, 10)
  })

  it('does not silently invert', () => {
    // The whole point of having one tested helper: a transposed call site
    // produces a number that is inside every plausibility band we could
    // honestly set, so this is the only place the direction can be pinned.
    expect(eurUsdFromBtcLegs(116_340, 100_000)).toBeCloseTo(0.85955, 5)
  })

  it.each([
    ['zero EUR leg', 0, 116_340],
    ['zero USD leg', 100_000, 0],
    ['negative leg', -100_000, 116_340],
    ['NaN leg', Number.NaN, 116_340],
    ['infinite leg', Number.POSITIVE_INFINITY, 116_340],
  ])('rejects %s', (_label, btcEur, btcUsd) => {
    expect(eurUsdFromBtcLegs(btcEur, btcUsd)).toBeNull()
  })
})

describe('isPlausibleEurUsd', () => {
  it('accepts every level the euro has actually traded at', () => {
    for (const rate of [0.82, 1, 1.1634, 1.6]) {
      expect(isPlausibleEurUsd(rate)).toBe(true)
    }
  })

  it('accepts its own boundaries', () => {
    expect(isPlausibleEurUsd(MIN_PLAUSIBLE_EUR_USD)).toBe(true)
    expect(isPlausibleEurUsd(MAX_PLAUSIBLE_EUR_USD)).toBe(true)
  })

  it('catches unit confusion', () => {
    expect(isPlausibleEurUsd(116.34)).toBe(false) // cents
    expect(isPlausibleEurUsd(0.0116)).toBe(false) // scaled down
    expect(isPlausibleEurUsd(0)).toBe(false)
    expect(isPlausibleEurUsd(-1.1634)).toBe(false)
    expect(isPlausibleEurUsd(Number.NaN)).toBe(false)
  })

  it('does NOT catch an inverted quote, by design', () => {
    // Documented rather than aspirational: 1/1.1634 is a plausible EUR/USD
    // level, so inversion has to be caught by cross-venue disagreement and by
    // eurUsdFromBtcLegs being the single crossing helper.
    expect(isPlausibleEurUsd(1 / 1.1634)).toBe(true)
  })
})
