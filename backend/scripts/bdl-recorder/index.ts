import { existsSync, readFileSync, statSync } from 'node:fs'
import * as path from 'node:path'
import { parseArgs } from 'node:util'

import { BDL_LEAGUE_KEYS, isBdlLeagueKey } from 'common/bdl/leagues'
import { acquireRecorderSlot } from './rate'
import { buildPlan, buildWatchPlan, PlanStep } from './plan'
import {
  createRecorder,
  defaultRecorderRate,
  maxPaidRecorderRate,
} from './recorder'

export function parseOptions(args: string[]) {
  const { values } = parseArgs({
    args,
    options: {
      'key-file': { type: 'string' },
      out: { type: 'string' },
      'spec-dir': { type: 'string' },
      leagues: { type: 'string', default: 'all' },
      plan: { type: 'boolean' },
      rate: { type: 'string', default: String(defaultRecorderRate) },
      resume: { type: 'boolean' },
      probe: { type: 'string' },
      watch: { type: 'string' },
      'free-tier': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
    },
  })
  const selected =
    values.leagues === 'all'
      ? [...BDL_LEAGUE_KEYS]
      : [...new Set(values.leagues!.split(','))]
  if (!selected.length || !selected.every(isBdlLeagueKey))
    throw new Error('Unknown BDL league.')
  const rate = Number(values.rate)
  if (!Number.isFinite(rate) || rate <= 0 || rate > maxPaidRecorderRate)
    throw new Error('Invalid --rate.')
  const watch = values.watch?.split(':')
  if (
    watch &&
    (watch.length !== 2 ||
      !isBdlLeagueKey(watch[0]) ||
      !/^[a-z0-9_-]+$/i.test(watch[1]))
  )
    throw new Error('Use --watch <league>:<event-id>.')
  if (
    watch &&
    values.leagues !== 'all' &&
    !selected.includes(watch[0] as (typeof selected)[number])
  )
    throw new Error('The watched event must belong to the selected leagues.')
  if (
    [!!watch, !!values.probe, !!values['free-tier']].filter(Boolean).length > 1
  )
    throw new Error('Choose a watch, probe or free-tier run.')
  // Private worktrees live at <build>/wt/<task>. Standalone users can set
  // BDL_BUILD_DIR or supply explicit spec and output locations.
  const repo = path.resolve(__dirname, '../../..')
  const project =
    process.env.BDL_BUILD_DIR ??
    (path.basename(path.dirname(repo)) === 'wt'
      ? path.resolve(repo, '../..')
      : undefined)
  const specDir =
    values['spec-dir'] ??
    process.env.BDL_SPEC_DIR ??
    (project && path.join(project, 'research', 'specs'))
  const out =
    values.out ??
    process.env.BDL_RECORDINGS_DIR ??
    (project && path.join(project, 'recordings'))
  return { values, selected, watch, rate, specDir, out }
}

function printPlan(steps: PlanStep[], output: (line: string) => void) {
  for (const step of steps) {
    const { path: endpoint, params } = step.preview
    const query = new URLSearchParams()
    for (const [name, value] of Object.entries(params)) {
      for (const item of Array.isArray(value) ? value : [value])
        query.append(name, String(item))
    }
    const suffix = query.size ? '?' + query.toString() : ''
    output(
      'GET ' +
        endpoint +
        suffix +
        (step.paginate ? ' [follow returned cursors]' : '') +
        '  ' +
        step.label
    )
  }
  const fixed = steps.filter((step) => !step.dependsOn?.length)
  const follow = steps.length - fixed.length
  const paginated = steps.some((step) => step.paginate)
  output(
    'Total planned request templates: ' +
      steps.length +
      '. ' +
      (follow || paginated
        ? fixed.length +
          ' initial requests; ' +
          follow +
          ' data-dependent templates. Returned IDs and cursors determine additional HTTP calls.'
        : 'Exactly ' + fixed.length + ' HTTP calls before retries.')
  )
}

const usage = [
  'From backend/scripts: npx ts-node bdl-recorder/index.ts [options]',
  '--plan --leagues all                         Show all requests without network access.',
  '--free-tier --leagues mma,nba --rate 3       Record the two free-tier smoke samples.',
  '--key-file <file> --out <dir> --resume       Record outside Git and reuse successful responses.',
  '--probe <id|all> --leagues <list>            Record evidence for a named probe.',
  '--watch <league>:<id>                        Poll an event every 60 seconds until interrupted.',
  '--spec-dir <dir>                             Directory of public league OpenAPI YAML files.',
  '--rate <n>                                   Global requests/minute, including retries (default 3).',
].join('\n')

export async function main(
  args: string[],
  output: (line: string) => void = console.log
) {
  const { values, selected, watch, rate, specDir, out } = parseOptions(args)
  if (values.help) {
    output(usage)
    return
  }
  if (!specDir || !existsSync(specDir))
    throw new Error('Supply the public league specs with --spec-dir.')
  const now = new Date()
  const watchSteps = (at: Date) =>
    buildWatchPlan({ specDir, league: watch![0], id: watch![1], now: at })
  const plans = watch
    ? [watchSteps(now)]
    : values.probe
    ? [buildPlan({ specDir, leagues: selected, probe: values.probe, now })]
    : selected.map((league) =>
        buildPlan({
          specDir,
          leagues: [league],
          freeTier: values['free-tier'],
          now,
        })
      )
  if (values.plan) {
    printPlan(plans.flat(), output)
    return
  }
  if (!out)
    throw new Error('Supply the private recording directory with --out.')
  if (!values['key-file']) throw new Error('A live call requires --key-file.')
  const keyFile = values['key-file']
  if (!statSync(keyFile).isFile())
    throw new Error('--key-file must be a regular file.')
  const key = readFileSync(keyFile, 'utf8').trim()
  const recorder = createRecorder({
    out,
    key,
    rate,
    resume: values.resume,
    acquireSharedSlot: acquireRecorderSlot,
  })
  const controller = new AbortController()
  const stop = () => controller.abort()
  try {
    if (watch) {
      process.once('SIGINT', stop)
      process.once('SIGTERM', stop)
      await recorder.watch(watch[0], watch[1], watchSteps, controller.signal)
    } else {
      for (const steps of plans) await recorder.run(steps)
    }
    if (values['free-tier'] && recorder.summary.unauthorized > 0)
      throw new Error('Free-tier access check returned 401.')
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Recorder failed.'
    throw new Error(
      key && message.includes(key)
        ? 'Recorder failed. Credential omitted.'
        : message
    )
  } finally {
    process.removeListener('SIGINT', stop)
    process.removeListener('SIGTERM', stop)
    output(JSON.stringify({ ...recorder.summary, out: path.resolve(out) }))
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Recorder failed.')
    process.exitCode = 1
  })
}
