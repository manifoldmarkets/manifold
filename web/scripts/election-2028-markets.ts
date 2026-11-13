// Writes web/public/data/election-markets-2028.json: every official
// @ManifoldPolitics election market for 2027–2036 with its id (fixed before
// the market exists), so /election picks them up as they're created with no
// hand edits. Re-run whenever either script's markets change:
//
//   cd web
//   TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node"}' \
//     node --no-experimental-strip-types -r ts-node/register/transpile-only \
//     -r tsconfig-paths/register scripts/election-2028-markets.ts \
//     [--national-plan <out/plan.json>] [--pipeline <elections-2028-2036 dir>]
//
// Sources, read as data (web code never imports backend code):
// - the national script's offline plan (backend/scripts/elections-2028); without
//   --national-plan it runs that dry run itself (no network, no credentials);
// - the per-race pipeline's five manifests and their offline dry-run plans
//   (branch elections-2028-2036), for the reserved ids.
import { execSync } from 'child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import {
  classifyNational,
  classifyPipeline,
  MarketRef,
  NationalPlanRow,
  OfficialMarketsFile,
  PipelineEntry,
} from 'web/lib/politics/official-markets'

const REPO = resolve(__dirname, '../..')
const OUT = join(REPO, 'web/public/data/election-markets-2028.json')
const CYCLES = [2028, 2030, 2032, 2034, 2036]
const DEFAULT_PIPELINE =
  'C:/Projects/manifold-elections-2028/backend/scripts/elections-2028-2036'

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

const readJson = <T>(file: string): T => JSON.parse(readFileSync(file, 'utf8'))

function nationalPlan(): { rows: NationalPlanRow[]; source: string } {
  let file = arg('national-plan')
  if (!file) {
    const dir = mkdtempSync(join(tmpdir(), 'national-plan-'))
    execSync(
      `npx ts-node --transpile-only elections-2028/create-national-markets.ts --out "${dir}"`,
      { cwd: join(REPO, 'backend/scripts'), stdio: 'ignore' }
    )
    file = join(dir, 'plan.json')
  }
  const plan = readJson<{ series?: string; rows: NationalPlanRow[] }>(file)
  return {
    rows: plan.rows,
    source: `${plan.series ?? 'national'} (${plan.rows.length})`,
  }
}

function pipelineMarkets(dir: string) {
  const markets: Record<string, MarketRef> = {}
  const series: string[] = []
  for (const cycle of CYCLES) {
    const manifest = readJson<{ series: string; entries: PipelineEntry[] }>(
      join(dir, String(cycle), 'manifest.json')
    )
    const plan = readJson<{
      plan: { raceKey: string; idempotencyKey: string }[]
    }>(join(dir, String(cycle), 'out', 'dry-run-plan.json'))
    const ids = new Map(plan.plan.map((p) => [p.raceKey, p.idempotencyKey]))
    series.push(manifest.series)
    for (const entry of manifest.entries) {
      if (entry.status !== 'ready') continue
      const id = ids.get(entry.raceKey)
      if (!id) {
        const message = `${entry.raceKey}: no reserved id in ${cycle}/out/dry-run-plan.json; regenerate the pipeline's dry run`
        // --allow-missing: a snapshot while the pipeline is mid-change.
        if (!process.argv.includes('--allow-missing')) throw new Error(message)
        console.warn(`SKIPPED ${message}`)
        continue
      }
      markets[entry.raceKey] = classifyPipeline(entry, id)
    }
  }
  return { markets, series }
}

function main() {
  const pipelineDir =
    arg('pipeline') ?? process.env.PIPELINE_DIR ?? DEFAULT_PIPELINE
  if (!existsSync(pipelineDir))
    throw new Error(
      `Pipeline directory not found: ${pipelineDir} (pass --pipeline)`
    )

  const national = nationalPlan()
  const pipeline = pipelineMarkets(pipelineDir)
  const markets: Record<string, MarketRef> = { ...pipeline.markets }
  for (const row of national.rows) {
    if (markets[row.key]) throw new Error(`duplicate key ${row.key}`)
    markets[row.key] = classifyNational(row)
  }
  const ids = new Set<string>()
  for (const [key, m] of Object.entries(markets)) {
    if (ids.has(m.id)) throw new Error(`duplicate id ${m.id} (${key})`)
    ids.add(m.id)
  }

  let pipelineCommit = 'unknown'
  try {
    pipelineCommit = execSync('git rev-parse --short HEAD', {
      cwd: pipelineDir,
    })
      .toString()
      .trim()
  } catch {
    // Not a git checkout; the series names still identify the manifests.
  }
  const file: OfficialMarketsFile = {
    generatedAt: new Date().toISOString(),
    sources: {
      national: national.source,
      pipeline: `${pipeline.series.join(', ')} @ ${pipelineCommit}`,
    },
    markets: Object.fromEntries(
      Object.keys(markets)
        .sort()
        .map((k) => [k, markets[k]])
    ),
  }
  // One market per line keeps diffs readable.
  const lines = Object.entries(file.markets).map(
    ([k, m]) => `    ${JSON.stringify(k)}: ${JSON.stringify(m)}`
  )
  writeFileSync(
    OUT,
    `{\n  "generatedAt": ${JSON.stringify(
      file.generatedAt
    )},\n  "sources": ${JSON.stringify(
      file.sources
    )},\n  "markets": {\n${lines.join(',\n')}\n  }\n}\n`
  )
  const byKind: Record<string, number> = {}
  for (const m of Object.values(markets))
    byKind[m.kind] = (byKind[m.kind] ?? 0) + 1
  console.log(`Wrote ${OUT}: ${ids.size} markets`, byKind)
}

main()
