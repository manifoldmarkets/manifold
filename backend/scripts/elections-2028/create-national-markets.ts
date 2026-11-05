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
// apply with a new state file)  --allow-duplicate <key>=<id>,... (an existing
// market reviewed as NOT duplicating that entry)  --accept-criteria <key>,...
// (a created, unpublished market was edited on the site to match the
// manifest; checked against the site, then published).
//
// Apply safeguards: a lock file next to the state file (one run per state
// file); before every create, a check that the creator has no open market
// asking the same question (the entry is skipped, not created, if it does);
// and the criteria each market was created with are saved, so a market is
// never published after the manifest's question, description, answers,
// close time, topics or tier changed under it.

import * as fs from 'fs'
import * as path from 'path'
import {
  buildPayload,
  changedCriteria,
  costOf,
  Criteria,
  criteriaHash,
  criteriaOf,
  DEM,
  ENTRIES,
  Entry,
  MANIFOLD_POLITICS_ID,
  MANIFOLD_POLITICS_USERNAME,
  needsOnline,
  priceMismatches,
  PRIMARY_STATES,
  REP,
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

// Light stemming so "presidential nominee" matches "nominee for president",
// and common shorthand ("Dem", "VP pick", "gubernatorial") reads as the word.
const STEMS: Record<string, string> = {
  presidential: 'president',
  presidency: 'president',
  potus: 'president',
  democrat: 'democratic',
  democrats: 'democratic',
  dem: 'democratic',
  dems: 'democratic',
  republicans: 'republican',
  gop: 'republican',
  nomination: 'nominee',
  nominated: 'nominee',
  nominate: 'nominee',
  nominees: 'nominee',
  pick: 'nominee',
  picks: 'nominee',
  elected: 'elect',
  controls: 'control',
  wins: 'win',
  primaries: 'primary',
  caucus: 'primary',
  caucuses: 'primary',
  contest: 'primary',
  vp: 'vice',
  governorship: 'governor',
  gubernatorial: 'governor',
}

// Words that tell sibling markets apart: the party (and whether it's a party
// market at all), the office, the kind of count. Questions that differ in one
// of these, or in the states they name, ask different things however alike
// the rest is. Words that only label a question ("Balance of power:",
// "electoral college", "primary" for a nomination) aren't markers: siblings
// already differ in a state or a party where those words would matter.
const MARKERS = new Set([
  'party', 'democratic', 'republican', 'vice', 'popular', 'margin', 'tipping',
  'contested', 'convention', 'governor', 'senate', 'house', 'congress', 'lose',
])

// States read as one token each ("xst" + postal code), so "NH", "New
// Hampshire" and "New Hampshire's" match. Longer names are replaced first,
// so "West Virginia" isn't also Virginia.
const stateToken = (code: string) => `xst${code.toLowerCase()}`
const STATE_CODES = new Set(PRIMARY_STATES.map((s) => s.code))
const STATE_NAMES = PRIMARY_STATES.filter((s) => s.code !== 'DC')
  .map((s) => ({ code: s.code, name: s.state.toLowerCase() }))
  .sort((a, b) => b.name.length - a.name.length)

function questionWords(question: string): string[] {
  // DC first, so "Washington, D.C." isn't the state of Washington.
  let q = ` ${question} `
    .replace(/\bwashington,?\s+d\.?\s?c\b\.?/gi, ` ${stateToken('DC')} `)
    .replace(/\bdistrict of columbia\b/gi, ` ${stateToken('DC')} `)
    .replace(/\bD\.\s?C\b\.?/g, ` ${stateToken('DC')} `)
  // Postal codes count only in capitals ("NH", "NE-2"): lower-cased, "in",
  // "or" and "me" are words. A question written in capitals gives none.
  const letters = question.replace(/[^A-Za-z]/g, '')
  const capitals = question.replace(/[^A-Z]/g, '')
  if (capitals.length <= letters.length / 2)
    q = q.replace(/\b[A-Z]{2}\b/g, (c) => (STATE_CODES.has(c) ? ` ${stateToken(c)} ` : c))
  q = q
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Unlike normalizeName, keep what's in parentheses: "(2028)" is a year.
    .replace(/[’‘'"“”.,?!:;()[\]]/g, ' ')
    .replace(/[-–—_/]/g, ' ')
    .replace(/\s+/g, ' ')
  q = ` ${q.trim()} `
  // "Democratic Party" names a party; "party" alone marks a party market
  // ("Which party will win…"), so the name mustn't read as one.
  q = q.replace(/(?<= )(democratic|democrat|republican|gop) party(?= )/g, '$1')
  for (const { code, name } of STATE_NAMES)
    q = q.replace(new RegExp(`(?<= )${name}(?= )`, 'g'), stateToken(code))
  return q
    .trim()
    .split(' ')
    .map((t) => STEMS[t] ?? t)
    .filter(Boolean)
}

export function statesIn(question: string) {
  return new Set(
    questionWords(question)
      .filter((t) => t.startsWith('xst') && t.length === 5)
      .map((t) => t.slice(3).toUpperCase())
  )
}

const questionTokens = (q: string) =>
  new Set(questionWords(q).filter((t) => !QUESTION_STOPWORDS.has(t)))

const markersOf = (q: string) =>
  [...new Set(questionWords(q).filter((t) => MARKERS.has(t)))].sort().join(',')

// The dry run lists anything at least this alike for a person to read; the
// apply gate needs 0.6 plus matching markers and states.
export const REVIEW_SIMILARITY = 0.4

// Likely duplicates: same years mentioned and token Jaccard ≥ minScore.
export function similarQuestions(
  question: string,
  candidates: MarketRow[],
  minScore = 0.6
) {
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
    .filter(({ m, score }) => score >= minScore && years(m.question) === y)
    .sort((p, q) => q.score - p.score)
}

// The dry run's list for a person to read: anything at least 0.4 alike, in
// the same years and states, that could be the same contest. A Democratic
// market can't duplicate a Republican one, nor a party market one about a
// single party's contest, so those pairs are left out (without that, every
// state primary would list the 2028 winner market and, once the pipeline
// has run, its state's race markets).
export function reviewMatches(question: string, candidates: MarketRow[]) {
  const sides = (q: string) => {
    const w = new Set(questionWords(q))
    return { market: w.has('party'), d: w.has('democratic'), r: w.has('republican') }
  }
  const states = (q: string) => [...statesIn(q)].sort().join(',')
  const a = sides(question)
  const s0 = states(question)
  return similarQuestions(question, candidates, REVIEW_SIMILARITY).filter(({ m }) => {
    if (states(m.question) !== s0) return false
    const b = sides(m.question)
    if ((a.market && (b.d || b.r)) || (b.market && (a.d || a.r))) return false
    return !((a.d || a.r) && (b.d || b.r) && (a.d !== b.d || a.r !== b.r))
  })
}

// The apply-time check. reviewMatches lists anything alike for a person to
// read in the dry run; this blocks a create only when an open market asks
// the same thing: same years, same markers, same states, similar wording.
// Sibling markets (each party's nominee, each state's primary, the national
// and state popular votes) differ in a marker or a state, so they never
// block each other; nor does a candidate market for a race we ask about by
// party (it's a related market, not the same question).
export function blockingDuplicates(question: string, candidates: MarketRow[]) {
  const states = (q: string) => [...statesIn(q)].sort().join(',')
  const m0 = markersOf(question)
  const s0 = states(question)
  return similarQuestions(question, candidates).filter(
    ({ m }) => markersOf(m.question) === m0 && states(m.question) === s0
  )
}

// One apply per state file: concurrent runs would overwrite each other's
// records and could each spend up to --max-mana. A crash leaves the lock
// behind on purpose; delete it once no run is active. (Same rule as the
// per-race pipeline's create-election-markets.ts.)
export function takeLock(statePath: string): () => void {
  const lockFile = `${statePath}.lock`
  fs.mkdirSync(path.dirname(path.resolve(lockFile)), { recursive: true })
  let fd: number
  try {
    fd = fs.openSync(lockFile, 'wx')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
    throw new Error(
      `${lockFile} exists: another apply may be running on this state file. Delete it only if none is.`
    )
  }
  fs.writeSync(fd, `pid ${process.pid} at ${new Date().toISOString()}\n`)
  return () => {
    fs.closeSync(fd)
    fs.unlinkSync(lockFile)
  }
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
  // Only candidate markets (people): not the tipping-point states, and not
  // the party markets, whose answers are parties.
  if (entry.key === '2028-tipping-point') return undefined
  if (seed.answers.every((a) => a === DEM || a === REP)) return undefined
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
  // Our own markets (at the reserved ids) are never duplicates of themselves.
  const ours = new Set(ENTRIES.map((x) => reservedIdFor(SERIES, x.key)))
  const open = mp.filter(
    (m) => !m.isResolved && (m.closeTime ?? Infinity) > now && !ours.has(m.id)
  )
  const duplicates = entries
    .map((e) => {
      const blocking = new Set(blockingDuplicates(e.question, open).map(({ m }) => m.id))
      return {
        key: e.key,
        question: e.question,
        // Wider than the apply gate: a person reads these.
        matches: reviewMatches(e.question, open).map(({ m, score }) => ({
          id: m.id,
          question: m.question,
          url: m.url,
          traders: m.uniqueBettorCount,
          score: Math.round(score * 100) / 100,
          // An apply skips the entry over this market (--allow-duplicate to override).
          blocksApply: blocking.has(m.id),
        })),
      }
    })
    .filter((d) => d.matches.length > 0)
  const blockingCount = duplicates.reduce(
    (n, d) => n + d.matches.filter((m) => m.blocksApply).length,
    0
  )

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
        (m) =>
          `- ${d.key}: "${m.question}" (${m.url ?? m.id}, ${m.traders ?? '?'} traders, similarity ${m.score})${
            m.blocksApply ? ' — BLOCKS at apply' : ''
          }`
      )
    ),
    '',
    `Would block at apply (same question; skipped unless --allow-duplicate <key>=<id>): ${blockingCount || 'none'}`,
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
  | 'skipped-duplicate'
  | 'stopped'

type StateRecord = {
  key: string
  reservedId: string
  status: Status
  contractId?: string
  url?: string
  cost?: number
  seed?: ResolvedSeed
  // The manifest criteria the market was created with, and their hash. A
  // run never verifies or publishes a market whose criteria have changed
  // since (it would go public with the old question or description).
  criteria?: Criteria
  criteriaHash?: string
  // The visibility it was created with: a resumed run publishes an unlisted
  // market whatever its own flags.
  visibility?: 'public' | 'unlisted'
  imagesAttached?: number
  // skipped-duplicate: the open markets by the creator that ask the same.
  duplicateOf?: { id: string; url?: string; question: string }[]
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
  const { acceptCriteria, allowDuplicates } = parseOverrides(args)

  // The lock comes before the state file is read, so a run that just
  // finished can't leave this one holding an older snapshot of it.
  const release = takeLock(statePath)
  try {
    await runApply(entries, args, {
      env,
      apiKey,
      creatorUsername,
      statePath,
      maxMana,
      quiet,
      paceMs,
      acceptCriteria,
      allowDuplicates,
    })
  } finally {
    release()
  }
}

// The overrides name exact keys: a pattern like "ohio" would also match the
// other party's Ohio market, and an id reviewed as not duplicating one entry
// may still duplicate another.
export function parseOverrides(args: Args) {
  const list = (flag: string) =>
    typeof args[flag] === 'string'
      ? String(args[flag]).split(',').map((s) => s.trim()).filter(Boolean)
      : []
  const isKey = (k: string) => ENTRIES.some((e) => e.key === k)
  const acceptCriteria = new Set(list('accept-criteria'))
  for (const k of acceptCriteria)
    if (!isKey(k)) throw new Error(`--accept-criteria: no entry has the key "${k}"`)
  const allowDuplicates = new Map<string, Set<string>>()
  for (const pair of list('allow-duplicate')) {
    const [key, id, extra] = pair.split('=')
    if (!key || !id || extra !== undefined || !isKey(key))
      throw new Error(`--allow-duplicate takes <key>=<market id> pairs; got "${pair}"`)
    allowDuplicates.set(key, (allowDuplicates.get(key) ?? new Set()).add(id))
  }
  return { acceptCriteria, allowDuplicates }
}

export type ApplyDeps = { api?: Api; prodRead?: Api }

export async function runApply(
  entries: Entry[],
  args: Args,
  opts: {
    env: 'prod' | 'dev'
    apiKey: string
    creatorUsername: string
    statePath: string
    maxMana: number
    quiet: boolean
    paceMs: number
    acceptCriteria: Set<string>
    allowDuplicates: Map<string, Set<string>>
  },
  // Tests pass fake clients; a real run builds both from the options.
  deps: ApplyDeps = {}
) {
  const { env, apiKey, creatorUsername, statePath, maxMana, quiet, paceMs } = opts
  const { acceptCriteria, allowDuplicates } = opts

  const api = deps.api ?? makeApi({
    apiBase: API_BASES[env],
    apiKey,
    allowWrites: true,
    paceMs,
  })
  // Seeds always come from prod community markets (public data).
  const prodRead =
    deps.prodRead ?? makeApi({ apiBase: API_BASES.prod, allowWrites: false, paceMs })

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
    e: Entry,
    payload: ReturnType<typeof buildPayload>
  ): Promise<MarketRow> => {
    const startedAt = Date.now()
    // A market found at the reserved id is adopted only if this create made
    // it. One made by an earlier run (the read before creating missed it)
    // has criteria this run doesn't know, so it isn't verified or published
    // blind. Two minutes' allowance for clock skew.
    const adopt = (m: MarketRow): MarketRow => {
      if (m.creatorId !== me.id)
        return stop(r, `reserved id ${r.reservedId} holds another account's market: ${m.url}`)
      const otherQuestion = normalizeName(m.question) !== normalizeName(e.question)
      if (otherQuestion || (m.createdTime !== undefined && m.createdTime < startedAt - 2 * 60_000)) {
        // Unknown criteria: the record forgets the ones saved for this
        // attempt, so publishing needs --accept-criteria's check on the site.
        delete r.criteria
        delete r.criteriaHash
        return stop(
          r,
          `${m.url} already existed when this run tried to create it${
            otherQuestion ? ` (asking "${m.question}")` : ''
          }, so the criteria it was created with aren't known. Edit it on the site to match the manifest if needed, set its status to "creating", then re-run with --accept-criteria ${e.key}: the run compares it with the manifest before publishing.`
        )
      }
      return m
    }
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
            if (m) return adopt(m)
          }
          return stop(r, `create rejected: ${lastMessage}`)
        }
        if (ae?.kind === 'rate-limited') {
          await sleep(ae.retryAfterMs ?? 30_000)
          continue
        }
        // Ambiguous: look for the market before trying again.
        const m = await readFresh(r.reservedId)
        if (m) return adopt(m)
      }
    }
    return stop(r, `create failed after retries: ${lastMessage}`)
  }

  // Duplicate check before every create: the reserved ids stop this script
  // from creating a market twice, but not from repeating one the creator
  // already has under another id. Reads the creator's open public markets
  // (refreshed every 5 minutes) and leaves out this manifest's reserved ids.
  const ours = new Set(ENTRIES.map((x) => reservedIdFor(SERIES, x.key)))
  let official: { at: number; rows: MarketRow[] } | undefined
  const duplicatesOf = async (e: Entry) => {
    if (!official || Date.now() - official.at > 5 * 60_000) {
      const at = Date.now()
      const rows = await api.marketsByUser(me.id)
      official = {
        at,
        rows: rows.filter(
          (m) => !m.isResolved && (m.closeTime ?? Infinity) > at && !ours.has(m.id)
        ),
      }
    }
    const allowed = allowDuplicates.get(e.key)
    return blockingDuplicates(
      e.question,
      official.rows.filter((m) => !allowed?.has(m.id))
    )
  }
  const skippedDuplicates: string[] = []
  // Once the budget or balance runs out, nothing more is created, but
  // markets earlier runs created still get verified and published.
  let creationsStopped = false

  try {
    for (const e of entries) {
      const reservedId = reservedIdFor(SERIES, e.key)
      const criteria = criteriaOf(e)
      const hash = criteriaHash(criteria)
      const r: StateRecord = (state.entries[e.key] ??= {
        key: e.key,
        reservedId,
        status: 'planned',
        updatedAt: new Date().toISOString(),
      })
      if (r.reservedId !== reservedId)
        throw new StopRun(`${e.key}: state reserved id ${r.reservedId} ≠ ${reservedId}`)
      if (r.status === 'published') {
        if (r.criteriaHash !== hash)
          console.warn(
            `${e.key}: published under earlier criteria (changed: ${changedCriteria(
              r.criteria,
              criteria
            ).join(', ')}); edit ${r.url} by hand if the change matters`
          )
        continue
      }
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
        // Ours if we made it with this question, or with the question saved
        // when it was created (a changed question is caught further down).
        const asked = normalizeName(existing.question)
        if (existing.creatorId !== me.id)
          stop(r, `reserved id ${reservedId} holds another account's market: ${existing.url}`)
        if (
          asked !== normalizeName(e.question) &&
          asked !== normalizeName(r.criteria?.question ?? '')
        )
          stop(
            r,
            `${existing.url} asks "${existing.question}", not this entry's question. Edit it on the site to match the manifest, set its status to "creating", then re-run with --accept-criteria ${e.key}.`
          )
        if (r.status === 'planned' || !r.seed)
          stop(
            r,
            `${existing.url} exists, but this state file has no record of creating it (a lost or new state file?). Restore its record from the old state file to carry on, set its status to "published" if it's already public and correct, or delete the market to create it afresh.`
          )
        if (r.status === 'creating') {
          // The visibility it was created with, not this run's flag. (No
          // record of it: unlisted, since publishing a public market again
          // changes nothing.)
          r.status = r.visibility === 'public' ? 'created-public' : 'created-unlisted'
          r.contractId = existing.id
          r.url = existing.url
          touch(r)
          save()
        }
      } else {
        if (
          r.status !== 'planned' &&
          r.status !== 'creating' &&
          r.status !== 'skipped-duplicate'
        )
          stop(r, `state says ${r.status} but ${reservedId} does not exist`)
        if (creationsStopped) continue
        // Skips this entry (not the run) when the creator already has an
        // open market asking the same; later runs check again.
        const dupes = await duplicatesOf(e)
        if (dupes.length) {
          r.status = 'skipped-duplicate'
          r.duplicateOf = dupes.map(({ m }) => ({ id: m.id, url: m.url, question: m.question }))
          touch(r)
          save()
          skippedDuplicates.push(e.key)
          console.warn(
            `${e.key}: SKIPPED, @${me.username} already has ${dupes
              .map(({ m }) => `"${m.question}" (${m.url ?? m.id})`)
              .join('; ')}. If it's a different market, re-run with --allow-duplicate ${dupes
              .map(({ m }) => `${e.key}=${m.id}`)
              .join(',')}`
          )
          continue
        }
        delete r.duplicateOf
        const seed = await resolveSeed(e, reader)
        const err = seedError(e, seed)
        if (err) stop(r, `seed error: ${err}`)
        const cost = costOf(e, seed)!
        const short =
          spent + cost > maxMana
            ? `Budget: ${e.key} costs ${mana(cost)}; run cap ${mana(maxMana)} with ${mana(spent)} spent.`
            : balance < cost
            ? `Balance ${mana(Math.floor(balance))} < ${mana(cost)} for ${e.key}.`
            : undefined
        if (short) {
          console.log(
            `${short} Creating nothing more this run; markets already created still get verified and published.`
          )
          creationsStopped = true
          continue
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
        r.criteria = criteria
        r.criteriaHash = hash
        r.visibility = payload.visibility
        r.imagesAttached = Array.isArray(payload.answerImageUrls)
          ? payload.answerImageUrls.length
          : 0
        r.status = 'creating'
        touch(r)
        save()
        const created = await createWithRetries(r, e, payload)
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

      // A market created under other criteria (the manifest was edited
      // between runs) is neither verified nor published: publishing would put
      // the old question or description in front of everyone. The record
      // keeps its status, so the next run picks it up once it's settled.
      if (r.criteriaHash !== hash) {
        const changed = changedCriteria(r.criteria, criteria).join(', ')
        if (r.status === 'created-public') {
          // --loud: it went public at creation; nothing left to hold back.
          console.warn(
            `${e.key}: created public under earlier criteria (changed: ${changed}); edit ${r.url} by hand if the change matters`
          )
        } else if (acceptCriteria.has(e.key)) {
          // Accepted only once the market on the site says what the manifest
          // says: question, description, fixed answers and topics compared
          // here (letters and digits), close time and answer mode by the
          // verification below, which runs again after accepting.
          const live = await readFresh(r.contractId ?? reservedId)
          const squash = (s: string) =>
            s.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g, '')
          const issues: string[] = []
          if (!live) issues.push("the market can't be read")
          else {
            if (squash(live.question) !== squash(e.question))
              issues.push(`its question on the site is "${live.question}"`)
            if (live.textDescription === undefined)
              issues.push('the API returned no description to compare')
            else if (squash(live.textDescription) !== squash(e.description))
              issues.push("its description on the site doesn't match the manifest's")
            if (criteria.answers) {
              const labels = (xs: string[]) => xs.map(squash).sort().join('|')
              const onSite = (live.answers ?? []).filter((a) => !a.isOther).map((a) => a.text)
              if (labels(onSite) !== labels(criteria.answers))
                issues.push("its answers on the site don't match the manifest's")
            }
            const wanted = e.topics.filter((slug) => topics.found.has(slug))
            if (live.groupSlugs === undefined)
              issues.push('the API returned no topics to compare')
            else {
              const missing = wanted.filter((slug) => !live.groupSlugs!.includes(slug))
              if (missing.length) issues.push(`it's missing the topics ${missing.join(', ')}`)
            }
          }
          if (issues.length)
            throw new StopRun(
              `${e.key}: --accept-criteria, but ${issues.join('; ')}. Edit ${r.url} to match first.`
            )
          console.log(
            `${e.key}: --accept-criteria: ${r.url} matches the manifest; recording its criteria (changed: ${changed})`
          )
          r.criteria = criteria
          r.criteriaHash = hash
          // Verify again, whatever the record said: the close time or answer
          // mode may have changed with the criteria.
          if (r.status === 'verified') r.status = 'created-unlisted'
          touch(r)
          save()
        } else {
          throw new StopRun(
            `${e.key}: ${r.url ?? reservedId} was created under earlier criteria (changed: ${changed}) and isn't published. Edit it on the site to match the manifest (it's unlisted), then re-run with --accept-criteria ${e.key}; or delete the market and this key's state record.`
          )
        }
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
        // An unlisted market still needs publishing, whatever this run's flag.
        r.status = r.status === 'created-unlisted' ? 'verified' : 'published'
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
  if (skippedDuplicates.length) {
    console.warn(
      `Skipped as duplicates of existing markets: ${skippedDuplicates.join(', ')} (see above)`
    )
    process.exitCode = 1
  }
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
