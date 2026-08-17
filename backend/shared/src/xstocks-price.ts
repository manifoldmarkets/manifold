import { getConsensusMedian } from 'common/perps/oracle'
import {
  XStockUnitMode,
  readGateTickerMid,
  readJupiterRawUsdPrice,
  readMexcBookTickerMid,
} from 'common/perps/xstocks'

import { log } from './utils'

// USD prices for tokenized equities (xStocks by Backed Finance), composited
// across the free, no-auth, US-accessible venues where the tokens actually
// trade. Same validation stance as btc-price.ts: the oracle point is a
// median gated on cross-venue agreement, so one venue being down,
// rate-limited, or wicked by a thin-book print can't move the feed.
//
// Venue map (probed 2026-08-07): Jupiter's lite-api aggregates all Solana
// DEX liquidity ($0.2-2.5M routed per token); Gate and MEXC are CEX spot
// books. SPYx and NVDAx have all three; QQQx and GLDx are not listed on
// MEXC, so those feeds run getConsensusMedian's two-source path — both venues must respond
// AND agree within tolerance or the tick is skipped, and a single venue
// outage stalls the feed until it recovers (markets pause via
// maxOraclePriceAgeMs). Kraken is the largest xStocks venue but does not
// expose them on its public spot API, and Bybit no longer lists them.
// CoinGecko is deliberately not in the hot path (keyless rate limits,
// aggregation latency); it is a backfill/sanity source only.
//
// Quote currency: Gate and MEXC quote against USDT while Jupiter routes
// through USD-stable pools. A USDT depeg beyond the divergence tolerance
// splits the venues and (correctly) stalls the feed rather than publishing a
// number denominated in a broken stablecoin.

const FETCH_TIMEOUT_MS = 5_000
const MAX_SOURCE_DIVERGENCE_FRAC = 0.02

export type XStockSpec = {
  /** Display symbol as the issuer styles it, e.g. 'SPYx'. */
  symbol: string
  /** Solana mint address — the id Jupiter's price API is keyed on. */
  mint: string
  gatePair: string
  /** Only some xStocks are listed on MEXC. */
  mexcSymbol?: string
  /** Whether the token rebases, which decides how Jupiter's response is read.
   * Declared per token because it cannot be inferred from the response and
   * reading it wrong biases the mark silently -- see common/perps/xstocks.ts.
   * Follows whether the underlying pays a dividend: the three equity/ETF
   * tokens do, gold does not. */
  unitMode: XStockUnitMode
}

export const XSTOCK_SPECS = {
  SPYX: {
    symbol: 'SPYx',
    mint: 'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W',
    gatePair: 'SPYX_USDT',
    unitMode: 'rebasing',
    mexcSymbol: 'SPYXUSDT',
  },
  QQQX: {
    symbol: 'QQQx',
    mint: 'Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ',
    gatePair: 'QQQX_USDT',
    unitMode: 'rebasing',
  },
  GLDX: {
    symbol: 'GLDx',
    mint: 'Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re',
    gatePair: 'GLDX_USDT',
    unitMode: 'static',
  },
  NVDAX: {
    symbol: 'NVDAx',
    mint: 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh',
    gatePair: 'NVDAX_USDT',
    unitMode: 'rebasing',
    mexcSymbol: 'NVDAXUSDT',
  },
} as const satisfies Record<string, XStockSpec>

const fetchJson = async (url: string): Promise<unknown> => {
  const res = await fetch(url, {
    headers: { 'user-agent': 'Manifold/1.0 (+https://manifold.markets)' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`)
  return res.json()
}

type XStockSource = {
  name: string
  fetchPrice: () => Promise<number>
}

const buildSources = (spec: XStockSpec): XStockSource[] => {
  const sources: XStockSource[] = [
    {
      name: 'jupiter',
      fetchPrice: async () =>
        readJupiterRawUsdPrice(
          await fetchJson(`https://lite-api.jup.ag/price/v3?ids=${spec.mint}`),
          spec.mint,
          spec.unitMode
        ),
    },
    {
      name: 'gate',
      fetchPrice: async () =>
        readGateTickerMid(
          await fetchJson(
            `https://api.gateio.ws/api/v4/spot/tickers?currency_pair=${spec.gatePair}`
          )
        ),
    },
  ]
  if (spec.mexcSymbol) {
    const symbol = spec.mexcSymbol
    sources.push({
      name: 'mexc',
      fetchPrice: async () =>
        readMexcBookTickerMid(
          await fetchJson(
            `https://api.mexc.com/api/v3/ticker/bookTicker?symbol=${symbol}`
          )
        ),
    })
  }
  return sources
}

export const fetchXStockUsdPrice = async (
  spec: XStockSpec
): Promise<{ ts: number; price: number } | null> => {
  const sources = buildSources(spec)
  const results = await Promise.allSettled(
    sources.map(async (s) => {
      const price = await s.fetchPrice()
      if (!Number.isFinite(price) || price <= 0)
        throw new Error(`${s.name}: bad price ${price}`)
      return price
    })
  )
  const quotes: { source: string; price: number }[] = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled')
      quotes.push({ source: sources[i].name, price: r.value })
    else log(`[xstocks-price] ${spec.symbol} ${sources[i].name}: ${r.reason}`)
  })

  if (quotes.length < 2) {
    log.error(
      `[xstocks-price] ${spec.symbol}: only ${quotes.length}/${sources.length} sources responded — skipping point`
    )
    return null
  }

  const price = getConsensusMedian(
    quotes.map((quote) => quote.price),
    MAX_SOURCE_DIVERGENCE_FRAC
  )
  if (price == null) {
    log.error(
      `[xstocks-price] ${spec.symbol}: no venue pair agreed within ${
        MAX_SOURCE_DIVERGENCE_FRAC * 100
      }% (${quotes
        .map((quote) => `${quote.source}=${quote.price}`)
        .join(', ')}) — skipping point`
    )
    return null
  }
  return { ts: Date.now(), price }
}
