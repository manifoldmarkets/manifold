import { BTC_USD_FEED_ID, upsertOraclePrices } from 'shared/oracle'
import { log } from 'shared/utils'
import { runScript } from './run-script'

// Backfill the `btc-usd` oracle feed with 90 days of hourly closes from the
// public Coinbase Exchange candles API (300 candles max per request, no
// auth). Each candle is recorded at its CLOSE time. The live feed then takes
// over at 15s cadence via update-oracle-feeds.
const DAYS = 90
const GRANULARITY_S = 3600
const CANDLES_PER_REQ = 300

type Candle = [
  time: number, // bucket start, unix seconds
  low: number,
  high: number,
  open: number,
  close: number,
  volume: number
]

const fetchCandles = async (startMs: number, endMs: number) => {
  const url = new URL('https://api.exchange.coinbase.com/products/BTC-USD/candles')
  url.searchParams.set('granularity', String(GRANULARITY_S))
  url.searchParams.set('start', new Date(startMs).toISOString())
  url.searchParams.set('end', new Date(endMs).toISOString())
  const res = await fetch(url.toString(), {
    headers: { 'user-agent': 'Manifold/1.0 (+https://manifold.markets)' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok)
    throw new Error(`coinbase candles: ${res.status} ${res.statusText}`)
  return (await res.json()) as Candle[]
}

if (require.main === module)
  runScript(async ({ pg }) => {
    const now = Date.now()
    const startMs = now - DAYS * 24 * 60 * 60 * 1000
    const chunkMs = CANDLES_PER_REQ * GRANULARITY_S * 1000

    const points: { ts: number; price: number }[] = []
    for (let from = startMs; from < now; from += chunkMs) {
      const to = Math.min(from + chunkMs, now)
      const candles = await fetchCandles(from, to)
      for (const [time, , , , close] of candles) {
        const closeTimeMs = (time + GRANULARITY_S) * 1000
        // Skip the still-open candle: its close isn't final.
        if (closeTimeMs > now) continue
        if (isFinite(close) && close > 0)
          points.push({ ts: closeTimeMs, price: close })
      }
      log(`fetched ${candles.length} candles ending ${new Date(to).toISOString()}`)
      // Public endpoint is rate-limited (~10 req/s); be polite.
      await new Promise((r) => setTimeout(r, 300))
    }

    points.sort((a, b) => a.ts - b.ts)
    log(`upserting ${points.length} hourly closes`)
    await upsertOraclePrices(pg, BTC_USD_FEED_ID, points)
    log(`backfilled ${points.length} ${BTC_USD_FEED_ID} oracle points`)
  })
