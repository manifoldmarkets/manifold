// Writes Kalshi's series in web/public/data/election-2026-comparisons.json:
// the price of "Republicans win the Senate" and "... the House" at every
// frame of the /election2026 replay (from election-2026-replay.json), so the
// page can show them beside Manifold's odds throughout. Series from other
// sources in the file are kept as they are. Rerun after the snapshot.
//
//   cd web
//   TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node"}' \
//     npx ts-node -r tsconfig-paths/register --transpile-only \
//     scripts/election-2026-replay-comparisons.ts
//
// The price at a frame is the midpoint of the best bid and ask in the last
// minute at or before it: Kalshi's 1-minute candlesticks, which its public
// market data API serves without an account, a day per request.
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { HOUR_MS } from 'common/util/time'
import type {
  ComparisonSeries,
  ReplayChamber,
  ReplayComparisonsFile,
} from 'web/components/election-2026/replay-comparisons'
import type { ReplaySnapshot } from 'web/components/election-2026/replay-model'

const KALSHI = 'https://api.elections.kalshi.com/trade-api/v2'
const DATA = join(__dirname, '../public/data')
const SOURCE = 'Kalshi'
const DAY_S = 24 * 60 * 60
// A quote older than this at a frame is left out rather than carried over.
const MAX_QUOTE_AGE_MS = 6 * HOUR_MS

const MARKETS: { chamber: ReplayChamber; series: string; ticker: string }[] = [
  { chamber: 'senate', series: 'CONTROLS', ticker: 'CONTROLS-2026-R' },
  { chamber: 'house', series: 'CONTROLH', ticker: 'CONTROLH-2026-R' },
]

type Side = { close_dollars?: string | null }
type Candle = { end_period_ts: number; yes_bid?: Side; yes_ask?: Side }

const dollars = (side: Side | undefined) => {
  const value = Number(side?.close_dollars)
  return side?.close_dollars != null && Number.isFinite(value)
    ? value
    : undefined
}

// Each minute's closing midpoint in [from, to] (unix seconds), ascending.
async function quotes(
  series: string,
  ticker: string,
  from: number,
  to: number
) {
  const out: { at: number; prob: number }[] = []
  for (let start = from; start < to; start += DAY_S) {
    const end = Math.min(start + DAY_S, to)
    const res = await fetch(
      `${KALSHI}/series/${series}/markets/${ticker}/candlesticks?start_ts=${start}&end_ts=${end}&period_interval=1`
    )
    if (!res.ok) throw new Error(`${res.status} ${ticker} ${start}-${end}`)
    const { candlesticks } = (await res.json()) as { candlesticks?: Candle[] }
    for (const c of candlesticks ?? []) {
      const bid = dollars(c.yes_bid)
      const ask = dollars(c.yes_ask)
      if (bid !== undefined && ask !== undefined && ask >= bid)
        out.push({ at: c.end_period_ts * 1000, prob: (bid + ask) / 2 })
    }
  }
  return out
    .sort((a, b) => a.at - b.at)
    .filter((q, i, all) => i === 0 || q.at !== all[i - 1].at)
}

// [frame time, price] for every frame with a recent enough quote.
function atFrames(times: number[], qs: { at: number; prob: number }[]) {
  const points: [number, number][] = []
  let next = 0
  let last: { at: number; prob: number } | undefined
  for (const time of times) {
    while (next < qs.length && qs[next].at <= time) last = qs[next++]
    if (last && time - last.at <= MAX_QUOTE_AGE_MS)
      points.push([time, Math.round(last.prob * 10_000) / 10_000])
  }
  return points
}

async function main() {
  const snapshot = JSON.parse(
    readFileSync(join(DATA, 'election-2026-replay.json'), 'utf8')
  ) as ReplaySnapshot
  const file = join(DATA, 'election-2026-comparisons.json')
  const existing = (() => {
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as ReplayComparisonsFile
    } catch {
      return { series: [] } as ReplayComparisonsFile
    }
  })()
  const { times } = snapshot
  const from = Math.floor((times[0] - MAX_QUOTE_AGE_MS) / 1000)
  const to = Math.ceil(times[times.length - 1] / 1000)
  const kalshi: ComparisonSeries = {
    source: SOURCE,
    retrievedAt: new Date().toISOString(),
    chambers: {},
  }
  for (const market of MARKETS) {
    const qs = await quotes(market.series, market.ticker, from, to)
    kalshi.chambers[market.chamber] = atFrames(times, qs)
    console.log(
      `${market.ticker}: ${qs.length} quotes, ${
        kalshi.chambers[market.chamber]?.length
      } of ${times.length} frames`
    )
  }
  const out: ReplayComparisonsFile = {
    series: [
      ...(existing.series ?? []).filter((s) => s.source !== SOURCE),
      kalshi,
    ],
  }
  writeFileSync(file, JSON.stringify(out) + '\n')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
