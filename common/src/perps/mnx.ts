import { HOUR_MS, MINUTE_MS } from '../util/time'

export const MNX_API_URL = 'https://api.app.mnx.fi/v0'
export const MNX_POLL_MS = 2_000

// Opening fees in bps of notional; impact is the size-fee coefficient.
export const MNX_DEFAULT_FEES = {
  takerFeeBps: 10,
  takerFeeApiBps: 20,
  takerFeeImpact: 10,
} as const

// Stable provider IDs and explicit feed IDs prevent silently rolling a delisted
// instrument into a new market. Bounds are in the displayed units and reject
// gross scaling mistakes; currency identity is pinned separately (USD vs HKD
// cannot be inferred from price bounds). Moonshot allows a sub-$10B valuation.
// ANT's floor is MNX's own minimum order price for that market ($10).
const instruments = [
  ['OPENAI', 'OpenAI', 'valuation', 12, 'mnx-openai-mark', 100, 20000],
  ['DEEPSEEK', 'DeepSeek', 'valuation', 15, 'mnx-deepseek-mark', 10, 5000],
  ['MOONSHOT', 'Moonshot AI', 'valuation', 21, 'mnx-moonshot-mark', 1, 3000],
  ['H100', 'H100 GPU rental', 'compute', 19, 'mnx-h100-mark', 0.1, 100],
  ['ANT', 'Anthropic', 'equity', 86, 'mnx-ant-mark', 10, 2000],
  ['ASML', 'ASML', 'equity', 14, 'mnx-asml-mark', 100, 20000],
  ['CRWV', 'CoreWeave', 'equity', 9, 'mnx-crwv-mark', 5, 1000],
  ['DRAM', 'Roundhill Memory ETF', 'equity', 17, 'mnx-dram-mark', 5, 1000],
  ['GOOGL', 'Alphabet', 'equity', 18, 'mnx-googl-mark', 20, 3000],
  ['META', 'Meta', 'equity', 20, 'mnx-meta-mark', 50, 5000],
  ['MINIMAX', 'MiniMax', 'equity', 27, 'mnx-minimax-mark', 2, 1000],
  ['MU', 'Micron', 'equity', 22, 'mnx-mu-mark', 50, 10000],
  ['SPCX', 'SpaceX', 'equity', 10, 'mnx-spcx-mark', 10, 2500],
  ['TSM', 'TSMC', 'equity', 26, 'mnx-tsm-mark', 20, 5000],
  ['ZAI', 'Z.AI', 'equity', 28, 'mnx-zai-mark', 5, 2000],
] as const

// Instruments MNX has delisted. Each keeps its entry so the settled market's
// chart, ticker, price units and source credit still resolve, but its feed is
// retired in the oracle registry: nothing polls, probes or alerts on it, the
// snapshot parser skips it, and create-perp refuses it. Never point a retired
// feed id at a different MNX market; a successor gets its own row above.
const delisted = [
  ['ANTHROPIC', 'Anthropic', 'valuation', 11, 'mnx-anthropic-mark', 100, 20000],
  ['SNDK', 'Sandisk', 'equity', 25, 'mnx-sndk-mark', 50, 15000],
] as const

export type MnxRetirement = { at: number; reason: string }

const retirements: Record<(typeof delisted)[number][0], MnxRetirement> = {
  ANTHROPIC: {
    at: Date.UTC(2026, 10, 20, 4, 32, 26),
    reason:
      'Anthropic listed on Nasdaq on 2026-11-19 and MNX delisted its pre-IPO valuation future (MNX market 11); prod market lnccuhNtuCC9 settled 2026-11-20 at 1706. Successor: the ANT share perpetual (mnx-ant-mark).',
  },
  SNDK: {
    at: Date.UTC(2026, 10, 20, 4, 42, 39),
    reason:
      'MNX delisted its Sandisk perpetual (MNX market 25) on 2026-11-19 at 23:23 UTC, settling at $755.16; prod market Ugs9l2d8Pd0Q settled 2026-11-20 at 754, its last mark. No successor.',
  },
}
const getRetirement = (symbol: string): MnxRetirement | undefined =>
  (retirements as Partial<Record<string, MnxRetirement>>)[symbol]

export const MNX_INSTRUMENTS = [...instruments, ...delisted].map(
  ([symbol, name, category, marketId, feedId, minPrice, maxPrice]) => {
    const slug = symbol.toLowerCase()
    const valuation = category === 'valuation'
    return {
      symbol,
      retired: getRetirement(symbol),
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
        ? `${name} IPO Market Cap (MNX)`
        : category === 'compute'
        ? 'H100 GPU rental price (MNX)'
        : `${name} (MNX)`,
      description: valuation
        ? `Tracks MNX futures contract on ${name}'s market capitalization after IPO — or its last public valuation if no listing happens before 2028 — in billions of US dollars.`
        : category === 'compute'
        ? 'Tracks the MNX perpetual on the rental price of NVIDIA H100 GPUs, as measured by the SemiAnalysis H100 Selected Spot Rental Price Index.'
        : `Tracks the MNX perpetual on one share of ${
            symbol === 'SNDK'
              ? 'Sandisk Corporation'
              : symbol === 'ANT'
              ? 'Anthropic, PBC Class A common stock'
              : name
          } (${symbol}).`,
    }
  }
)

/** Instruments MNX still lists: the ones to poll, backfill and create. */
export const MNX_LIVE_INSTRUMENTS = MNX_INSTRUMENTS.filter((i) => !i.retired)

export type MnxInstrument = (typeof MNX_INSTRUMENTS)[number]
export const getMnxInstrument = (feedId: string | undefined) =>
  MNX_INSTRUMENTS.find((instrument) => instrument.feedId === feedId)
