import { DAY_MS, HOUR_MS, MINUTE_MS } from '../util/time'

export const MNX_API_URL = 'https://api.app.mnx.fi/v0'
export const MNX_POLL_MS = MINUTE_MS
export const MNX_CHECK_MAX_AGE_MS = 5 * MINUTE_MS

const instruments = [
  ['ANTHROPIC', 'Anthropic', 'valuation'],
  ['OPENAI', 'OpenAI', 'valuation'],
  ['DEEPSEEK', 'DeepSeek', 'valuation'],
  ['MOONSHOT', 'Moonshot AI', 'valuation'],
  ['H100', 'H100 GPU rental', 'compute'],
  ['ASML', 'ASML', 'equity'],
  ['CRWV', 'CoreWeave', 'equity'],
  ['DRAM', 'Roundhill Memory ETF', 'equity'],
  ['GOOGL', 'Alphabet', 'equity'],
  ['META', 'Meta', 'equity'],
  ['MINIMAX', 'MiniMax', 'equity'],
  ['MU', 'Micron', 'equity'],
  ['SNDK', 'Sandisk', 'equity'],
  ['SPCX', 'SpaceX', 'equity'],
  ['TSM', 'TSMC', 'equity'],
  ['ZAI', 'Z.AI', 'equity'],
] as const

export const MNX_INSTRUMENTS = instruments.map(([symbol, name, category]) => {
  const slug = symbol.toLowerCase()
  const valuation = category === 'valuation'
  return {
    symbol,
    name,
    category,
    slug,
    feedId: `mnx-${slug}-mark`,
    type: valuation ? ('future' as const) : ('perpetual' as const),
    priceDisplay: valuation ? ('billion_usd' as const) : ('usd' as const),
    url: `https://app.mnx.fi/trade/${slug}`,
    maxAgeMs: category === 'compute' ? DAY_MS : 5 * MINUTE_MS,
    updatePeriodMs: category === 'compute' ? HOUR_MS : MINUTE_MS,
    minPrice: 0.000001,
    maxPrice: valuation
      ? 1_000_000
      : category === 'compute'
      ? 10_000
      : 10_000_000,
    question: valuation
      ? `${name} — MNX valuation futures price (USD billions)`
      : `${name} — MNX mark price (${symbol}, USD)`,
    description: valuation
      ? `Tracks the MNX ${name} valuation futures mark price, in billions of US dollars. This is a futures price, not a stock price or a confirmed current company valuation. MNX's contract references market capitalization after IPO, or the last public valuation if no listing happens before 2028.`
      : category === 'compute'
      ? 'Tracks the MNX H100 rental-price mark in USD. MNX references the SemiAnalysis H100 Selected Spot Rental Price Index. This measures GPU rental prices, not the purchase price of a GPU.'
      : `Tracks the MNX ${symbol} market mark price in USD. This is the price of the MNX derivative; it can differ from the underlying share price.`,
  }
})

export type MnxInstrument = (typeof MNX_INSTRUMENTS)[number]
export const getMnxInstrument = (feedId: string | undefined) =>
  MNX_INSTRUMENTS.find((instrument) => instrument.feedId === feedId)

// Independently ordered from the price: a frozen flag or successful check can
// change while an hourly H100 price retains its original timestamp.
export type OracleFeedHealth = {
  checkedAt: number
  status: 'available' | 'unavailable'
  reason?: string
  priceTime?: number
  price?: number
}

export const getMnxTradingPauseReason = (
  contract: {
    oracleFeedId: string
    oracleFeedHealth?: OracleFeedHealth
    oraclePrice: number
    oraclePriceTime?: number
  },
  now = Date.now()
): string | null => {
  const instrument = getMnxInstrument(contract.oracleFeedId)
  if (!instrument) return null
  const health = contract.oracleFeedHealth
  if (
    !health ||
    !Number.isFinite(health.checkedAt) ||
    health.checkedAt <= 0 ||
    health.checkedAt > now + MINUTE_MS ||
    now - health.checkedAt > MNX_CHECK_MAX_AGE_MS
  )
    return 'MNX feed checks are unavailable or more than five minutes old'
  if (health.status !== 'available')
    return health.reason ?? 'MNX market unavailable'
  if (
    health.priceTime !== contract.oraclePriceTime ||
    health.price !== contract.oraclePrice
  )
    return 'Waiting for the latest MNX price to be applied'
  if (
    !health.priceTime ||
    health.priceTime > now + MINUTE_MS ||
    now - health.priceTime > instrument.maxAgeMs
  )
    return 'MNX source price is stale or its timestamp is invalid'
  return null
}
