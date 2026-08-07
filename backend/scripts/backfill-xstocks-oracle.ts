import {
  GLDX_USD_FEED_ID,
  QQQX_USD_FEED_ID,
  SPYX_USD_FEED_ID,
  insertOraclePrices,
} from 'shared/oracle'
import { XSTOCK_SPECS } from 'shared/xstocks-price'
import { log } from 'shared/utils'
import { runScript } from './run-script'

// Backfill an xStocks oracle feed with closes from the public Gate spot
// candlesticks API (no auth, max 1000 candles per request). Gate is the
// backfill source because it is the live-feed venue with the deepest
// accessible history for these pairs; its quotes are the same raw-token
// USDT prices the live composite publishes, so history and live points are
// in consistent units. Each candle is recorded at its CLOSE time; the live
// feed then takes over at 15s cadence via update-oracle-feeds.
//
// Args: <SPYX|QQQX|GLDX> [days] [interval] — defaults 90 days of 1h candles.
// Example: `ts-node backfill-xstocks-oracle.ts SPYX 90 1h`
// Finer patching: `ts-node backfill-xstocks-oracle.ts SPYX 2 5m`
// (interval must be one Gate supports: 1m/5m/15m/30m/1h/4h/8h/1d).

const FEED_BY_KEY = {
  SPYX: SPYX_USD_FEED_ID,
  QQQX: QQQX_USD_FEED_ID,
  GLDX: GLDX_USD_FEED_ID,
} as const

const INTERVAL_S: Record<string, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '4h': 14400,
  '8h': 28800,
  '1d': 86400,
}

const KEY = (process.argv[2] ?? '').toUpperCase() as keyof typeof FEED_BY_KEY
const DAYS = Number(process.argv[3]) || 90
const INTERVAL = process.argv[4] || '1h'
const CANDLES_PER_REQ = 1000

// Gate candle: [ts bucket-start seconds, quote volume, close, high, low,
// open, base volume, "true" when the window has closed] — all strings.
type GateCandle = [string, string, string, string, string, string, string, string]

const fetchCandles = async (
  pair: string,
  fromS: number,
  toS: number
): Promise<GateCandle[]> => {
  const url = new URL('https://api.gateio.ws/api/v4/spot/candlesticks')
  url.searchParams.set('currency_pair', pair)
  url.searchParams.set('interval', INTERVAL)
  url.searchParams.set('from', String(fromS))
  url.searchParams.set('to', String(toS))
  const res = await fetch(url.toString(), {
    headers: { 'user-agent': 'Manifold/1.0 (+https://manifold.markets)' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`gate candles: ${res.status} ${res.statusText}`)
  return (await res.json()) as GateCandle[]
}

if (require.main === module)
  runScript(async ({ pg }) => {
    const feedId = FEED_BY_KEY[KEY]
    const spec = XSTOCK_SPECS[KEY]
    const intervalS = INTERVAL_S[INTERVAL]
    if (!feedId || !spec)
      throw new Error(
        `usage: backfill-xstocks-oracle.ts <${Object.keys(FEED_BY_KEY).join(
          '|'
        )}> [days] [interval]`
      )
    if (!intervalS)
      throw new Error(
        `unsupported interval ${INTERVAL}; use one of ${Object.keys(
          INTERVAL_S
        ).join('/')}`
      )

    const nowS = Math.floor(Date.now() / 1000)
    const startS = nowS - Math.floor(DAYS * 24 * 60 * 60)
    const chunkS = CANDLES_PER_REQ * intervalS

    const points: { ts: number; price: number }[] = []
    for (let from = startS; from < nowS; from += chunkS) {
      const to = Math.min(from + chunkS - intervalS, nowS)
      const candles = await fetchCandles(spec.gatePair, from, to)
      for (const [bucketStartS, , close, , , , , windowClosed] of candles) {
        // Skip the still-open candle: its close isn't final.
        if (windowClosed !== 'true') continue
        const closeTimeMs = (Number(bucketStartS) + intervalS) * 1000
        const price = Number(close)
        if (
          Number.isFinite(closeTimeMs) &&
          closeTimeMs <= Date.now() &&
          Number.isFinite(price) &&
          price > 0
        )
          points.push({ ts: closeTimeMs, price })
      }
      log(
        `fetched ${candles.length} candles ending ${new Date(
          to * 1000
        ).toISOString()}`
      )
      // Public endpoint is rate-limited; be polite.
      await new Promise((r) => setTimeout(r, 300))
    }

    points.sort((a, b) => a.ts - b.ts)
    log(`inserting ${points.length} ${INTERVAL} closes`)
    await insertOraclePrices(pg, feedId, points)
    log(`backfilled ${points.length} ${feedId} oracle points`)
  })
