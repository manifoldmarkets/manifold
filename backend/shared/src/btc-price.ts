import { log } from './utils'

// BTC/USD spot from three independent, free, no-auth, US-accessible exchanges.
// (Binance is deliberately absent: api.binance.com geo-blocks US IPs, which
// is where prod GCP egress lands.) The oracle point is the median so that one
// exchange being down, rate-limited, or briefly off-market can't move the
// feed; we require at least two sources or return null (skip the tick).

const FETCH_TIMEOUT_MS = 5_000

const fetchJson = async (url: string): Promise<any> => {
  const res = await fetch(url, {
    headers: { 'user-agent': 'Manifold/1.0 (+https://manifold.markets)' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`${url}: ${res.status} ${res.statusText}`)
  return res.json()
}

const SOURCES: { name: string; fetchPrice: () => Promise<number> }[] = [
  {
    name: 'coinbase',
    fetchPrice: async () => {
      const body = await fetchJson(
        'https://api.coinbase.com/v2/prices/BTC-USD/spot'
      )
      return Number(body.data.amount)
    },
  },
  {
    name: 'kraken',
    fetchPrice: async () => {
      const body = await fetchJson(
        'https://api.kraken.com/0/public/Ticker?pair=XBTUSD'
      )
      return Number(body.result.XXBTZUSD.c[0])
    },
  },
  {
    name: 'bitstamp',
    fetchPrice: async () => {
      const body = await fetchJson(
        'https://www.bitstamp.net/api/v2/ticker/btcusd/'
      )
      return Number(body.last)
    },
  },
]

const median = (xs: number[]) => {
  const sorted = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

export const fetchBtcUsdSpot = async (): Promise<{
  ts: number
  price: number
} | null> => {
  const results = await Promise.allSettled(
    SOURCES.map(async (s) => {
      const price = await s.fetchPrice()
      if (!isFinite(price) || price <= 0)
        throw new Error(`${s.name}: bad price ${price}`)
      return price
    })
  )
  const prices: number[] = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') prices.push(r.value)
    else log(`[btc-price] ${SOURCES[i].name} failed: ${r.reason}`)
  })

  if (prices.length < 2) {
    log.error(
      `[btc-price] only ${prices.length}/3 sources responded — skipping point`
    )
    return null
  }
  return { ts: Date.now(), price: median(prices) }
}
