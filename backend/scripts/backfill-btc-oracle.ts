import { BTC_USD_FEED_ID, insertOraclePrices } from 'shared/oracle'
import { log } from 'shared/utils'
import { runScript } from './run-script'

// Backfill the `btc-usd` oracle feed with closes from the public Coinbase
// Exchange candles API (300 candles max per request, no auth). Each candle
// is recorded at its CLOSE time. The live feed then takes over at 2s
// cadence via update-oracle-feeds.
//
// Args, either:
//   [days] [granularitySeconds]
//     A trailing window ending now; defaults to 90 days of hourly candles.
//   <startIso> <endIso> [granularitySeconds]
//     Patch an outage gap; defaults to 1-minute candles. Only closes strictly
//     between the two instants are inserted, so pass the last live point
//     before the gap and the first one after it: the patch never interleaves
//     Coinbase-only closes with the live feed's cross-venue median.
//     e.g. the 2026-09-26 stuck-poll gap:
//     `ts-node backfill-btc-oracle.ts 2026-09-26T17:09:45.313Z 2026-09-26T23:12:08.602Z`
// Add --dry-run to fetch and report without writing.
// Granularity must be one Coinbase supports: 60/300/900/3600/21600/86400.
//
// Backfilled rows get published_at = now, so point-in-time readers (period
// P&L) never see them as having been known in the past; only history (the
// chart) changes. Inserts are idempotent on (feed_id, ts).
const DRY_RUN = process.argv.includes('--dry-run')
const args = process.argv.slice(2).filter((a) => a !== '--dry-run')
const isInstant = (arg: string | undefined) =>
  arg != null && isNaN(Number(arg)) && !isNaN(Date.parse(arg))

const parseWindow = (now: number) => {
  if (isInstant(args[0])) {
    const startMs = Date.parse(args[0])
    const endMs = Date.parse(args[1])
    if (!isInstant(args[1]) || endMs <= startMs || endMs > now)
      throw new Error(
        `expected <startIso> <endIso> with start < end <= now; got ${args[0]} ${args[1]}`
      )
    return { startMs, endMs, granularityS: Number(args[2]) || 60 }
  }
  const days = Number(args[0]) || 90
  return {
    startMs: now - days * 24 * 60 * 60 * 1000,
    endMs: now,
    granularityS: Number(args[1]) || 3600,
  }
}

const CANDLES_PER_REQ = 300

type Candle = [
  time: number, // bucket start, unix seconds
  low: number,
  high: number,
  open: number,
  close: number,
  volume: number
]

const fetchCandles = async (
  startMs: number,
  endMs: number,
  granularityS: number
) => {
  const url = new URL(
    'https://api.exchange.coinbase.com/products/BTC-USD/candles'
  )
  url.searchParams.set('granularity', String(granularityS))
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
    const { startMs, endMs, granularityS } = parseWindow(Date.now())
    const chunkMs = CANDLES_PER_REQ * granularityS * 1000

    // Keyed by ts: adjacent chunks share their boundary candle.
    const byTs = new Map<number, number>()
    // Coinbase selects candles by START time, so begin one bucket early: the
    // candle open at startMs closes inside the window and belongs in it.
    const fetchFromMs = startMs - granularityS * 1000
    for (let from = fetchFromMs; from < endMs; from += chunkMs) {
      const to = Math.min(from + chunkMs, endMs)
      const candles = await fetchCandles(from, to, granularityS)
      for (const [time, , , , close] of candles) {
        const closeTimeMs = (time + granularityS) * 1000
        // Strictly inside the window. At the trailing edge this also skips
        // the still-open candle, whose close isn't final.
        if (closeTimeMs <= startMs || closeTimeMs >= endMs) continue
        if (isFinite(close) && close > 0) byTs.set(closeTimeMs, close)
      }
      log(
        `fetched ${candles.length} candles ending ${new Date(to).toISOString()}`
      )
      // Public endpoint is rate-limited (~10 req/s); be polite.
      await new Promise((r) => setTimeout(r, 300))
    }

    const points = [...byTs.entries()]
      .map(([ts, price]) => ({ ts, price }))
      .sort((a, b) => a.ts - b.ts)
    if (points.length === 0) {
      log('no candle closes in the window; nothing to insert')
      return
    }
    const prices = points.map((p) => p.price)
    log(
      `${points.length} closes (${granularityS}s) from ${new Date(
        points[0].ts
      ).toISOString()} to ${new Date(
        points[points.length - 1].ts
      ).toISOString()}, range ${Math.min(...prices)}–${Math.max(...prices)}`
    )
    if (DRY_RUN) {
      log('dry run: nothing written')
      return
    }
    await insertOraclePrices(pg, BTC_USD_FEED_ID, points)
    log(`backfilled ${points.length} ${BTC_USD_FEED_ID} oracle points`)
  })
