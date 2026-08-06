import { formatOraclePriceTick, inferPriceTickDecimals } from './oracle-display'

describe('oracle display', () => {
  it('formats known feed units without inferring from the market title', () => {
    expect(formatOraclePriceTick('btc-usd', 63_000, 1_000)).toBe('$63,000')
    expect(formatOraclePriceTick('trump-approval-rating', 38.5, 0.5)).toBe(
      '38.5%'
    )
    expect(formatOraclePriceTick('openrouter-open-weight-share', 42, 1)).toBe(
      '42%'
    )
  })

  it('uses plain numeric labels for unit-bearing and unknown feeds', () => {
    expect(formatOraclePriceTick('uk-grid-carbon', 120, 20)).toBe('120')
    expect(formatOraclePriceTick('future-feed', 12.25, 0.25)).toBe('12.3')
  })

  it('keeps small tick steps distinct and handles invalid values defensively', () => {
    expect(inferPriceTickDecimals(1_000)).toBe(0)
    expect(inferPriceTickDecimals(0.5)).toBe(1)
    expect(inferPriceTickDecimals(0.002)).toBe(3)
    expect(formatOraclePriceTick('btc-usd', Number.NaN, 1)).toBe('—')
  })
})
