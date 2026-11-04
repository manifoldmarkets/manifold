// Creates the @ManifoldPolitics national/headline election markets listed in
// national-markets.ts, quietly: each market is created UNLISTED (follower
// notifications only fire for public creation), read back, its opening odds
// verified against the seed, and only then published. See README.md.
//
// From backend/scripts:
//
//   Offline dry run (default; no network, no credentials):
//     npx ts-node --transpile-only elections-2028/create-national-markets.ts
//
//   Online dry run (read-only GETs against prod: live seeds from community
//   markets, reserved ids free?, duplicates among @ManifoldPolitics' open
//   markets, topic ids, live candidate photos):
//     npx ts-node --transpile-only elections-2028/create-national-markets.ts --online
//
//   Apply (Tod only; the key is read from the environment, never the command
//   line, and never logged):
//     $env:MANIFOLD_API_KEY = '<@ManifoldPolitics key>'
//     npx ts-node --transpile-only elections-2028/create-national-markets.ts --apply \
//       --env prod --creator-username ManifoldPolitics \
//       --state C:\Users\User\elections-national-prod\state.prod.json --init-state \
//       --max-mana 21000 --only "^2028-dem-nominee$"
//
// Options: --only <regex on key>  --out <dir>  --pace-ms <ms>  --loud (create
// public directly; notifies followers in-app — don't)  --init-state (first
// apply with a new state file).

import * as fs from 'fs'
import * as path from 'path'
import {
  buildPayload,
  costOf,
  ENTRIES,
  Entry,
  MANIFOLD_POLITICS_ID,
  MANIFOLD_POLITICS_USERNAME,
  needsOnline,
  priceMismatches,
  shapeMismatches,
  ResolvedSeed,
  resolveSeed,
  SERIES,
  seedError,
  seedSourceIds,
  SourceMarket,
  validateEntries,
} from './national-markets'
import {
  Api,
  API_BASES,
  ApiError,
  Group,
  imageExists,
  makeApi,
  MarketRow,
  WEB_BASES,
} from './api'
import { loadPhotoIndex, photoPathFor } from './photos'
import { normalizeName, reservedIdFor } from './seeds'

type Args = Record<string, string | boolean>

function parseArgs(argv: string[]): Args {
  const out: Args = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) throw new Error(`Unexpected argument: ${a}`)
    const k = a.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) out[k] = true
    else {
      out[k] = next
      i++
    }
  }
  return out
}

const REPO_ROOT = path.resolve(__dirname, '../../..')
const DEFAULT_OUT = path.join(__dirname, 'out')

function writeAtomic(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}`
  fs.writeFileSync(
    tmp,
    typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n'
  )
  fs.renameSync(tmp, file)
}

const fmtDate = (iso: string) => iso.slice(0, 10)
const mana = (n: number | undefined) =>
  n === undefined ? '?' : `Ṁ${n.toLocaleString('en-US')}`

const seedSummary = (seed: ResolvedSeed | undefined) => {
  if (!seed) return '(live; needs --online)'
  if (seed.outcome === 'BINARY') return `YES ${seed.initialProb}%`
  const parts = seed.answers.map((a, i) => `${a} ${seed.answerProbs[i]}%`)
  if (seed.otherPct !== undefined) parts.push(`Other ${seed.otherPct}%`)
  return parts.join(', ')
}

const seedSpecLabel = (e: Entry) => {
  const s = e.seed
  switch (s.kind) {
    case 'static-binary':
    case 'static-fixed':
    case 'static-candidates':
      return `static: ${s.note}`
    default:
      return `${s.kind} (${seedSourceIds(s).join(', ')})`
  }
}

// Markets inside a git working tree would risk committing the state file.
function assertOutsideRepo(file: string) {
  let dir = path.dirname(path.resolve(file))
  for (;;) {
    if (fs.existsSync(path.join(dir, '.git')))
      throw new Error(
        `--state must be outside any git working tree (found .git in ${dir})`
      )
    const parent = path.dirname(dir)
    if (parent === dir) return
    dir = parent
  }
}

type PlanRow = {
  key: string
  cycle: number
  question: string
  outcome: string
  addAnswersMode?: string
  liquidityTier: number
  closeTime: string
  topics: string[]
  reservedId: string
  seedSpec: string
  seed?: ResolvedSeed
  cost?: number
  costLowerBound: number
  seedError?: string
}

function planRows(
  entries: Entry[],
  seeds: Map<string, ResolvedSeed | undefined>,
  seedErrors: Map<string, string>
): PlanRow[] {
  return entries.map((e) => {
    const seed = seeds.get(e.key)
    return {
      key: e.key,
      cycle: e.cycle,
      question: e.question,
      outcome: e.outcome,
      addAnswersMode: e.outcome === 'MULTIPLE_CHOICE' ? e.addAnswersMode : undefined,
      liquidityTier: e.liquidityTier,
      closeTime: e.closeTime,
      topics: e.topics,
      reservedId: reservedIdFor(SERIES, e.key),
      seedSpec: seedSpecLabel(e),
      seed,
      cost: costOf(e, seed),
      costLowerBound: e.liquidityTier,
      seedError: seedErrors.get(e.key),
    }
  })
}

function reportMarkdown(opts: {
  title: string
  rows: PlanRow[]
  extra?: string[]
}) {
  const { rows } = opts
  const exact = rows.every((r) => r.cost !== undefined)
  const total = rows.reduce((s, r) => s + (r.cost ?? r.costLowerBound), 0)
  const lines = [
    `# ${opts.title}`,
    '',
    `Series \`${SERIES}\` · ${rows.length} markets · creator @${MANIFOLD_POLITICS_USERNAME} · total ${
      exact ? '' : 'at least '
    }${mana(total)}`,
    '',
    '| key | question | type | tier | cost | closes | reserved id | seed |',
    '|---|---|---|---:|---:|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.key} | ${r.question} | ${
          r.outcome === 'BINARY' ? 'binary' : `MC ${r.addAnswersMode}`
        } | ${r.liquidityTier.toLocaleString('en-US')} | ${
          r.cost === undefined ? `≥${mana(r.costLowerBound)}` : mana(r.cost)
        } | ${fmtDate(r.closeTime)} | \`${r.reservedId}\` | ${
          r.seedError ? `**ERROR: ${r.seedError}** ` : ''
        }${seedSummary(r.seed)} |`
    ),
    '',
    '## Seed sources',
    '',
    ...rows.map(
      (r) => `- **${r.key}**: ${r.seed?.basis ?? r.seedSpec}`
    ),
    ...(opts.extra ?? []),
    '',
  ]
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Offline
// ---------------------------------------------------------------------------

async function offline(entries: Entry[], outDir: string) {
  const seeds = new Map<string, ResolvedSeed | undefined>()
  const errors = new Map<string, string>()
  for (const e of entries) {
    if (needsOnline(e)) {
      seeds.set(e.key, undefined)
      continue
    }
    const seed = await resolveSeed(e)
    seeds.set(e.key, seed)
    const err = seedError(e, seed)
    if (err) errors.set(e.key, err)
  }
  const rows = planRows(entries, seeds, errors)
  writeAtomic(path.join(outDir, 'plan.json'), {
    series: SERIES,
    generatedAt: new Date().toISOString(),
    mode: 'offline',
    rows,
  })
  writeAtomic(
    path.join(outDir, 'report.md'),
    reportMarkdown({
      title: 'National election markets: offline dry run',
      rows,
      extra: [
        '',
        'Live-seeded markets show a lower-bound cost; run with `--online` for exact seeds, answer counts and costs.',
      ],
    })
  )
  printTable(rows)
  if (errors.size) {
    console.error(`\n${errors.size} seed error(s):`)
    for (const [k, v] of errors) console.error(`  ${k}: ${v}`)
    process.exitCode = 1
  }
  console.log(`\nWrote ${path.join(outDir, 'plan.json')} and report.md`)
}

function printTable(rows: PlanRow[]) {
  const exact = rows.every((r) => r.cost !== undefined)
  const total = rows.reduce((s, r) => s + (r.cost ?? r.costLowerBound), 0)
  for (const r of rows)
    console.log(
      `${r.key.padEnd(34)} ${r.reservedId}  ${(r.cost === undefined
        ? `>=${r.costLowerBound}`
        : String(r.cost)
      ).padStart(7)}  ${fmtDate(r.closeTime)}  ${r.question}`
    )
  console.log(
    `\n${rows.length} markets, total ${exact ? '' : 'at least '}${mana(total)}`
  )
}

// ---------------------------------------------------------------------------
// Shared online pieces
// ---------------------------------------------------------------------------

async function prefetchSources(api: Api, entries: Entry[]) {
  const ids = [...new Set(entries.flatMap((e) => seedSourceIds(e.seed)))]
  const cache = new Map<string, MarketRow | undefined>()
  for (const id of ids) cache.set(id, await api.getMarket(id))
  const reader = async (id: string): Promise<SourceMarket | undefined> =>
    cache.has(id) ? cache.get(id) : api.getMarket(id)
  return { cache, reader }
}

async function resolveTopics(api: Api, entries: Entry[]) {
  const slugs = [...new Set(entries.flatMap((e) => e.topics))]
  const found = new Map<string, Group>()
  const missing: string[] = []
  for (const slug of slugs) {
    const g = await api.getGroup(slug)
    if (g) found.set(slug, g)
    else missing.push(slug)
  }
  return { found, missing }
}

const QUESTION_STOPWORDS = new Set([
  'the', 'a', 'an', 'will', 'be', 'who', 'which', 'what', 'in', 'of', 'to',
  'for', 'by', 'on', 'at', 'is', 'after', 'win', 'won', 'us', 'u', 's',
  'united', 'states', 'election', 'elections', 'party',
])

// Light stemming so "presidential nominee" matches "nominee for president".
const STEMS: Record<string, string> = {
  presidential: 'president',
  presidency: 'president',
  democrat: 'democratic',
  democrats: 'democratic',
  republicans: 'republican',
  gop: 'republican',
  nomination: 'nominee',
  nominated: 'nominee',
  elected: 'elect',
  controls: 'control',
}

const questionTokens = (q: string) =>
  new Set(
    normalizeName(q)
      .replace(/[?!:;]/g, ' ')
      .split(' ')
      .map((t) => STEMS[t] ?? t)
      .filter((t) => t && !QUESTION_STOPWORDS.has(t))
  )

// Likely duplicates: same years mentioned and token Jaccard ≥ 0.6.
export function similarQuestions(question: string, candidates: MarketRow[]) {
  const a = questionTokens(question)
  const years = (q: string) => (q.match(/\b20\d\d\b/g) ?? []).sort().join(',')
  const y = years(question)
  return candidates
    .map((m) => {
      const b = questionTokens(m.question)
      const inter = [...a].filter((t) => b.has(t)).length
      const union = new Set([...a, ...b]).size
      return { m, score: union ? inter / union : 0 }
    })
    .filter(({ m, score }) => score >= 0.6 && years(m.question) === y)
    .sort((p, q) => q.score - p.score)
}

async function photoUrls(
  entry: Entry,
  seed: ResolvedSeed,
  webBase: string,
  index: Map<string, string>,
  live: Map<string, boolean>
): Promise<(string | undefined)[] | undefined> {
  if (entry.outcome !== 'MULTIPLE_CHOICE' || entry.addAnswersMode === 'DISABLED')
    return undefined
  if (seed.outcome !== 'MULTIPLE_CHOICE') return undefined
  // Only candidate markets (people), not the tipping-point states.
  if (entry.key === '2028-tipping-point') return undefined
  const urls: (string | undefined)[] = []
  for (const answer of seed.answers) {
    const p = photoPathFor(index, answer)
    if (!p) {
      urls.push(undefined)
      continue
    }
    const url = `${webBase}${p}`
    if (!live.has(url)) live.set(url, await imageExists(url))
    urls.push(live.get(url) ? url : undefined)
  }
  return urls
}

const leadingCount = (urls: (string | undefined)[] | undefined) => {
  let n = 0
  for (const u of urls ?? []) {
    if (!u) break
    n++
  }
  return n
}

// ---------------------------------------------------------------------------
// Online dry run
// ---------------------------------------------------------------------------

async function online(entries: Entry[], outDir: string, paceMs: number) {
  const api = makeApi({ apiBase: API_BASES.prod, allowWrites: false, paceMs })
  console.log('Reading seed sources…')
  const { cache, reader } = await prefetchSources(api, entries)
  const seeds = new Map<string, ResolvedSeed | undefined>()
  const errors = new Map<string, string>()
  for (const e of entries) {
    try {
      const seed = await resolveSeed(e, reader)
      seeds.set(e.key, seed)
      const err = seedError(e, seed)
      if (err) errors.set(e.key, err)
    } catch (err) {
      seeds.set(e.key, undefined)
      errors.set(e.key, (err as Error).message)
    }
  }

  console.log('Resolving topics…')
  const topics = await resolveTopics(api, entries)

  console.log('Checking reserved ids…')
  const reserved: { key: string; reservedId: string; taken?: string }[] = []
  for (const e of entries) {
    const id = reservedIdFor(SERIES, e.key)
    const m = await api.getMarket(id)
    reserved.push({
      key: e.key,
      reservedId: id,
      taken: m ? `${m.creatorUsername}: ${m.question}` : undefined,
    })
  }

  console.log('Looking for duplicates among @ManifoldPolitics markets…')
  const now = Date.now()
  const mp = await api.marketsByUser(MANIFOLD_POLITICS_ID)
  const open = mp.filter((m) => !m.isResolved && (m.closeTime ?? Infinity) > now)
  const duplicates = entries
    .map((e) => ({
      key: e.key,
      question: e.question,
      matches: similarQuestions(e.question, open).map(({ m, score }) => ({
        id: m.id,
        question: m.question,
        url: m.url,
        traders: m.uniqueBettorCount,
        score: Math.round(score * 100) / 100,
      })),
    }))
    .filter((d) => d.matches.length > 0)

  console.log('Checking candidate photos on manifold.markets…')
  const { index, sources: photoSources } = loadPhotoIndex(REPO_ROOT)
  const live = new Map<string, boolean>()
  const photos: {
    key: string
    withPhoto: number
    attached: number
    missing: string[]
  }[] = []
  for (const e of entries) {
    const seed = seeds.get(e.key)
    if (!seed) continue
    const urls = await photoUrls(e, seed, WEB_BASES.prod, index, live)
    if (!urls || seed.outcome !== 'MULTIPLE_CHOICE') continue
    photos.push({
      key: e.key,
      withPhoto: urls.filter(Boolean).length,
      attached: leadingCount(urls),
      missing: seed.answers.filter((_, i) => !urls[i]),
    })
  }

  const rows = planRows(entries, seeds, errors)
  const sourcesReport = [...cache.entries()].map(([id, m]) => ({
    id,
    found: !!m,
    question: m?.question,
    traders: m?.uniqueBettorCount,
    resolved: m?.isResolved,
  }))
  writeAtomic(path.join(outDir, 'online.json'), {
    series: SERIES,
    generatedAt: new Date().toISOString(),
    mode: 'online',
    rows,
    sources: sourcesReport,
    topics: {
      found: Object.fromEntries(
        [...topics.found].map(([slug, g]) => [slug, { id: g.id, name: g.name }])
      ),
      missing: topics.missing,
    },
    reservedIds: reserved,
    duplicates,
    photos: { registry: photoSources, perMarket: photos },
  })
  const extra = [
    '',
    '## Online checks',
    '',
    `Seed sources: ${sourcesReport
      .map(
        (s) =>
          `${s.id} ${s.found ? `(${s.traders ?? '?'} traders${s.resolved ? ', RESOLVED' : ''})` : '(NOT FOUND)'}`
      )
      .join('; ')}`,
    '',
    `Topics missing: ${topics.missing.length ? topics.missing.join(', ') : 'none'}`,
    '',
    `Reserved ids already taken: ${
      reserved.filter((r) => r.taken).map((r) => `${r.key} (${r.reservedId}: ${r.taken})`).join('; ') || 'none'
    }`,
    '',
    `Possible duplicates among open @ManifoldPolitics markets: ${duplicates.length ? '' : 'none'}`,
    ...duplicates.flatMap((d) =>
      d.matches.map(
        (m) => `- ${d.key}: "${m.question}" (${m.url ?? m.id}, ${m.traders ?? '?'} traders, similarity ${m.score})`
      )
    ),
    '',
    'Candidate photos (attached = leading run of answers with a live photo; the API cannot skip one):',
    ...photos.map(
      (p) =>
        `- ${p.key}: ${p.attached} attached, ${p.withPhoto} with a live photo${
          p.missing.length ? `; no live photo: ${p.missing.join(', ')}` : ''
        }`
    ),
  ]
  writeAtomic(
    path.join(outDir, 'report.md'),
    reportMarkdown({ title: 'National election markets: online dry run', rows, extra })
  )
  printTable(rows)
  console.log(extra.join('\n'))
  if (errors.size) {
    console.error(`\n${errors.size} seed error(s):`)
    for (const [k, v] of errors) console.error(`  ${k}: ${v}`)
    process.exitCode = 1
  }
  console.log(`\nWrote ${path.join(outDir, 'online.json')} and report.md`)
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

type Status =
  | 'planned'
  | 'creating'
  | 'created-unlisted'
  | 'created-public'
  | 'verified'
  | 'published'
  | 'stopped'

type StateRecord = {
  key: string
  reservedId: string
  status: Status
  contractId?: string
  url?: string
  cost?: number
  seed?: ResolvedSeed
  imagesAttached?: number
  error?: string
  updatedAt: string
}

type State = {
  series: string
  env: 'prod' | 'dev'
  creatorId: string
  createdAt: string
  entries: Record<string, StateRecord>
}

class StopRun extends Error {}

async function apply(entries: Entry[], args: Args) {
  const env = args.env
  if (env !== 'prod' && env !== 'dev')
    throw new Error('--apply needs --env prod|dev (no default)')
  const apiKey = process.env.MANIFOLD_API_KEY
  if (!apiKey) throw new Error('Set MANIFOLD_API_KEY in the environment')
  const creatorUsername = args['creator-username']
  if (typeof creatorUsername !== 'string')
    throw new Error('--apply needs --creator-username')
  const statePath = args.state
  if (typeof statePath !== 'string') throw new Error('--apply needs --state <file>')
  assertOutsideRepo(statePath)
  const maxMana = Number(args['max-mana'])
  if (!Number.isFinite(maxMana) || maxMana <= 0)
    throw new Error('--apply needs --max-mana <positive cap for this run>')
  const quiet = !args.loud
  const paceMs = Number(args['pace-ms'] ?? 400)

  const api = makeApi({
    apiBase: API_BASES[env],
    apiKey,
    allowWrites: true,
    paceMs,
  })
  // Seeds always come from prod community markets (public data).
  const prodRead = makeApi({ apiBase: API_BASES.prod, allowWrites: false, paceMs })

  const me = await api.me()
  if (me.username !== creatorUsername)
    throw new Error(
      `The API key belongs to @${me.username}, not @${creatorUsername}`
    )
  if (
    env === 'prod' &&
    creatorUsername === MANIFOLD_POLITICS_USERNAME &&
    me.id !== MANIFOLD_POLITICS_ID
  )
    throw new Error('@ManifoldPolitics id mismatch')
  console.log(
    `Creating as @${me.username} on ${env} (balance ${mana(Math.floor(me.balance))}), ${
      quiet ? 'quietly (unlisted → verify → publish)' : 'LOUDLY (public at creation)'
    }`
  )
  if (!quiet)
    console.warn(
      'WARNING: --loud creates public markets, which sends every follower an in-app notification.'
    )

  // State.
  let state: State
  if (fs.existsSync(statePath)) {
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    if (state.series !== SERIES || state.env !== env || state.creatorId !== me.id)
      throw new Error(
        `State file is for ${state.series}/${state.env}/${state.creatorId}, not ${SERIES}/${env}/${me.id}`
      )
  } else {
    if (!args['init-state'])
      throw new Error(
        `State file ${statePath} does not exist; pass --init-state to start a new one`
      )
    state = {
      series: SERIES,
      env,
      creatorId: me.id,
      createdAt: new Date().toISOString(),
      entries: {},
    }
    writeAtomic(statePath, state)
  }
  const save = () => writeAtomic(statePath, state)

  // Topics on the target environment.
  const topics = await resolveTopics(api, entries)
  if (topics.missing.length) {
    if (env === 'prod')
      throw new Error(
        `Topics not found on prod: ${topics.missing.join(', ')}. Create them or edit the manifest.`
      )
    console.warn(`Dropping topics missing on dev: ${topics.missing.join(', ')}`)
  }
  const groupIdsFor = (e: Entry) =>
    e.topics.flatMap((slug) => {
      const g = topics.found.get(slug)
      return g ? [g.id] : []
    })

  const { reader } = await prefetchSources(prodRead, entries)
  const { index } = loadPhotoIndex(REPO_ROOT)
  const live = new Map<string, boolean>()

  let spent = 0
  let balance = me.balance
  const touch = (r: StateRecord) => (r.updatedAt = new Date().toISOString())

  const stop: (r: StateRecord, message: string) => never = (r, message) => {
    r.status = 'stopped'
    r.error = message
    touch(r)
    save()
    throw new StopRun(`${r.key}: ${message}`)
  }

  const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms))

  // Cache-busted read, retried a few times: a market just created can take a
  // moment to be readable, and a cached 404 must not count as "missing".
  const readFresh = async (id: string, tries = 4) => {
    for (let i = 0; i < tries; i++) {
      const m = await api.getMarket(id, { fresh: true })
      if (m) return m
      if (i < tries - 1) await sleep(2000 * 2 ** i)
    }
    return undefined
  }

  // Create with the reserved id as idempotency key. Retrying is safe: a
  // second create with the same key is refused ("already been created"), and
  // that market is adopted. A 429 waits out Retry-After; a timeout or 5xx may
  // have created the market anyway, so the reserved id is read first.
  const createWithRetries = async (
    r: StateRecord,
    payload: ReturnType<typeof buildPayload>
  ): Promise<MarketRow> => {
    let lastMessage = ''
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        return await api.createMarket(payload)
      } catch (error) {
        const ae = error instanceof ApiError ? error : undefined
        lastMessage = error instanceof Error ? error.message : String(error)
        if (ae?.kind === 'rejected') {
          if (/already been created/i.test(lastMessage)) {
            const m = await readFresh(r.reservedId)
            if (m) return m
          }
          return stop(r, `create rejected: ${lastMessage}`)
        }
        if (ae?.kind === 'rate-limited') {
          await sleep(ae.retryAfterMs ?? 30_000)
          continue
        }
        // Ambiguous: look for the market before trying again.
        const m = await readFresh(r.reservedId)
        if (m) return m
      }
    }
    return stop(r, `create failed after retries: ${lastMessage}`)
  }

  try {
    for (const e of entries) {
      const reservedId = reservedIdFor(SERIES, e.key)
      const r: StateRecord = (state.entries[e.key] ??= {
        key: e.key,
        reservedId,
        status: 'planned',
        updatedAt: new Date().toISOString(),
      })
      if (r.reservedId !== reservedId)
        throw new StopRun(`${e.key}: state reserved id ${r.reservedId} ≠ ${reservedId}`)
      if (r.status === 'published') continue
      if (r.status === 'stopped') {
        console.warn(
          r.contractId || r.seed
            ? `${e.key}: stopped earlier (${r.error}). Fix the cause, then set its status back to "creating" (keep "seed") to verify and publish ${r.url ?? r.reservedId}.`
            : `${e.key}: stopped earlier (${r.error}). Fix the cause, then delete its record to retry.`
        )
        continue
      }

      // 1. Create (or find the market a previous run created). One fresh
      // read: a 404 here is final enough, because creating with the reserved
      // id is idempotent anyway.
      const existing = await api.getMarket(reservedId, { fresh: true })
      if (existing) {
        if (
          existing.creatorId !== me.id ||
          normalizeName(existing.question) !== normalizeName(e.question)
        )
          stop(r, `reserved id ${reservedId} is a different market: ${existing.url}`)
        if (r.status === 'planned' || !r.seed)
          stop(
            r,
            `${existing.url} exists but this state file has no record of its seed; check it on the site, then set its status to "verified" (to publish) or "published"`
          )
        if (r.status === 'creating') {
          r.status = quiet ? 'created-unlisted' : 'created-public'
          r.contractId = existing.id
          r.url = existing.url
          touch(r)
          save()
        }
      } else {
        if (r.status !== 'planned' && r.status !== 'creating')
          stop(r, `state says ${r.status} but ${reservedId} does not exist`)
        const seed = await resolveSeed(e, reader)
        const err = seedError(e, seed)
        if (err) stop(r, `seed error: ${err}`)
        const cost = costOf(e, seed)!
        if (spent + cost > maxMana) {
          console.log(
            `Budget: ${e.key} costs ${mana(cost)}; run cap ${mana(maxMana)} with ${mana(spent)} spent. Stopping.`
          )
          break
        }
        if (balance < cost) {
          console.log(`Balance ${mana(Math.floor(balance))} < ${mana(cost)} for ${e.key}. Stopping.`)
          break
        }
        const urls = await photoUrls(e, seed, WEB_BASES[env], index, live)
        const payload = buildPayload({
          entry: e,
          seed,
          groupIds: groupIdsFor(e),
          reservedId,
          quiet,
          imageUrls: urls,
        })
        r.seed = seed
        r.cost = cost
        r.imagesAttached = Array.isArray(payload.answerImageUrls)
          ? payload.answerImageUrls.length
          : 0
        r.status = 'creating'
        touch(r)
        save()
        const created = await createWithRetries(r, payload)
        if (created.id !== reservedId)
          stop(r, `created ${created.id}, expected the reserved id ${reservedId}`)
        r.status = quiet ? 'created-unlisted' : 'created-public'
        r.contractId = created.id
        r.url = created.url
        spent += cost
        balance -= cost
        touch(r)
        save()
        console.log(`${e.key}: created ${quiet ? 'unlisted' : 'public'} ${r.url} (${mana(cost)})`)
      }

      // 2. Verify opening odds.
      if (r.status === 'created-unlisted' || r.status === 'created-public') {
        const m = await readFresh(r.contractId!)
        if (!m) stop(r, 'created market not readable')
        if ((m!.uniqueBettorCount ?? 0) > 0)
          console.warn(`${e.key}: already traded; skipping the opening-price check`)
        else {
          const off = priceMismatches(r.seed!, m!)
          if (off.length) stop(r, `opening prices off: ${off.join('; ')}`)
        }
        const shape = shapeMismatches(e, r.seed!, m!)
        if (shape.length) stop(r, `market shape off: ${shape.join('; ')}`)
        r.status = quiet ? 'verified' : 'published'
        touch(r)
        save()
      }

      // 3. Publish.
      if (r.status === 'verified') {
        let lastErr: unknown
        for (let i = 0; i < 3 && r.status === 'verified'; i++) {
          try {
            await api.publishMarket(r.contractId!)
            r.status = 'published'
          } catch (error) {
            lastErr = error
            await new Promise((res) => setTimeout(res, 2000 * 2 ** i))
          }
        }
        if (r.status !== 'published')
          stop(
            r,
            `publish failed: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`
          )
        touch(r)
        save()
        console.log(`${e.key}: published ${r.url}`)
      }
    }
  } catch (error) {
    if (!(error instanceof StopRun)) throw error
    console.error(`STOPPED: ${error.message}`)
    process.exitCode = 1
  }

  const counts: Record<string, number> = {}
  for (const e of entries) {
    const s = state.entries[e.key]?.status ?? 'planned'
    counts[s] = (counts[s] ?? 0) + 1
  }
  console.log(
    `\nThis run spent ${mana(spent)}. Status: ${Object.entries(counts)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}`
  )
}

// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    console.log(fs.readFileSync(__filename, 'utf8').split('\n\nimport')[0])
    return
  }
  const errors = validateEntries(ENTRIES, Date.now())
  if (errors.length) {
    console.error('Manifest errors:\n  ' + errors.join('\n  '))
    process.exit(1)
  }
  const only = typeof args.only === 'string' ? new RegExp(args.only) : undefined
  const entries = ENTRIES.filter((e) => !only || only.test(e.key))
  if (entries.length === 0) throw new Error('--only matched no entries')
  const outDir = typeof args.out === 'string' ? path.resolve(args.out) : DEFAULT_OUT
  if (args.apply) return apply(entries, args)
  if (args.online)
    return online(entries, outDir, Number(args['pace-ms'] ?? 250))
  return offline(entries, outDir)
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  })
}
