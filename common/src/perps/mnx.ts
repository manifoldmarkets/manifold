import { HOUR_MS, MINUTE_MS } from '../util/time'

export const MNX_API_URL = 'https://api.app.mnx.fi/v0'
export const MNX_POLL_MS = 2_000
export const MNX_CHECK_MAX_AGE_MS = 5 * MINUTE_MS

// Stable provider IDs and explicit feed IDs prevent silently rolling a delisted
// instrument into a new market. Bounds are in the displayed units and reject
// cents/dollars or billions/dollars scaling mistakes; reviewed September 2026.
const instruments = [
  ['ANTHROPIC', 'Anthropic', 'valuation', 11, 'mnx-anthropic-mark', 100, 20000],
  ['OPENAI', 'OpenAI', 'valuation', 12, 'mnx-openai-mark', 100, 20000],
  ['DEEPSEEK', 'DeepSeek', 'valuation', 15, 'mnx-deepseek-mark', 10, 5000],
  ['MOONSHOT', 'Moonshot AI', 'valuation', 21, 'mnx-moonshot-mark', 10, 3000],
  ['H100', 'H100 GPU rental', 'compute', 19, 'mnx-h100-mark', 0.1, 100],
  ['ASML', 'ASML', 'equity', 14, 'mnx-asml-mark', 100, 20000],
  ['CRWV', 'CoreWeave', 'equity', 9, 'mnx-crwv-mark', 5, 1000],
  ['DRAM', 'Roundhill Memory ETF', 'equity', 17, 'mnx-dram-mark', 5, 1000],
  ['GOOGL', 'Alphabet', 'equity', 18, 'mnx-googl-mark', 20, 3000],
  ['META', 'Meta', 'equity', 20, 'mnx-meta-mark', 50, 5000],
  ['MINIMAX', 'MiniMax', 'equity', 27, 'mnx-minimax-mark', 2, 1000],
  ['MU', 'Micron', 'equity', 22, 'mnx-mu-mark', 50, 10000],
  ['SNDK', 'Sandisk', 'equity', 25, 'mnx-sndk-mark', 50, 15000],
  ['SPCX', 'SpaceX', 'equity', 10, 'mnx-spcx-mark', 10, 2500],
  ['TSM', 'TSMC', 'equity', 26, 'mnx-tsm-mark', 20, 5000],
  ['ZAI', 'Z.AI', 'equity', 28, 'mnx-zai-mark', 5, 2000],
] as const

export const MNX_INSTRUMENTS = instruments.map(
  ([symbol, name, category, marketId, feedId, minPrice, maxPrice]) => {
    const slug = symbol.toLowerCase()
    const valuation = category === 'valuation'
    return {
      symbol,
      marketId,
      name,
      category,
      slug,
      feedId,
      type: valuation ? ('future' as const) : ('perpetual' as const),
      priceDisplay: valuation ? ('billion_usd' as const) : ('usd' as const),
      url: `https://app.mnx.fi/trade/${slug}`,
      // H100 is an hourly index: MNX documents a 75-minute freshness gate.
      maxAgeMs: category === 'compute' ? 75 * MINUTE_MS : 5 * MINUTE_MS,
      updatePeriodMs: category === 'compute' ? HOUR_MS : MINUTE_MS,
      minPrice,
      maxPrice,
      question: valuation
        ? `${name} — MNX valuation futures price (USD billions)`
        : `${name} — MNX mark price (${symbol}, USD)`,
      description: valuation
        ? `Tracks the MNX ${name} valuation futures mark price, in billions of US dollars. This is a futures price, not a stock price or a confirmed current company valuation. MNX's contract references market capitalization after IPO, or the last public valuation if no listing happens before 2028.`
        : category === 'compute'
        ? 'Tracks the MNX H100 rental-price mark in USD. MNX references the SemiAnalysis H100 Selected Spot Rental Price Index. This measures GPU rental prices, not the purchase price of a GPU.'
        : `Tracks the MNX ${symbol} market mark price in USD. This is the price of the MNX derivative; it can differ from the underlying share price.`,
    }
  }
)

export type MnxInstrument = (typeof MNX_INSTRUMENTS)[number]
export const getMnxInstrument = (feedId: string | undefined) =>
  MNX_INSTRUMENTS.find((instrument) => instrument.feedId === feedId)
