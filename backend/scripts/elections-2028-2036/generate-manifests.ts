// Generates one creation manifest per cycle (2028/2032/2036) in the 2026
// format, with Stage A prior seeds, plus a per-cycle race inventory and the
// list of prod topics that still need creating.
//
//   cd backend/scripts
//   npx ts-node --transpile-only elections-2028-2036/generate-manifests.ts \
//     [--cycle 2028] [--out-root elections-2028-2036] [--generated-at <ISO>]
//
// No network and no credentials. The output is reviewed and then fed to
// ../create-election-markets.ts (dry run by default).
import * as fs from 'fs'
import * as path from 'path'
import { MAX_GROUPS_PER_MARKET } from 'common/group'
import {
  costOf,
  Manifest,
  RaceManifestEntry,
  validateManifest,
} from 'shared/elections/election-market-creation'
import { Cycle, CYCLES, cycleConfig, EXPECTED_ELECTION_DATES } from './cycles'
import {
  EXPECTED_COUNTS,
  inventories,
  nationalResults,
  Race,
  racesFor,
  unitResults,
} from './inventory'
import { describeSeed, SeedResult, stageASeed } from './seeds'
import {
  ANSWER_META,
  ANSWERS,
  closeNote,
  descriptionFor,
  questionFor,
  roundFor,
  searchTermsFor,
  shapeRationale,
} from './templates'

export const LIQUIDITY_TIER = 1000

type Topics = {
  existing: Record<string, string>
  missing: { slug: string; suggestedName: string; usedBy: string[] }[]
  assignments: Record<string, string[]>
}

export function loadTopics(file = path.join(__dirname, 'topics.json')): Topics {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

// Contract ids a reviewer has looked at and rejected for a race (from the
// online dry run's findings). They stop blocking creation of that entry.
export type Rejections = Record<string, string[]>
export function loadRejections(
  file = path.join(__dirname, 'rejections.json')
): Rejections {
  if (!fs.existsSync(file)) return {}
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  const out: Rejections = {}
  for (const [key, ids] of Object.entries(parsed)) {
    if (key.startsWith('_')) continue
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string'))
      throw new Error(`rejections.json: ${key} must list contract ids`)
    out[key] = ids as string[]
  }
  return out
}

// Races to hold out of a run: they stay in the manifest as `unresolved`
// (no payload, no cost) so the dry run reports them and apply skips them.
export type Hold = { pattern: string; reason: string }
export function loadHolds(file = path.join(__dirname, 'holds.json')): Hold[] {
  if (!fs.existsSync(file)) return []
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  const holds: Hold[] = Array.isArray(parsed) ? parsed : parsed.holds ?? []
  for (const h of holds)
    if (!h.pattern || !h.reason)
      throw new Error('holds.json: every hold needs a pattern and a reason')
  return holds
}

// Resolves the office's topic slugs for a cycle to prod ids; missing slugs
// are reported, never invented (creation 404s on an unknown topic id).
export function topicIdsFor(
  topics: Topics,
  office: Race['office'],
  cycle: Cycle
): { ids: string[]; missing: string[] } {
  const slugs = (topics.assignments[office] ?? []).map((s) =>
    s.replace('<cycle>', String(cycle))
  )
  const ids: string[] = []
  const missing: string[] = []
  for (const slug of slugs) {
    const id = topics.existing[slug]
    if (id) ids.push(id)
    else missing.push(slug)
  }
  if (ids.length > MAX_GROUPS_PER_MARKET)
    throw new Error(
      `${office} ${cycle}: more than ${MAX_GROUPS_PER_MARKET} topics`
    )
  return { ids, missing }
}

export type GeneratedEntry = RaceManifestEntry & { seedResult: SeedResult }

export function buildEntry(
  race: Race,
  opts: { topics: Topics; missingTopics: Set<string>; rejections?: Rejections }
): RaceManifestEntry {
  const cfg = cycleConfig(race.cycle)
  const results = inventories.results()
  const seed = stageASeed({
    cycle: race.cycle,
    office: race.office,
    state: race.state,
    unit: race.state === 'US' ? {} : unitResults(results, race),
    national: nationalResults(results),
    nationalMarket: race.state === 'US',
  })
  const seedText = describeSeed(seed, race.cycle)
  const round = roundFor(race, cfg)
  const { ids, missing } = topicIdsFor(opts.topics, race.office, race.cycle)
  for (const m of missing) opts.missingTopics.add(m)
  const question = questionFor(race)
  const entry: RaceManifestEntry = {
    kind: 'race',
    raceKey: race.raceKey,
    status: 'ready',
    identity: {
      cycle: race.cycle,
      office: race.office,
      state: race.state,
      stateName: race.stateName,
      ...(race.district !== undefined ? { district: race.district } : {}),
      election: 'regular',
      round: round.text,
      candidateNames: [],
    },
    proposition: 'ballot-party',
    shapeRationale: shapeRationale(),
    payload: {
      question,
      descriptionMarkdown: descriptionFor(race, cfg, seedText),
      outcomeType: 'MULTIPLE_CHOICE',
      answers: [...ANSWERS],
      answerProbs: seed.probs,
      shouldAnswersSumToOne: true,
      addAnswersMode: 'DISABLED',
      closeTime: round.closeTime,
      liquidityTier: LIQUIDITY_TIER,
      groupIds: ids,
      visibility: 'public',
    },
    answerMeta: ANSWER_META.map((a) => ({ ...a })),
    seed: {
      basis: seedText,
      note: 'Initial pool probabilities only. Not an observed market forecast. Stage A prior; refresh with elections-2028-2036/market-seeds.ts after the 2026 results are certified.',
      ...({
        source: {
          kind: 'prior',
          formula: 'stage-a-presidential-lean',
          lean: Number(seed.lean.toFixed(3)),
          sigma: Number(seed.sigma.toFixed(3)),
          pDem: Number(seed.pDem.toFixed(4)),
          other: seed.other,
          yearsUsed: seed.yearsUsed,
          resultsSource: results.sources,
        },
      } as object),
    },
    liquidityPlan: {
      tier: LIQUIDITY_TIER,
      rationale:
        'Generic market opened years ahead: tier 1,000 everywhere (the brief). Raise after the 2026 results if a race is competitive enough that a Ṁ100 trade should move the price by a point rather than ten.',
      alternatives:
        'Lower: tier 100 (not recommended; repeats the shallow-market problem). Higher: tier 10,000 or +extraLiquidity for marquee races after the Stage B refresh.',
    },
    reviewedRejectedContractIds: [...(opts.rejections?.[race.raceKey] ?? [])],
    searchTerms: searchTermsFor(race),
    dashboard: {
      list: `${race.office === 'governor' ? 'governors' : race.office}${
        race.cycle
      }` as RaceManifestEntry['dashboard']['list'],
      key: race.dashboardKey,
      cycle: race.cycle,
      office: race.office,
    },
    evidence: {
      inventorySources: race.sources,
      seat: race.seat,
      ...(race.incumbentNote
        ? { incumbentOctober2026: race.incumbentNote }
        : {}),
      ...(race.electoralVotes !== undefined
        ? { electoralVotes2024Apportionment: race.electoralVotes }
        : {}),
      ...(race.redistricting ? { redistricting: race.redistricting } : {}),
      ...(missing.length ? { topicsMissing: missing } : {}),
    },
  }
  return entry
}

export function buildManifest(
  cycle: Cycle,
  opts: {
    topics?: Topics
    rejections?: Rejections
    holds?: Hold[]
    generatedAt?: string
    now?: number
  } = {}
): {
  manifest: Manifest
  missingTopics: string[]
  totalMana: number
  held: string[]
} {
  const cfg = cycleConfig(cycle)
  if (cfg.electionDate !== EXPECTED_ELECTION_DATES[cycle])
    throw new Error(
      `${cycle}: computed election day ${cfg.electionDate} != expected ${EXPECTED_ELECTION_DATES[cycle]}`
    )
  const topics = opts.topics ?? loadTopics()
  const rejections = opts.rejections ?? loadRejections()
  const holds = (opts.holds ?? loadHolds()).map((h) => ({
    ...h,
    re: new RegExp(h.pattern),
  }))
  const missingTopics = new Set<string>()
  const races = racesFor(cycle)
  const held: string[] = []
  const entries = races.map((race): RaceManifestEntry => {
    const entry = buildEntry(race, { topics, missingTopics, rejections })
    const hold = holds.find((h) => h.re.test(race.raceKey))
    if (!hold) return entry
    held.push(race.raceKey)
    const { payload: _payload, ...rest } = entry
    return {
      ...rest,
      status: 'unresolved',
      unresolvedFields: [`held: ${hold.reason}`],
    }
  })
  const counts: Record<string, number> = {}
  for (const e of entries)
    counts[e.identity.office] = (counts[e.identity.office] ?? 0) + 1
  for (const [office, n] of Object.entries(EXPECTED_COUNTS[cycle]))
    if ((counts[office] ?? 0) !== n)
      throw new Error(
        `${cycle} ${office}: generated ${counts[office] ?? 0}, expected ${n}`
      )
  const totalMana = entries.reduce(
    (s, e) => s + (e.status === 'ready' ? costOf(e.payload!).total : 0),
    0
  )
  const generatedAt = opts.generatedAt ?? new Date().toISOString()
  const manifest: Manifest = {
    kind: 'races',
    manifestVersion: `${generatedAt.slice(0, 10)}.1`,
    series: cfg.series,
    generatedAt,
    review: {
      approved: false,
      reviewedBy: null,
      reviewedAt: null,
      notes: `Generated by elections-2028-2036/generate-manifests.ts from the cited inventories with Stage A prior seeds (SEEDS.md). Not reviewed. Run market-seeds.ts after the November 3, 2026 results are certified, read seed-coverage.md, then approve. Creator: @ManifoldPolitics. Planned spend for this cycle: ${totalMana} mana at tier ${LIQUIDITY_TIER}${
        held.length ? `; ${held.length} entries held (holds.json)` : ''
      }.`,
    },
    budget: { approvedMaxTotalMana: totalMana },
    ...({
      defaults: {
        closeTimeUtc: new Date(cfg.closeTime).toISOString(),
        timezoneNote: closeNote(cfg),
      },
    } as object),
    entries,
  }
  const errors = validateManifest(manifest, opts.now ?? Date.now())
  if (errors.length)
    throw new Error(
      `${cycle}: generated manifest fails validation:\n${errors.join('\n')}`
    )
  return { manifest, missingTopics: [...missingTopics].sort(), totalMana, held }
}

export function inventoryFor(cycle: Cycle) {
  const races = racesFor(cycle)
  const cfg = cycleConfig(cycle)
  const byOffice: Record<string, number> = {}
  for (const r of races) byOffice[r.office] = (byOffice[r.office] ?? 0) + 1
  return {
    cycle,
    electionDate: cfg.electionDate,
    series: cfg.series,
    counts: byOffice,
    total: races.length,
    sources: {
      senate: inventories.senate().sources,
      governors: inventories.governors().sources,
      president: inventories.president().sources,
      ...(cycle === 2028 ? { house: inventories.house().sources } : {}),
    },
    notes: {
      senate: inventories.senate().notes,
      governors: inventories.governors().notes,
      president: inventories.president().notes,
    },
    races: races.map((r) => ({
      raceKey: r.raceKey,
      office: r.office,
      state: r.state,
      ...(r.district !== undefined ? { district: r.district } : {}),
      seat: r.seat,
      ...(r.incumbentNote ? { incumbentOctober2026: r.incumbentNote } : {}),
      ...(r.electoralVotes !== undefined
        ? { electoralVotes: r.electoralVotes }
        : {}),
      ...(r.redistricting ? { redistricting: r.redistricting } : {}),
      round: roundFor(r, cfg).text,
      closeTimeUtc: new Date(roundFor(r, cfg).closeTime).toISOString(),
    })),
  }
}

const writeJson = (file: string, data: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n')
}

function topicsNeededMarkdown(
  topics: Topics,
  missingByCycle: Record<string, string[]>
) {
  const lines = [
    '# Topics to create before launch',
    '',
    'Creation fails with a 404 on a missing topic id, so the generator attaches only topics that exist in prod. Create the ones below (Tod), paste their ids into `topics.json` → `existing`, and rerun `generate-manifests.ts`.',
    '',
    '| slug | suggested name | used by | modelled on |',
    '|---|---|---|---|',
  ]
  for (const m of topics.missing)
    lines.push(
      `| \`${m.slug}\` | ${m.suggestedName} | ${m.usedBy.join(', ')} | ${
        (m as { modelledOn?: string }).modelledOn ?? ''
      } |`
    )
  lines.push('', '## Missing per generated cycle', '')
  for (const [cycle, missing] of Object.entries(missingByCycle))
    lines.push(
      `- ${cycle}: ${
        missing.length ? missing.map((s) => `\`${s}\``).join(', ') : 'none'
      }`
    )
  lines.push('', '## Existing topics attached', '')
  for (const [slug, id] of Object.entries(topics.existing))
    lines.push(`- \`${slug}\` → \`${id}\``)
  return lines.join('\n') + '\n'
}

export function main(argv = process.argv.slice(2)) {
  const args: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++)
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2)
      const v = argv[i + 1]
      if (v === undefined || v.startsWith('--'))
        throw new Error(`--${k} needs a value`)
      args[k] = v
      i++
    } else throw new Error(`unexpected argument ${argv[i]}`)
  const outRoot = path.resolve(args['out-root'] ?? __dirname)
  const cycles = args.cycle ? [Number(args.cycle) as Cycle] : CYCLES
  const generatedAt = args['generated-at'] ?? new Date().toISOString()
  const topics = loadTopics()
  const missingByCycle: Record<string, string[]> = {}
  const summary: Record<string, unknown> = {}
  for (const cycle of cycles) {
    if (!CYCLES.includes(cycle))
      throw new Error(`--cycle must be one of ${CYCLES.join(', ')}`)
    const { manifest, missingTopics, totalMana, held } = buildManifest(cycle, {
      topics,
      generatedAt,
    })
    writeJson(path.join(outRoot, String(cycle), 'manifest.json'), manifest)
    writeJson(
      path.join(outRoot, 'inventories', `${cycle}.json`),
      inventoryFor(cycle)
    )
    missingByCycle[cycle] = missingTopics
    const counts: Record<string, number> = {}
    for (const e of manifest.entries)
      counts[(e as RaceManifestEntry).identity.office] =
        (counts[(e as RaceManifestEntry).identity.office] ?? 0) + 1
    summary[cycle] = {
      entries: manifest.entries.length,
      counts,
      totalMana,
      held: held.length,
      missingTopics,
    }
  }
  fs.writeFileSync(
    path.join(outRoot, 'topics-needed.md'),
    topicsNeededMarkdown(topics, missingByCycle)
  )
  console.log(
    JSON.stringify({ outRoot, generatedAt, cycles: summary }, null, 2)
  )
}

if (require.main === module) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
