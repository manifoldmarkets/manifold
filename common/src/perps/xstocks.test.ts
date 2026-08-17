import {
  readGateTickerMid,
  readJupiterRawUsdPrice,
  readMexcBookTickerMid,
} from './xstocks'

// Fixtures are trimmed captures of real venue responses (probed 2026-08-07),
// so the tests pin the actual wire shapes: Jupiter returns numbers, Gate and
// MEXC return numeric strings.

const SPYX_MINT = 'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W'
const GLDX_MINT = 'Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re'

const jupiterSpyx = {
  [SPYX_MINT]: {
    usdPrice: 769.6353991512417,
    decimals: 8,
    scaledUiConfig: {
      multiplier: 1.003909240011759,
      newMultiplier: 1.005714560286254,
      usdPricePrescaled: 774.0335270381266,
    },
  },
}

const jupiterGldx = {
  [GLDX_MINT]: {
    usdPrice: 394.2284266101142,
    decimals: 8,
    // No scaledUiConfig: GLD pays no dividends, so the token never rebases.
  },
}

describe('readJupiterRawUsdPrice', () => {
  it('prefers the prescaled (raw-unit) price when the token rebases', () => {
    // The scaled usdPrice (769.64) is a real price for a DIFFERENT unit than
    // CEX books trade; choosing it would bias the composite by the accrued
    // dividend multiplier without tripping the consensus gate.
    expect(readJupiterRawUsdPrice(jupiterSpyx, SPYX_MINT, 'rebasing')).toBe(
      774.0335270381266
    )
  })

  it('falls back to usdPrice for tokens without the scaled-ui extension', () => {
    expect(readJupiterRawUsdPrice(jupiterGldx, GLDX_MINT, 'static')).toBe(
      394.2284266101142
    )
  })

  // A rebasing token must NOT fall back to usdPrice. That price is real, but
  // denominated per SCALED unit, so pairing it with a raw-token CEX quote
  // biases the composite by the accrued-dividend multiplier (~0.5% on SPYx)
  // -- well inside the 2% consensus tolerance, and on a two-source feed
  // getConsensusMedian averages the pair straight into the executable mark.
  it('returns NaN for a rebasing token when the prescaled price is unusable', () => {
    const body = {
      [SPYX_MINT]: { usdPrice: 770, scaledUiConfig: { usdPricePrescaled: 0 } },
    }
    expect(readJupiterRawUsdPrice(body, SPYX_MINT, 'rebasing')).toBeNaN()
  })

  it('returns NaN for a rebasing token with no scaledUiConfig at all', () => {
    // Jupiter's documented price schema does not guarantee the scaled
    // metadata, so a schema change or partial response lands here.
    expect(
      readJupiterRawUsdPrice(
        { [SPYX_MINT]: { usdPrice: 770 } },
        SPYX_MINT,
        'rebasing'
      )
    ).toBeNaN()
  })

  it('lets a static token fall back to usdPrice', () => {
    expect(
      readJupiterRawUsdPrice(
        {
          [GLDX_MINT]: {
            usdPrice: 394.5,
            scaledUiConfig: { usdPricePrescaled: 0 },
          },
        },
        GLDX_MINT,
        'static'
      )
    ).toBe(394.5)
  })

  it('prefers prescaled even for a static token, so one that starts rebasing still reads right', () => {
    expect(
      readJupiterRawUsdPrice(
        {
          [GLDX_MINT]: {
            usdPrice: 394.2,
            scaledUiConfig: { usdPricePrescaled: 396.1 },
          },
        },
        GLDX_MINT,
        'static'
      )
    ).toBe(396.1)
  })

  it('returns NaN when the mint is absent or the body is malformed', () => {
    expect(readJupiterRawUsdPrice(jupiterSpyx, GLDX_MINT, 'rebasing')).toBeNaN()
    expect(readJupiterRawUsdPrice({}, SPYX_MINT, 'rebasing')).toBeNaN()
    expect(readJupiterRawUsdPrice(null, SPYX_MINT, 'rebasing')).toBeNaN()
    expect(
      readJupiterRawUsdPrice([jupiterSpyx], SPYX_MINT, 'rebasing')
    ).toBeNaN()
    expect(readJupiterRawUsdPrice('774', SPYX_MINT, 'rebasing')).toBeNaN()
  })

  it('returns NaN for non-positive or non-finite prices', () => {
    expect(
      readJupiterRawUsdPrice(
        { [SPYX_MINT]: { usdPrice: 0 } },
        SPYX_MINT,
        'static'
      )
    ).toBeNaN()
    expect(
      readJupiterRawUsdPrice(
        { [SPYX_MINT]: { usdPrice: -5 } },
        SPYX_MINT,
        'static'
      )
    ).toBeNaN()
    expect(
      readJupiterRawUsdPrice(
        { [SPYX_MINT]: { usdPrice: Number.POSITIVE_INFINITY } },
        SPYX_MINT,
        'static'
      )
    ).toBeNaN()
  })
})

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

describe('readMexcBookTickerMid', () => {
  it('returns the bid/ask mid', () => {
    expect(
      readMexcBookTickerMid({ bidPrice: '773.30', askPrice: '773.54' })
    ).toBeCloseTo((773.3 + 773.54) / 2, 10)
  })

  it('returns NaN rather than guessing on one-sided, crossed, or malformed books', () => {
    expect(
      readMexcBookTickerMid({ bidPrice: '773.30', askPrice: '0' })
    ).toBeNaN()
    expect(
      readMexcBookTickerMid({ bidPrice: '775', askPrice: '770' })
    ).toBeNaN()
    expect(
      readMexcBookTickerMid({ msg: 'invalid symbol', code: -1121 })
    ).toBeNaN()
    expect(readMexcBookTickerMid(null)).toBeNaN()
  })
})
