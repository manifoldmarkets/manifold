// Writes web/public/data/election-2026-replay.json, the odds behind the
// /election2026 replay, from public data only: the map's markets through the
// anon Supabase client and their bets through the public API. Rerun it to
// extend the replay while results come in; the night's history never
// changes once written.
//
//   cd web
//   TS_NODE_COMPILER_OPTIONS='{"module":"CommonJS","moduleResolution":"node"}' \
//     npx ts-node -r tsconfig-paths/register --transpile-only \
//     scripts/election-2026-replay-snapshot.ts [--end 2026-11-04T17:00:00Z]
//
// --end defaults to now: the replay then stops at a "Latest" milestone.
import { writeFileSync } from 'fs'
import { join } from 'path'
import { chunk, keyBy, uniq } from 'lodash'
import { answerP } from 'common/answer'
import { getCpmmProbability } from 'common/calculate-cpmm'
import { Contract, isMultiCpmm } from 'common/contract'
import { ENV_CONFIG } from 'common/envs/constants'
import {
  BetProbRow,
  buildMarketProbsHistory,
  MarketProbs,
} from 'common/market-probs-history'
import { getContracts } from 'common/supabase/contracts'
import { createClient } from 'common/supabase/utils'
import { DAY_MS, MINUTE_MS } from 'common/util/time'
import { MEASURE_CONTRACT_IDS } from 'web/components/usa-map/ballot-measures-model'
import {
  REPLAY_MILESTONES,
  replayPlan,
  ReplaySnapshot,
} from 'web/components/election-2026/replay-model'
import { MIDTERMS_2026 } from 'web/public/data/elections-data'
import { governors2026 } from 'web/public/data/governors-data'
import {
  HOUSE_DISTRICT_MARKETS,
  HOUSE_RACE_MARKETS,
} from 'web/public/data/house-market-data'
import { senate2026 } from 'web/public/data/senate-state-data'

const API = 'https://api.manifold.markets/v0'
const OUT = join(__dirname, '../public/data/election-2026-replay.json')
// The bets endpoint's points mode returns a random subset past this.
const POINTS_LIMIT = 50_000

type PointRow = {
  createdTime: number
  probBefore: number
  probAfter: number
  answerId?: string | null
}

const query = (params: Record<string, string | string[]>) => {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params))
    if (Array.isArray(v)) v.forEach((x) => q.append(`${k}[]`, x))
    else q.set(k, v)
  return q.toString()
}

// Rate limited or failing: wait as the API asks (Retry-After), or back off,
// for up to about two minutes.
async function getJson<T>(url: string, attempt = 0): Promise<T> {
  const res = await fetch(url)
  if (res.ok) return (await res.json()) as T
  if (attempt < 8 && (res.status === 429 || res.status >= 500)) {
    const retryAfter = Number(res.headers.get('retry-after'))
    const wait =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 3_000 * (attempt + 1)
    await new Promise((r) => setTimeout(r, wait))
    return getJson(url, attempt + 1)
  }
  throw new Error(`${res.status} ${url.slice(0, 160)}`)
}

async function eachLimit<T>(items: T[], n: number, f: (t: T) => Promise<void>) {
  let i = 0
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) await f(items[i++])
    })
  )
}

// Every bet's probabilities in (after, before), split until each request is
// under the points limit. Neighbouring slices overlap by a millisecond; a
// repeated bet re-applies the same probability, so that is harmless.
async function betPoints(
  contractId: string | string[],
  after: number,
  before: number
): Promise<PointRow[]> {
  const rows = await getJson<PointRow[]>(
    `${API}/bets?${query({
      contractId,
      afterTime: String(after),
      beforeTime: String(before),
      points: 'true',
      includeZeroShareRedemptions: 'true',
      limit: String(POINTS_LIMIT),
    })}`
  )
  if (rows.length < POINTS_LIMIT) return rows
  if (before - after < MINUTE_MS) throw new Error('Too many bets in a minute')
  const mid = Math.floor((after + before) / 2)
  return [
    ...(await betPoints(contractId, after, mid + 1)),
    ...(await betPoints(contractId, mid, before)),
  ]
}

// The probability a market shows now, from its pools like the server's
// history: a resolution rewrites answers' stored prob to 0 or 1.
function currentProbs(contract: Contract): MarketProbs | undefined {
  if (contract.mechanism === 'cpmm-1')
    return { prob: getCpmmProbability(contract.pool, contract.p) }
  if (isMultiCpmm(contract))
    return {
      answerProbs: Object.fromEntries(
        contract.answers.map((a) => [
          a.id,
          getCpmmProbability({ YES: a.poolYes, NO: a.poolNo }, answerP(a)),
        ])
      ),
    }
  return undefined
}

async function main() {
  const endArg = process.argv.indexOf('--end')
  const now = Date.now()
  const end =
    endArg > 0 ? Math.min(Date.parse(process.argv[endArg + 1]), now) : now
  if (!Number.isFinite(end)) throw new Error('Bad --end')

  // The same markets getElectionMapProps loads for the map, plus the
  // Balance of Power headline market.
  const db = createClient(
    ENV_CONFIG.supabaseInstanceId,
    ENV_CONFIG.supabaseAnonKey
  )
  const slugs = uniq([
    ...senate2026.map((m) => m.slug),
    ...governors2026.map((m) => m.slug),
    ...HOUSE_DISTRICT_MARKETS,
    ...HOUSE_RACE_MARKETS.map((m) => m.slug),
    MIDTERMS_2026.houseControl,
    MIDTERMS_2026.senateControl,
    MIDTERMS_2026.houseDistricts,
    MIDTERMS_2026.balanceOfPower,
  ])
  const contracts = [
    ...(await getContracts(db, slugs, 'slug')),
    ...(await getContracts(db, MEASURE_CONTRACT_IDS, 'id', true)),
  ]
  const missing = slugs.filter((s) => !contracts.some((c) => c.slug === s))
  if (missing.length) console.warn(`Missing markets: ${missing.join(', ')}`)

  const current: { [contractId: string]: MarketProbs } = {}
  for (const c of contracts) {
    const probs = currentProbs(c)
    if (probs) current[c.id] = probs
  }
  const ids = Object.keys(current)
  const multi = ids.filter((id) => current[id].answerProbs)
  const binary = ids.filter((id) => current[id].prob !== undefined)
  const answerContract = new Map<string, string>()
  for (const id of multi)
    for (const answerId of Object.keys(current[id].answerProbs ?? {}))
      answerContract.set(answerId, id)

  const { times, milestones } = replayPlan(REPLAY_MILESTONES, end)
  if (times.length < 2) throw new Error('Nothing to replay yet')
  const start = times[0]
  // Bets up to after the markets were read, not just to `end`: a series opens
  // at the first bet after the first frame, however late that bet came, and
  // one with no bets at all sits at the price read above.
  const betsUntil = Date.now()
  const slices: [number, number][] = []
  for (let t = start; t < betsUntil; t += DAY_MS)
    slices.push([t, Math.min(t + DAY_MS, betsUntil) + 1])

  const rows: BetProbRow[] = []
  const add = (contractId: string, answerId: string | null, p: PointRow) =>
    rows.push({
      contractId,
      answerId,
      createdTime: p.createdTime,
      probBefore: p.probBefore,
      probAfter: p.probAfter,
    })
  const multiJobs = chunk(multi, 40).flatMap((batch) =>
    slices.map((slice) => ({ batch, slice }))
  )
  await eachLimit(multiJobs, 4, async ({ batch, slice }) => {
    for (const p of await betPoints(batch, slice[0], slice[1])) {
      const contractId = p.answerId ? answerContract.get(p.answerId) : undefined
      if (contractId) add(contractId, p.answerId ?? null, p)
    }
  })
  const binaryJobs = binary.flatMap((contractId) =>
    slices.map((slice) => ({ contractId, slice }))
  )
  await eachLimit(binaryJobs, 6, async ({ contractId, slice }) => {
    for (const p of await betPoints(contractId, slice[0], slice[1]))
      add(contractId, null, p)
  })

  const snapshot: ReplaySnapshot = {
    generatedAt: now,
    times,
    milestones,
    markets: buildMarketProbsHistory(times, current, rows),
  }
  const json = JSON.stringify(snapshot)
  writeFileSync(OUT, json)
  const byId = keyBy(contracts, (c) => c.id)
  console.log(
    `${ids.length} markets (${multi.length} multiple choice, ${
      binary.length
    } binary; ${contracts.length - ids.length} skipped), ${rows.length} bets, ${
      times.length
    } frames, ${milestones.length} milestones, ${(json.length / 1024).toFixed(
      0
    )} KB`
  )
  const skipped = contracts.filter((c) => !current[c.id])
  if (skipped.length)
    console.log(
      `Skipped: ${skipped
        .map((c) => `${byId[c.id].slug} (${c.mechanism})`)
        .join(', ')}`
    )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
