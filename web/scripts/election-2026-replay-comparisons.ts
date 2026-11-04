// Writes Kalshi's rows in web/public/data/election-2026-comparisons.json:
// the price of "Republicans win the Senate" and "... the House" at each
// milestone of the /election2026 replay (from election-2026-replay.json).
// Rows from other sources in the file are kept as they are.
//
//   cd web
//   TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node"}' \
//     npx ts-node -r tsconfig-paths/register --transpile-only \
//     scripts/election-2026-replay-comparisons.ts
//
// The price at a milestone is the midpoint of the best bid and ask at the
// end of the minute that ends there: Kalshi's 1-minute candlesticks, which
// its public market data API serves without an account.
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { LATEST_MILESTONE_ID } from 'web/components/election-2026/replay-model'
import type {
  ReplayChamber,
  ReplayComparison,
  ReplayComparisonsFile,
} from 'web/components/election-2026/replay-comparisons'
import type { ReplaySnapshot } from 'web/components/election-2026/replay-model'

const KALSHI = 'https://api.elections.kalshi.com/trade-api/v2'
const DATA = join(__dirname, '../public/data')
const SOURCE = 'Kalshi'

const MARKETS: {
  chamber: ReplayChamber
  series: string
  ticker: string
  url: string
}[] = [
  {
    chamber: 'senate',
    series: 'CONTROLS',
    ticker: 'CONTROLS-2026-R',
    url: 'https://kalshi.com/markets/controls',
  },
  {
    chamber: 'house',
    series: 'CONTROLH',
    ticker: 'CONTROLH-2026-R',
    url: 'https://kalshi.com/markets/controlh',
  },
]

type Side = { close_dollars?: string | null }
type Candle = {
  end_period_ts: number
  yes_bid?: Side
  yes_ask?: Side
  price?: Side
}

const dollars = (side: Side | undefined) => {
  const value = Number(side?.close_dollars)
  return side?.close_dollars != null && Number.isFinite(value)
    ? value
    : undefined
}

// The quote at `time` (unix seconds): the last minute ending at or before it
// with both sides of the book, within the hour before.
async function quoteAt(series: string, ticker: string, time: number) {
  const res = await fetch(
    `${KALSHI}/series/${series}/markets/${ticker}/candlesticks?start_ts=${
      time - 3600
    }&end_ts=${time}&period_interval=1`
  )
  if (!res.ok) throw new Error(`${res.status} ${ticker} @ ${time}`)
  const { candlesticks } = (await res.json()) as { candlesticks?: Candle[] }
  const candles = (candlesticks ?? [])
    .filter((c) => c.end_period_ts <= time)
    .sort((a, b) => b.end_period_ts - a.end_period_ts)
  for (const c of candles) {
    const bid = dollars(c.yes_bid)
    const ask = dollars(c.yes_ask)
    if (bid !== undefined && ask !== undefined && ask >= bid)
      return { prob: (bid + ask) / 2, at: c.end_period_ts }
  }
  return undefined
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
      return { rows: [] } as ReplayComparisonsFile
    }
  })()
  const retrievedAt = new Date().toISOString()
  const rows: ReplayComparison[] = []
  // "Latest" moves with each snapshot; the fixed milestones don't.
  for (const m of snapshot.milestones.filter(
    (m) => m.id !== LATEST_MILESTONE_ID
  ))
    for (const market of MARKETS) {
      const quote = await quoteAt(market.series, market.ticker, m.time / 1000)
      if (!quote) {
        console.warn(`No ${market.ticker} quote at ${m.id}`)
        continue
      }
      rows.push({
        source: SOURCE,
        url: market.url,
        chamber: market.chamber,
        milestoneId: m.id,
        republicanProb: Math.round(quote.prob * 10_000) / 10_000,
        quotedAt: new Date(quote.at * 1000).toISOString(),
        retrievedAt,
      })
    }
  const out: ReplayComparisonsFile = {
    rows: [...existing.rows.filter((r) => r.source !== SOURCE), ...rows],
  }
  writeFileSync(file, JSON.stringify(out, null, 2) + '\n')
  for (const r of rows)
    console.log(r.chamber, r.milestoneId, r.republicanProb, r.quotedAt)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
