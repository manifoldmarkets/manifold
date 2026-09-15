import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { ModuleKind, transpileModule } from 'typescript'

// Exercise the actual scheduler wrapper with an inert Cron and fake REST client.
function scheduler() {
  let now = 0
  let run: () => Promise<void>
  let options: { catch: (error: Error, job: { name: string }) => void }
  const eq = jest.fn().mockResolvedValue({ data: [] })
  const upsert = jest.fn().mockResolvedValue({})
  const from = jest.fn(() => ({ select: () => ({ eq }), upsert }))
  const log = Object.assign(jest.fn(), { warn: jest.fn(), error: jest.fn() })
  const exports = {} as {
    createJob: (
      name: string,
      schedule: string,
      fn: () => Promise<void>,
      options?: { bookkeepingIntervalMs: number }
    ) => void
  }
  const imports: Record<string, unknown> = {
    croner: {
      Cron: class {
        constructor(_schedule: unknown, opts: typeof options, fn: typeof run) {
          options = opts
          run = fn
        }
      },
    },
    'shared/monitoring/log': { log },
    'shared/monitoring/context': {
      withMonitoringContext: (_context: unknown, fn: () => Promise<void>) =>
        fn(),
    },
    crypto: { randomUUID: () => 'trace' },
    'shared/supabase/init': { createSupabaseClient: () => ({ from }) },
  }
  runInNewContext(
    transpileModule(
      readFileSync(
        resolve(__dirname, '../../../scheduler/src/jobs/helpers.ts'),
        'utf8'
      ),
      { compilerOptions: { module: ModuleKind.CommonJS } }
    ).outputText,
    {
      exports,
      require: (id: string) => imports[id],
      Date: class extends Date {
        static now() {
          return now
        }
      },
    }
  )
  return {
    ...exports,
    run: () => run(),
    fail: (error: Error) => options.catch(error, { name: 'poker' }),
    setTime: (time: number) => {
      now = time
    },
    eq,
    upsert,
    log,
  }
}

it('runs every tick but samples routine bookkeeping once per minute', async () => {
  const s = scheduler()
  const tick = jest.fn().mockResolvedValue(undefined)
  s.createJob('poker', '* * * * * *', tick, { bookkeepingIntervalMs: 60_000 })
  for (let second = 0; second < 60; second++) {
    s.setTime(second * 1000)
    await s.run()
  }
  expect(tick).toHaveBeenCalledTimes(60)
  expect(s.eq).toHaveBeenCalledTimes(1)
  expect(s.upsert).toHaveBeenCalledTimes(2)
  expect(s.log).toHaveBeenCalledTimes(3)
  s.setTime(60_000)
  await s.run()
  expect(tick).toHaveBeenCalledTimes(61)
  expect(tick).toHaveBeenLastCalledWith({
    lastStartTime: 59_000,
    lastEndTime: 59_000,
  })
  expect(s.eq).toHaveBeenCalledTimes(2)
  expect(s.upsert).toHaveBeenCalledTimes(4)
})

it('preserves per-run bookkeeping by default and catches unsampled failures', async () => {
  const normal = scheduler()
  normal.createJob('normal', '* * * * * *', async () => {})
  await normal.run()
  await normal.run()
  expect(normal.eq).toHaveBeenCalledTimes(2)
  expect(normal.upsert).toHaveBeenCalledTimes(4)

  const s = scheduler()
  const tick = jest.fn().mockResolvedValue(undefined)
  s.createJob('poker', '* * * * * *', tick, { bookkeepingIntervalMs: 60_000 })
  await s.run()
  s.setTime(1000)
  const error = new Error('settlement failed')
  tick.mockRejectedValueOnce(error)
  await expect(s.run()).rejects.toBe(error)
  s.fail(error)
  expect(s.log.error).toHaveBeenCalledTimes(1)
  await s.run()
  expect(tick).toHaveBeenCalledTimes(3)
})
