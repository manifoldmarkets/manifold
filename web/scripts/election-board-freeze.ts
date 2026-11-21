// Optional. Writes the race board's election-night freeze to
// public/data/election-board-freeze.json. Nothing needs it: once
// market-probs-history stops serving the freeze (72 hours), a board without
// its frozen odds groups races by result instead. With the snapshot it keeps
// the pre-election rating columns for good. Run any time after a freeze
// (BOARD_FREEZE in lib/politics/elections-2028-config.ts) and commit the
// file. Reads the public API only. From web/:
//   TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node"}' \
//     node --no-experimental-strip-types -r ts-node/register/transpile-only \
//     -r tsconfig-paths/register scripts/election-board-freeze.ts \
//     [--cycle 2028] [--at <ms>] [--out <file>] [--limit <n>: a trial run]
//
// An answer's price at the freeze is its last bet at or before it (with the
// zero-share redemptions that record how other answers' bets moved it in a
// sum-to-one market), else the price its first bet after started from, else
// its pool price (it never traded).

import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { chunk, sortBy } from 'lodash'

import { answerP } from 'common/answer'
import { APIPath } from 'common/api/schema'
import { pathWithPrefix } from 'common/api/utils'
import { Bet } from 'common/bet'
import { getCpmmProbability } from 'common/calculate-cpmm'
import { Contract, isMultiCpmm } from 'common/contract'
import { MarketProbs } from 'common/market-probs-history'
import {
  boardMarketIds,
  FreezeSnapshots,
  FrozenProbs,
} from 'web/lib/politics/board-odds'
import {
  BOARD_FREEZE,
  STATE_MARKETS_2028,
} from 'web/lib/politics/elections-2028-config'
import type { OfficialMarketsFile } from 'web/lib/politics/official-markets'
import mapping from 'web/public/data/election-markets-2028.json'

const API = 'https://api.manifold.markets'
const OUT = join(__dirname, '../public/data/election-board-freeze.json')
const CONCURRENCY = 4

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const isProb = (x: unknown): x is number =>
  typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= 1

const round4 = (x: number) => Math.round(x * 10_000) / 10_000

type Params = Record<string, string | number | boolean | string[] | undefined>

// Rate limited or failing: wait as the API asks (Retry-After), or back off,
// for up to about two minutes.
async function getJson<T>(path: APIPath, params: Params, attempt = 0) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue
    if (Array.isArray(v)) v.forEach((x) => q.append(`${k}[]`, x))
    else q.set(k, String(v))
  }
  // Public endpoints sit under /v0, undocumented ones (markets-by-ids) don't.
  const url = `${API}/${pathWithPrefix(path)}?${q}`
  const res = await fetch(url)
  if (res.ok) return (await res.json()) as T
  if (attempt < 8 && (res.status === 429 || res.status >= 500)) {
    const retryAfter = Number(res.headers.get('retry-after'))
    const wait =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 3_000 * (attempt + 1)
    await new Promise((r) => setTimeout(r, wait))
    return getJson<T>(path, params, attempt + 1)
  }
  throw new Error(`${res.status} ${url.slice(0, 160)}`)
}

async function eachLimit<T>(items: T[], n: number, f: (t: T) => Promise<void>) {
  let i = 0
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) await f(items[i++])
    })
  )
}

async function priceAt(
  contractId: string,
  answerId: string | undefined,
  at: number,
  pool: number
): Promise<number> {
  const base = {
    contractId,
    answerId,
    filterRedemptions: false,
    includeZeroShareRedemptions: true,
    limit: 5,
  }
  // beforeTime is exclusive; a bet at the freeze itself counts as before it.
  const before = await getJson<Bet[]>('bets', {
    ...base,
    beforeTime: at + 1,
    order: 'desc',
  })
  const last = before.find((b) => isProb(b.probAfter))
  if (last) return last.probAfter
  const after = await getJson<Bet[]>('bets', {
    ...base,
    afterTime: at,
    order: 'asc',
  })
  const first = after.find((b) => isProb(b.probBefore))
  return first ? first.probBefore : pool
}

async function marketProbsAt(
  contract: Contract,
  at: number
): Promise<MarketProbs | undefined> {
  if (contract.createdTime > at) return undefined
  if (contract.mechanism === 'cpmm-1') {
    const pool = getCpmmProbability(contract.pool, contract.p)
    return { prob: round4(await priceAt(contract.id, undefined, at, pool)) }
  }
  if (!isMultiCpmm(contract)) return undefined
  const answerProbs: Record<string, number> = {}
  for (const a of contract.answers) {
    if (a.createdTime > at) continue
    const pool = getCpmmProbability(
      { YES: a.poolYes, NO: a.poolNo },
      answerP(a)
    )
    answerProbs[a.id] = round4(await priceAt(contract.id, a.id, at, pool))
  }
  return { answerProbs }
}

async function main() {
  const now = Date.now()
  const passed = Object.entries(BOARD_FREEZE).filter(([, t]) => t <= now)
  const cycle = Number(arg('cycle') ?? passed[passed.length - 1]?.[0])
  const at = Number(arg('at') ?? BOARD_FREEZE[cycle])
  if (!Number.isFinite(cycle) || !Number.isFinite(at) || at > now)
    throw new Error(
      `No freeze to snapshot (cycle ${cycle}, at ${at}): pass --cycle, or --at <ms> in the past`
    )
  const out = arg('out') ?? OUT

  const ids = boardMarketIds(
    cycle,
    (mapping as unknown as OfficialMarketsFile).markets,
    STATE_MARKETS_2028
  )
  const contracts: Contract[] = []
  for (const batch of chunk(ids, 100))
    contracts.push(
      ...(await getJson<Contract[]>('markets-by-ids', { ids: batch }))
    )

  const todo = contracts.slice(0, Number(arg('limit') ?? contracts.length))
  const probs: FrozenProbs = {}
  let done = 0
  await eachLimit(todo, CONCURRENCY, async (c) => {
    const p = await marketProbsAt(c, at)
    if (p) probs[c.id] = p
    if (++done % 50 === 0) console.log(`${done} / ${todo.length}`)
  })

  const existing: FreezeSnapshots = existsSync(out)
    ? JSON.parse(readFileSync(out, 'utf8'))
    : {}
  const sorted = Object.fromEntries(
    sortBy(Object.entries(probs), ([id]) => id)
  ) as FrozenProbs
  // One market per line, like the official-markets mapping.
  const snapshots = { ...existing, [String(at)]: sorted }
  const body = Object.entries(snapshots)
    .map(
      ([time, markets]) =>
        `  ${JSON.stringify(time)}: {\n` +
        Object.entries(markets)
          .map(([id, p]) => `    ${JSON.stringify(id)}: ${JSON.stringify(p)}`)
          .join(',\n') +
        '\n  }'
    )
    .join(',\n')
  writeFileSync(out, `{\n${body}\n}\n`)
  console.log(
    `Froze ${Object.keys(probs).length} of ${ids.length} board markets ` +
      `(${contracts.length} exist) at ${new Date(at).toISOString()} -> ${out}`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
