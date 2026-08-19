import { getConsensusMedian } from 'common/perps/oracle'

import { log } from './utils'

// BTC/USD spot from five independent, free, no-auth, US-accessible exchanges.
// (Binance is deliberately absent: api.binance.com geo-blocks US IPs, which
// is where prod GCP egress lands.) The oracle point is the median so that one
// exchange being down, rate-limited, or briefly off-market can't move the
// feed; we require at least two sources or return null (skip the tick).
//
// Five rather than three is about surviving slow venues, not about the quorum
// — the two-source floor has never once been the binding constraint. It is
// what makes the short fetch timeout below safe to set.

// Must stay comfortably under the oracle tick interval (ORACLE_TICK_PERIOD_MS,
// 2s — not importable here, since scheduler depends on shared and not the
// reverse). fetchBtcUsdSpot waits for every source to settle, so this timeout
// is the floor on how long a poll can take when any one venue hangs. At the
// previous 5s it exceeded the whole tick: a single slow exchange held the poll
// for more than two tick intervals, and because dispatch skips a feed while
// its previous run is in flight, each hang cost multiple ticks. Bitstamp alone
// timed out nine times in three days.
//
// Bounding it below the tick converts "everyone waits for the slowest venue"
// into "the slow venue misses this tick's median" — which is only tolerable
// because there are five sources and two are enough.
//
// Measured round-trips (ms), three consecutive rounds from a warm process:
//   coinbase 327/254/257  kraken 311/294/300  bitstamp 301/19/261
//   gemini  2483/1428/277  bitfinex 96/10/11
// Every venue settles well inside this budget once its connection is warm.
// Gemini is the outlier on the first couple of calls, so it may miss the
// opening ticks after a scheduler restart and then self-heal — which is the
// intended degradation, not a failure. If `[btc-price] gemini failed` turns
// out to be chronic from GCP egress, raise this toward (but keep under) the
// tick rather than dropping the source.
const FETCH_TIMEOUT_MS = 1_200
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

const readGeminiPrice = (body: unknown) => {
  if (!body || typeof body !== 'object' || !('last' in body)) return Number.NaN
  return Number(body.last)
}

// Bitfinex v2 returns a bare positional array, not an object:
//   [BID, BID_SIZE, ASK, ASK_SIZE, DAILY_CHANGE, DAILY_CHANGE_REL,
//    LAST_PRICE, VOLUME, HIGH, LOW]
// LAST_PRICE is index 6. Length is checked rather than assumed equal to 10 —
// the live response carries a trailing field beyond the documented ten, and a
// shape that grows at the end must not break a fixed-index read.
const BITFINEX_LAST_PRICE_INDEX = 6

const readBitfinexPrice = (body: unknown) => {
  if (!Array.isArray(body) || body.length <= BITFINEX_LAST_PRICE_INDEX)
    return Number.NaN
  return Number(body[BITFINEX_LAST_PRICE_INDEX])
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
  {
    name: 'gemini',
    fetchPrice: async () => {
      const body = await fetchJson('https://api.gemini.com/v1/pubticker/btcusd')
      return readGeminiPrice(body)
    },
  },
  {
    name: 'bitfinex',
    fetchPrice: async () => {
      const body = await fetchJson(
        'https://api-pub.bitfinex.com/v2/ticker/tBTCUSD'
      )
      return readBitfinexPrice(body)
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
 * This is the source-level validation the registry relies on instead of a
 * temporal move cap. A temporal cap permanently wedges after a legitimate
 * large move, because every future tick is compared with the same rejected
 * stale point — and a stale price is worse than a fast one, since the market
 * still executes against it. Agreement between a pair of exchanges validates
 * the current level without assuming that BTC moves slowly.
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
      `[btc-price] only ${quotes.length}/${SOURCES.length} sources responded — skipping point`
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
