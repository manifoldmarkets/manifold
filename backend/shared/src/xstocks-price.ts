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
  /** Whether the token's balance currently rebases, which decides how
   * Jupiter's response is read. Declared per token because a price response
   * cannot reveal it, and reading it wrong biases the mark silently -- see
   * common/perps/xstocks.ts.
   *
   * Verified on-chain 2026-08-18 via getMultipleAccounts(jsonParsed): ALL
   * FOUR mints carry a scaledUiAmountConfig with a live update authority.
   * SPYx 1.003909, QQQx 1.001954 and NVDAx 1.000103 are accruing, so they are
   * `rebasing`; GLDx sits at exactly 1, so `static` is true today but is not
   * guaranteed by the mint. The reader fails closed if a response ever
   * contradicts a `static` declaration. */
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

/**
 * One Jupiter call per ROUND instead of one per token.
 *
 * `price/v3` is keyed by mint and takes comma-separated ids, and
 * `readJupiterRawUsdPrice` already indexes the response by mint — so batching
 * needs no parser change. Four calls collapse into one, which is what makes a
 * faster tick affordable: at a 5s poll this is 12 req/min against Jupiter's
 * keyless lite tier rather than 48, the same per-source rate the BTC feed
 * already runs comfortably.
 *
 * Measured 2026-08-18, before this change: on a 15s poll the four feeds were
 * publishing at a 15-60s median gap with 51-115 gaps over a minute in five
 * hours, so they were already missing their configured cadence.
 *
 * The TTL only has to span one round of concurrent callers, and is kept well
 * under the 15s poll so a point can never be served from a previous round. A
 * failed batch is not cached: the memo is cleared so the next round retries
 * rather than inheriting the error.
 *
 * Gate and MEXC are still one call per token. Their readers take a single
 * ticker, so batching them means changing tested parsers in common/, and
 * neither is the rate limit that bites — Jupiter's keyless tier is. Do those
 * separately if the tick goes below 5s.
 */
const JUPITER_BATCH_TTL_MS = 3_000

let jupiterBatch: { at: number; body: Promise<unknown> } | null = null

const allMints = () =>
  Object.values(XSTOCK_SPECS)
    .map((spec) => spec.mint)
    .join(',')

const fetchJupiterBatch = (): Promise<unknown> => {
  const now = Date.now()
  if (jupiterBatch && now - jupiterBatch.at < JUPITER_BATCH_TTL_MS)
    return jupiterBatch.body
  const body = fetchJson(
    `https://lite-api.jup.ag/price/v3?ids=${allMints()}`
  ).catch((err) => {
    // Do not let a rejected promise sit in the memo for the rest of its TTL.
    if (jupiterBatch?.body === body) jupiterBatch = null
    throw err
  })
  jupiterBatch = { at: now, body }
  return body
}

/** Test seam: drop the memo so a case cannot inherit another's response. */
export const resetJupiterBatchCache = () => {
  jupiterBatch = null
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
          await fetchJupiterBatch(),
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
