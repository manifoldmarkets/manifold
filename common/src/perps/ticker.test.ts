import {
  PERP_FEED_TICKERS,
  PERP_TICKER_MAX_LENGTH,
  derivePerpTicker,
  getPerpFeedTicker,
  getPerpTicker,
  isPerpTickerSearchTerm,
  isValidPerpTicker,
} from './ticker'

describe('isValidPerpTicker', () => {
  it('accepts one alphanumeric token that starts with a letter', () => {
    expect(isValidPerpTicker('BTC')).toBe(true)
    expect(isValidPerpTicker('SPYx')).toBe(true)
    expect(isValidPerpTicker('UKCO2')).toBe(true)
    expect(isValidPerpTicker('A')).toBe(true)
    expect(isValidPerpTicker('ABCDEFGH')).toBe(true)
  })

  it('rejects spaces, symbols, bare numbers, empties and overlong labels', () => {
    expect(isValidPerpTicker('')).toBe(false)
    expect(isValidPerpTicker('BTC USD')).toBe(false)
    expect(isValidPerpTicker('$BTC')).toBe(false)
    expect(isValidPerpTicker('BTC-USD')).toBe(false)
    expect(isValidPerpTicker('2026')).toBe(false)
    expect(isValidPerpTicker('ABCDEFGHI')).toBe(false)
    expect(isValidPerpTicker(' BTC')).toBe(false)
  })
})

describe('PERP_FEED_TICKERS', () => {
  it('names every feed with a valid ticker', () => {
    for (const [feedId, ticker] of Object.entries(PERP_FEED_TICKERS)) {
      expect([feedId, isValidPerpTicker(ticker)]).toEqual([feedId, true])
      expect(ticker.length).toBeLessThanOrEqual(PERP_TICKER_MAX_LENGTH)
    }
  })

  it('never gives two feeds the same ticker, even ignoring case', () => {
    const tickers = Object.values(PERP_FEED_TICKERS).map((t) =>
      t.toLowerCase()
    )
    expect(new Set(tickers).size).toBe(tickers.length)
  })

  it('keeps the launch tickers the hub has always shown', () => {
    expect(getPerpFeedTicker('btc-usd')).toBe('BTC')
    expect(getPerpFeedTicker('trump-approval-rating')).toBe('TRUMP')
    expect(getPerpFeedTicker('spyx-usd')).toBe('SPYx')
    expect(getPerpFeedTicker('nonexistent-feed')).toBeUndefined()
    expect(getPerpFeedTicker(undefined)).toBeUndefined()
  })
})

describe('derivePerpTicker', () => {
  it('uses the leading segment of the feed id, upper-cased and capped', () => {
    expect(derivePerpTicker('btc-usd')).toBe('BTC')
    expect(derivePerpTicker('votehub-generic-ballot-2026')).toBe('VOTEHU')
    expect(derivePerpTicker('eth')).toBe('ETH')
  })

  it('always yields something a badge can show', () => {
    expect(derivePerpTicker('')).toBe('PERP')
    expect(derivePerpTicker('2026-midterms')).toBe('MIDTER')
    expect(derivePerpTicker('$$$-usd')).toBe('PERP')
    expect(isValidPerpTicker(derivePerpTicker('s&p500-usd'))).toBe(true)
  })
})

describe('getPerpTicker', () => {
  it('prefers the stored ticker, which is what search matches', () => {
    expect(
      getPerpTicker({ ticker: 'BTC2', oracleFeedId: 'btc-usd', slug: 'x' })
    ).toBe('BTC2')
  })

  it('falls back to the canonical map for rows stored before the field', () => {
    expect(getPerpTicker({ oracleFeedId: 'crypto-fear-greed' })).toBe('FEAR')
    expect(getPerpTicker({ ticker: '', oracleFeedId: 'gldx-usd' })).toBe(
      'GLDx'
    )
  })

  it('derives a label for a feed nobody has named', () => {
    expect(getPerpTicker({ oracleFeedId: 'eth-usd' })).toBe('ETH')
    expect(getPerpTicker({ slug: 'some-prototype-market' })).toBe('SOME')
    expect(getPerpTicker({})).toBe('PERP')
  })
})

describe('isPerpTickerSearchTerm', () => {
  it('accepts a single token a trader might type for a ticker', () => {
    expect(isPerpTickerSearchTerm('btc')).toBe(true)
    expect(isPerpTickerSearchTerm('BT')).toBe(true)
    expect(isPerpTickerSearchTerm('  spyx ')).toBe(true)
  })

  it('rejects multi-word queries, numbers and anything longer than a ticker', () => {
    expect(isPerpTickerSearchTerm('trump approval')).toBe(false)
    expect(isPerpTickerSearchTerm('2026')).toBe(false)
    expect(isPerpTickerSearchTerm('')).toBe(false)
    expect(isPerpTickerSearchTerm('perpetuals')).toBe(false)
    expect(isPerpTickerSearchTerm('https://manifold.markets/x')).toBe(false)
  })
})
