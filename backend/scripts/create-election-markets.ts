// Creates the reviewed 2026 general-election markets listed in a manifest.
//
// DRY RUN (default; no credentials, no writes):
//   cd backend/scripts
//   npx ts-node create-election-markets.ts \
//     --manifest elections-2026/manifest.json --out elections-2026/out
//   Add --online to re-run the read-only duplicate search against the public
//   API (unauthenticated GETs only).
//
// APPLY (only after the manifest's `review` and `budget` blocks are filled in
// by a reviewer; never run by the audit that produced the manifest):
//   MANIFOLD_API_KEY=<key of the creator account> npx ts-node create-election-markets.ts \
//     --manifest elections-2026/manifest.json --state elections-2026/state.prod.json \
//     --env prod --apply --creator-username <username> --max-mana <cap for this run>
//   The first apply for a manifest and environment also needs --init-state;
//   later runs must point at that same state file. --env has no default here.
//   Add --quiet to create unlisted, verify prices, then publish without the
//   public-creation follower notifications/emails.
//
// Apply re-checks the reserved ids and searches for equivalent markets before
// every create, persists the state file after every request, stops on any
// ambiguous outcome, and never creates an entry twice. See
// backend/shared/src/elections/election-market-creation.ts.

import * as fs from 'fs'
import * as path from 'path'
import {
  API_BASES,
  applyManifest,
  buildDashboardMapping,
  CreationState,
  costOf,
  emptyState,
  findExisting,
  idempotencyKeyFor,
  isMeasureEntry,
  makeHttpApi,
  Manifest,
  MeasureManifestEntry,
  planOffline,
  validateManifest,
} from 'shared/elections/election-market-creation'

type Args = Record<string, string | boolean>
function parseArgs(argv: string[]): Args {
  const out: Args = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (!a.startsWith('--')) continue
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

const readJson = <T>(file: string): T =>
  JSON.parse(fs.readFileSync(file, 'utf8'))
function writeAtomic(file: string, data: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}`
  fs.writeFileSync(
    tmp,
    typeof data === 'string' ? data : JSON.stringify(data, null, 2)
  )
  fs.renameSync(tmp, file)
}

function report(
  manifest: Manifest,
  state: CreationState,
  plan: ReturnType<typeof planOffline>,
  online?: Record<string, string[]>
) {
  const lines: string[] = []
  const by = (a: string) => plan.filter((p) => p.action === a)
  const total = by('create').reduce((s, p) => s + (p.cost?.total ?? 0), 0)
  const byOffice: Record<string, { n: number; mana: number }> = {}
  for (const p of by('create')) {
    const office = p.raceKey.split('-')[1]
    byOffice[office] ??= { n: 0, mana: 0 }
    byOffice[office].n++
    byOffice[office].mana += p.cost?.total ?? 0
  }
  lines.push(`# Election market creation — ${manifest.manifestVersion}`)
  lines.push('')
  lines.push(
    `Series \`${manifest.series}\` · ${
      manifest.entries.length
    } manifest entries · review approved: **${
      manifest.review.approved
    }** · approved budget: ${
      manifest.budget.approvedMaxTotalMana ?? '**not set**'
    }`
  )
  lines.push('')
  lines.push(`| action | races |\n|---|---|`)
  for (const a of [
    'create',
    'already-created',
    'skip-existing',
    'needs-review',
    'pending-reconciliation',
    'failed-earlier',
    'unresolved',
  ])
    lines.push(`| ${a} | ${by(a).length} |`)
  lines.push('')
  lines.push(
    `**Estimated cost of planned creations: Ṁ${total.toLocaleString(
      'en-US'
    )}** (ante incl. per-answer charges + extra liquidity; the API charges nothing else at creation).`
  )
  for (const [o, v] of Object.entries(byOffice))
    lines.push(`- ${o}: ${v.n} markets, Ṁ${v.mana.toLocaleString('en-US')}`)
  // Optional upgrades (ballot measures): the reviewer may raise these entries
  // to their recommended tier; the payloads above use the baseline tier.
  const upgrades = manifest.entries.filter(
    (e): e is MeasureManifestEntry =>
      isMeasureEntry(e) &&
      e.status === 'ready' &&
      by('create').some((p) => p.raceKey === e.raceKey) &&
      (e.liquidityPlan?.enhancedTier ?? 0) > (e.payload?.liquidityTier ?? 0)
  )
  if (upgrades.length) {
    const extra = upgrades.reduce(
      (s, e) =>
        s +
        costOf({
          ...e.payload!,
          liquidityTier: e.liquidityPlan!.enhancedTier!,
        }).total -
        costOf(e.payload!).total,
      0
    )
    lines.push(
      `- optional enhanced liquidity: ${
        upgrades.length
      } measures raised to their recommended tier add Ṁ${extra.toLocaleString(
        'en-US'
      )} (total Ṁ${(total + extra).toLocaleString('en-US')})`
    )
  }
  lines.push('')
  lines.push(
    'Seed probabilities below are SEEDS for the initial pool, not observed market forecasts.'
  )
  lines.push('')
  for (const entry of manifest.entries) {
    const p = plan.find((x) => x.raceKey === entry.raceKey)!
    lines.push(`## ${entry.raceKey} — ${p.action}`)
    if (entry.status !== 'ready') {
      lines.push(`Unresolved: ${(entry.unresolvedFields ?? []).join('; ')}`)
      lines.push('')
      continue
    }
    const pl = entry.payload!
    const c = costOf(pl)
    lines.push(`**${pl.question}**`)
    if (isMeasureEntry(entry)) {
      const m = entry.measure
      lines.push(
        `- ${m.stateName} · ${m.designation?.label ?? 'no official number'} · ${
          m.measureType
        }${m.advisory ? ' · advisory' : ''}${
          m.secondVoteOf ? ` · second vote (${m.secondVoteOf})` : ''
        }`
      )
      lines.push(`- YES means: ${entry.yesMeaning}`)
      lines.push(`- approval rule: ${m.approvalRule}`)
      lines.push(
        `- BINARY · seed ${pl.initialProb}%${
          !entry.seed?.needsReview
            ? ''
            : /^unsupported/i.test(entry.seed.basis ?? '')
            ? ' (REVIEW: unsupported default seed)'
            : ' (REVIEW: judgement call on the cited evidence)'
        } · close ${new Date(pl.closeTime).toISOString()} · tier ${
          pl.liquidityTier
        } → **Ṁ${c.total}**${
          entry.liquidityPlan?.enhancedTier
            ? ` · recommended upgrade: tier ${
                entry.liquidityPlan.enhancedTier
              } (${entry.liquidityPlan.enhancedRationale ?? ''})`
            : ''
        }`
      )
      lines.push(`- seed basis: ${entry.seed?.basis}`)
      lines.push(`- official source: ${m.officialSourceUrl}`)
      lines.push(
        `- reserved idempotency key (not yet a contract): \`${p.idempotencyKey}\``
      )
      if (online?.[entry.raceKey]?.length)
        lines.push(`- online recheck: ${online[entry.raceKey].join('; ')}`)
      lines.push('')
      continue
    }
    lines.push(
      `- ${entry.proposition} · ${pl.outcomeType} · sum-to-one ${
        pl.shouldAnswersSumToOne
      } · close ${new Date(pl.closeTime).toISOString()} · tier ${
        pl.liquidityTier
      }${pl.extraLiquidity ? ` + Ṁ${pl.extraLiquidity}` : ''} → **Ṁ${c.total}**`
    )
    lines.push(
      `- answers (seed %): ${(pl.answers ?? [])
        .map((a, i) => `${a} ${pl.answerProbs?.[i]}%`)
        .join(' · ')}`
    )
    lines.push(`- seed basis: ${entry.seed?.basis}`)
    lines.push(
      `- liquidity: ${entry.liquidityPlan?.rationale ?? ''}${
        entry.liquidityPlan?.alternatives
          ? ` Alternatives: ${entry.liquidityPlan.alternatives}`
          : ''
      }`
    )
    lines.push(
      `- reserved idempotency key (not yet a contract): \`${p.idempotencyKey}\``
    )
    if (online?.[entry.raceKey]?.length)
      lines.push(`- online recheck: ${online[entry.raceKey].join('; ')}`)
    lines.push('')
  }
  return lines.join('\n')
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const manifestFile = String(args.manifest ?? '')
  if (!manifestFile) throw new Error('--manifest <file> is required')
  const manifest = readJson<Manifest>(manifestFile)
  const outDir = String(
    args.out ?? path.join(path.dirname(manifestFile), 'out')
  )
  const stateFile = args.state ? String(args.state) : undefined
  const loadState = (): CreationState =>
    stateFile && fs.existsSync(stateFile)
      ? readJson(stateFile)
      : emptyState(manifest)
  const env = (args.env ?? 'prod') as keyof typeof API_BASES
  const apiBase = API_BASES[env]
  if (!apiBase)
    throw new Error(`--env must be one of ${Object.keys(API_BASES).join(', ')}`)

  const errors = validateManifest(manifest)

  if (!args.apply) {
    const state = loadState()
    const plan = planOffline(manifest, state)
    // Dry run: the client below cannot write, and no key is read or sent.
    let online: Record<string, string[]> | undefined
    if (args.online) {
      const api = makeHttpApi({ apiBase, allowWrites: false })
      online = {}
      for (const entry of manifest.entries.filter(
        (e) => e.status === 'ready'
      )) {
        const key = idempotencyKeyFor(manifest.series, entry.raceKey)
        const atKey = await api.getMarket(key)
        const found = await findExisting(entry, api)
        online[entry.raceKey] = [
          ...(atKey
            ? [
                `a market already exists at the reserved id ${key}: ${atKey.question}`,
              ]
            : []),
          ...found.equivalent.map(
            (v) => `EQUIVALENT ${v.m.id} "${v.m.question}" (${v.reason})`
          ),
          ...found.ambiguous.map(
            (v) => `AMBIGUOUS ${v.m.id} "${v.m.question}" (${v.reason})`
          ),
        ]
        await new Promise((r) => setTimeout(r, 300))
      }
    }
    writeAtomic(
      path.join(outDir, 'dry-run-report.md'),
      report(manifest, state, plan, online) +
        (args.quiet
          ? '\nQuiet mode: create unlisted, verify prices, then publish through the visibility update API.\n'
          : '')
    )
    writeAtomic(
      path.join(outDir, 'dry-run-payloads.json'),
      manifest.entries
        .filter((e) => e.status === 'ready')
        .map((e) => ({
          raceKey: e.raceKey,
          reservedIdempotencyKey: idempotencyKeyFor(manifest.series, e.raceKey),
          cost: costOf(e.payload!),
          payload: args.quiet
            ? { ...e.payload!, visibility: 'unlisted' }
            : e.payload,
          ...(args.quiet ? { afterCreation: { visibility: 'public' } } : {}),
        }))
    )
    writeAtomic(path.join(outDir, 'dry-run-plan.json'), {
      validationErrors: errors,
      plan,
    })
    writeAtomic(
      path.join(outDir, 'dry-run-dashboard-mapping.json'),
      buildDashboardMapping(manifest, state)
    )
    const counts = plan.reduce<Record<string, number>>(
      (m, p) => ((m[p.action] = (m[p.action] ?? 0) + 1), m),
      {}
    )
    const total = plan
      .filter((p) => p.action === 'create')
      .reduce((s, p) => s + (p.cost?.total ?? 0), 0)
    console.log(
      JSON.stringify(
        {
          mode: 'dry-run',
          online: !!args.online,
          quiet: !!args.quiet,
          validationErrors: errors.length,
          counts,
          estimatedManaForPlannedCreations: total,
          outDir,
        },
        null,
        2
      )
    )
    if (errors.length) {
      console.log(errors.join('\n'))
      process.exitCode = 1
    }
    return
  }

  // Apply.
  if (!args.env)
    throw new Error('--env prod|dev is required with --apply (no default)')
  if (!stateFile)
    throw new Error(
      '--state <file> is required with --apply (it records every request)'
    )
  // The state file is the only record of earlier creations and spend; a
  // mistyped path must not silently start from zero.
  const apiKey = process.env.MANIFOLD_API_KEY
  if (!apiKey)
    throw new Error(
      'MANIFOLD_API_KEY must be set in the environment for --apply'
    )
  // One apply per state file: concurrent runs would overwrite each other's
  // records and could each spend up to --max-mana. A crash leaves the lock
  // behind on purpose; remove it once no run is active.
  const lockFile = `${stateFile}.lock`
  let lockFd: number
  try {
    lockFd = fs.openSync(lockFile, 'wx')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
    throw new Error(
      `${lockFile} exists: another apply may be running on this state file. Delete it only if none is.`
    )
  }
  const api = makeHttpApi({ apiBase, apiKey, allowWrites: true })
  let state: CreationState
  let result
  try {
    fs.writeSync(lockFd, `pid ${process.pid} at ${new Date().toISOString()}\n`)
    // Load only after taking the lock, so a just-finished run cannot leave
    // this process holding an older snapshot of its spend and review blocks.
    if (!fs.existsSync(stateFile) && !args['init-state'])
      throw new Error(
        `State file ${stateFile} does not exist. Check the path, or pass --init-state to start a new one for this manifest and environment.`
      )
    state = loadState()
    result = await applyManifest(
      manifest,
      state,
      api,
      {
        apply: true,
        apiBase,
        creatorUsername: args['creator-username']
          ? String(args['creator-username'])
          : undefined,
        maxTotalMana: args['max-mana'] ? Number(args['max-mana']) : undefined,
        retryUnconfirmed: !!args['retry-unconfirmed'],
        quiet: !!args.quiet,
        log: (l) => console.log(l),
      },
      (s) => writeAtomic(stateFile, s)
    )
    writeAtomic(
      path.join(outDir, `dashboard-mapping.${env}.json`),
      buildDashboardMapping(manifest, state)
    )
  } finally {
    fs.closeSync(lockFd)
    fs.unlinkSync(lockFile)
  }
  console.log(JSON.stringify({ mode: 'apply', env, ...result }, null, 2))
  if (result.stoppedReason || result.failed.length || result.pending.length)
    process.exitCode = 1
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
