import { readFileSync } from 'fs'
import { resolve } from 'path'
import { runInNewContext } from 'vm'
import { ModuleKind, transpileModule } from 'typescript'

it('keeps the local BDL recorder out of the production scheduler', () => {
  // The real registration function starts Cron jobs during construction. Capture
  // every constructor call while preventing any of their handlers from running.
  const filename = resolve(__dirname, '../../scheduler/src/jobs/index.ts')
  const { outputText } = transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ModuleKind.CommonJS },
  })
  const started: string[] = []
  const createJob = (name: string) => {
    started.push(name)
    return { name }
  }
  const imports: Record<string, unknown> = {
    './helpers': { createJob },
    lodash: { compact: (values: unknown[]) => values.filter(Boolean) },
    'shared/utils': { isProd: () => true },
    'common/envs/constants': { ENV: 'PROD' },
    './update-oracle-feeds': {
      ORACLE_TICK_PERIOD_MS: 2000,
      validateOracleFeedPollPeriods: () => undefined,
    },
    'shared/importance-score': { IMPORTANCE_MINUTE_INTERVAL: 2 },
    'shared/update-creator-metrics-core': { CREATOR_UPDATE_FREQUENCY: 57 },
  }
  const registry: { createJobs?: (role: 'main' | 'perps') => unknown } = {}
  const inert = new Proxy({}, { get: () => jest.fn() })
  runInNewContext(outputText, {
    exports: registry,
    process: {
      env: { NEXT_PUBLIC_FIREBASE_ENV: 'PROD', NODE_ENV: 'production' },
    },
    require: (id: string) => imports[id] ?? inert,
  })
  if (!registry.createJobs)
    throw new Error('Cannot exercise scheduler registration')
  registry.createJobs('main')
  registry.createJobs('perps')
  expect(started).toContain('sports-f1-create')
  expect(
    started.filter((name) => /bdl.*record|record.*bdl/i.test(name))
  ).toEqual([])
})
