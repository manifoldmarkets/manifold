import { getConsensusMedian } from 'common/perps/oracle'

import { log } from './utils'

// BTC/USD spot from three independent, free, no-auth, US-accessible exchanges.
// (Binance is deliberately absent: api.binance.com geo-blocks US IPs, which
// is where prod GCP egress lands.) The oracle point is the median so that one
// exchange being down, rate-limited, or briefly off-market can't move the
// feed; we require at least two sources or return null (skip the tick).

const FETCH_TIMEOUT_MS = 5_000
const MAX_SOURCE_DIVERGENCE_FRAC = 0.02

const fetchJson = async (url: string): Promise<unknown> => {
  const res = await fetch(url, {
    headers: { 'user-agent': 'Manifold/1.0 (+https://manifold.markets)' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`)
  return res.json()
}

const readCoinbasePrice = (body: unknown) => {
  if (
    !body ||
    typeof body !== 'object' ||
    !('data' in body) ||
    !body.data ||
    typeof body.data !== 'object' ||
    !('amount' in body.data)
  )
    return Number.NaN
  return Number(body.data.amount)
}

const readKrakenPrice = (body: unknown) => {
  if (
    !body ||
    typeof body !== 'object' ||
    !('result' in body) ||
    !body.result ||
    typeof body.result !== 'object' ||
    !('XXBTZUSD' in body.result) ||
    !body.result.XXBTZUSD ||
    typeof body.result.XXBTZUSD !== 'object' ||
    !('c' in body.result.XXBTZUSD) ||
    !Array.isArray(body.result.XXBTZUSD.c)
  )
    return Number.NaN
  return Number(body.result.XXBTZUSD.c[0])
}

const readBitstampPrice = (body: unknown) => {
  if (!body || typeof body !== 'object' || !('last' in body)) return Number.NaN
  return Number(body.last)
}

type BtcSource = {
  name: string
  fetchPrice: () => Promise<number>
}

const SOURCES: BtcSource[] = [
  {
    name: 'coinbase',
    fetchPrice: async () => {
      const body = await fetchJson(
        'https://api.coinbase.com/v2/prices/BTC-USD/spot'
      )
      return readCoinbasePrice(body)
    },
  },
  {
    name: 'kraken',
    fetchPrice: async () => {
      const body = await fetchJson(
        'https://api.kraken.com/0/public/Ticker?pair=XBTUSD'
      )
      return readKrakenPrice(body)
    },
  },
  {
    name: 'bitstamp',
    fetchPrice: async () => {
      const body = await fetchJson(
        'https://www.bitstamp.net/api/v2/ticker/btcusd/'
      )
      return readBitstampPrice(body)
    },
  },
]

type NamedPrice = {
  source: string
  price: number
}

/**
 * Return a price only when at least two independent exchanges agree.
 *
 * This source-level check replaces a temporal jump guard. A temporal guard
 * permanently wedges after a legitimate >10% move because every future tick
 * is compared with the same rejected stale point. Agreement between a pair
 * of exchanges validates the current level without assuming that BTC moves
 * slowly.
 */
export const getBtcConsensusPrice = (
  quotes: readonly NamedPrice[],
  maxDivergenceFrac = MAX_SOURCE_DIVERGENCE_FRAC
): number | null =>
  getConsensusMedian(
    quotes.map((quote) => quote.price),
    maxDivergenceFrac
  )

export const fetchBtcUsdSpot = async (): Promise<{
  ts: number
  price: number
} | null> => {
  const results = await Promise.allSettled(
    SOURCES.map(async (s) => {
      const price = await s.fetchPrice()
      if (!Number.isFinite(price) || price <= 0)
        throw new Error(`${s.name}: bad price ${price}`)
      return price
    })
  )
  const quotes: NamedPrice[] = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled')
      quotes.push({ source: SOURCES[i].name, price: r.value })
    else log(`[btc-price] ${SOURCES[i].name} failed: ${r.reason}`)
  })

  if (quotes.length < 2) {
    log.error(
      `[btc-price] only ${quotes.length}/3 sources responded — skipping point`
    )
    return null
  }

  const price = getBtcConsensusPrice(quotes)
  if (price == null) {
    log.error(
      `[btc-price] no exchange pair agreed within ${
        MAX_SOURCE_DIVERGENCE_FRAC * 100
      }% (${quotes
        .map((quote) => `${quote.source}=${quote.price}`)
        .join(', ')}) — skipping point`
    )
    return null
  }
  return { ts: Date.now(), price }
}
