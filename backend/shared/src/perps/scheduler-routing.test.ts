import { readFileSync } from 'fs'
import { resolve } from 'path'
import { runInNewContext } from 'vm'
import { ModuleKind, transpileModule } from 'typescript'
import { compact } from 'lodash'
import { MNX_INSTRUMENTS } from 'common/perps/mnx'
import { ORACLE_FEEDS } from '../oracle-feeds'

type Job = { name: string; schedule: string }
type JobSet = 'all' | 'main' | 'perps'

// Execute the real registry with inert job bodies and a recording Cron
// constructor. Checking the returned array alone would miss excluded jobs
// that were constructed (and therefore started) before filtering.
function loadSchedulerModule(file: string, imports: Record<string, unknown>) {
  const exports = {}
  const unusedJob = jest.fn()
  runInNewContext(
    transpileModule(
      readFileSync(
        resolve(__dirname, '../../../scheduler/src/jobs', file),
        'utf8'
      ),
      { compilerOptions: { module: ModuleKind.CommonJS } }
    ).outputText,
    {
      exports,
      process: { env: {} },
      require: (id: string) =>
        imports[id] ?? new Proxy({}, { get: () => unusedJob }),
    }
  )
  return exports
}

const tick = loadSchedulerModule('update-oracle-feeds.ts', {
  'common/util/time': { MINUTE_MS: 60_000 },
  'shared/oracle-feeds': { ORACLE_FEEDS },
}) as {
  ORACLE_TICK_PERIOD_MS: number
  validateOracleFeedPollPeriods: () => void
}

const perpJobs = [
  'update-perps',
  'update-oracle-feeds',
  'update-openrouter-share',
  'update-trump-approval',
  'update-votehub-averages',
  'update-fear-greed',
].sort()

function constructJobs(jobSet: JobSet) {
  const started: Job[] = []
  const registry = loadSchedulerModule('index.ts', {
    lodash: { compact },
    './helpers': {
      createJob: (name: string, schedule: string) => {
        const job = { name, schedule }
        started.push(job)
        return job
      },
    },
    './update-oracle-feeds': tick,
    'shared/importance-score': { IMPORTANCE_MINUTE_INTERVAL: 2 },
    'shared/update-creator-metrics-core': { CREATOR_UPDATE_FREQUENCY: 57 },
    'shared/utils': { isProd: () => true },
  }) as { createJobs: (set: JobSet) => Job[] }
  expect(registry.createJobs(jobSet)).toEqual(started)
  return started
}

it('starts every oracle publisher and funding job only in the perps instance', () => {
  const main = constructJobs('main').map((job) => job.name)
  const perps = constructJobs('perps')
    .map((job) => job.name)
    .sort()
  const all = constructJobs('all')
    .map((job) => job.name)
    .sort()
  expect(perps).toEqual(perpJobs)
  expect(main.filter((name) => perpJobs.includes(name))).toEqual([])
  expect(main).toContain('update-user-portfolio-histories')
  expect(main).toContain('update-model-classifications')
  expect([...main, ...perps].sort()).toEqual(all)
})

it('runs all sixteen MNX feeds on the shared 2s tick and funding hourly', () => {
  const jobs = constructJobs('perps')
  expect(jobs.find((job) => job.name === 'update-oracle-feeds')?.schedule).toBe(
    '*/2 * * * * *'
  )
  expect(jobs.find((job) => job.name === 'update-perps')?.schedule).toBe(
    '0 0 * * * *'
  )
  expect(MNX_INSTRUMENTS).toHaveLength(16)
  for (const instrument of MNX_INSTRUMENTS) {
    expect(
      ORACLE_FEEDS.find((feed) => feed.id === instrument.feedId)
    ).toMatchObject({
      cadence: 'fast',
      pollPeriodMs: tick.ORACLE_TICK_PERIOD_MS,
      fetchObservation: expect.any(Function),
    })
  }
})
