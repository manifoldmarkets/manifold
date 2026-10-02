import { readFileSync } from 'fs'
import { resolve } from 'path'
import { runInNewContext } from 'vm'
import { ModuleKind, transpileModule } from 'typescript'

// Regression for 2026-09-26: a btc-usd poll never settled, and because the
// per-feed in-flight guard was only ever cleared by the run itself, every
// later BTC poll was skipped for six hours. Runs the real scheduler job with
// a clock we control and a feed whose fetch we settle by hand.

const MINUTE_MS = 60_000
const START = 1_790_000_000_000

type Deferred = { promise: Promise<null>; resolve: () => void }
const deferred = (): Deferred => {
  let resolveFn = () => {}
  const promise = new Promise<null>((res) => {
    resolveFn = () => res(null)
  })
  return { promise, resolve: resolveFn }
}

// Let dispatched runs advance through their awaits.
const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r))
}

function loadJob() {
  let clock = START
  class FakeDate extends Date {
    static now() {
      return clock
    }
  }
  const fetchLatest = jest.fn<Promise<null>, []>()
  const logError = jest.fn()
  const feed = {
    id: 'test-feed',
    cadence: 'fast',
    pollPeriodMs: 2_000,
    staleAfterMs: 2 * MINUTE_MS,
    fetchLatest,
  }
  const imports: Record<string, unknown> = {
    'common/util/time': { MINUTE_MS },
    'common/perps/oracle': { normalizeOraclePointBatch: jest.fn() },
    'shared/oracle': { insertOraclePrices: jest.fn() },
    'shared/oracle-feeds': {
      ORACLE_FEEDS: [feed],
      validateOraclePoint: () => null,
    },
    'shared/supabase/init': {
      createSupabaseDirectClient: () => ({ oneOrNone: async () => null }),
    },
    'shared/utils': { log: Object.assign(jest.fn(), { error: logError }) },
    'shared/perps/apply-oracle-point': {
      applyOraclePointToLivePerps: jest.fn(),
    },
    'shared/perps/publish-oracle-observation': {
      publishOracleObservation: jest.fn(),
      reportOracleTickFailure: jest.fn(),
    },
    'shared/perps/oracle-tick-bounds': { FAST_TICK_ORACLE_BOUNDS: {} },
  }
  const exports: { updateOracleFeeds?: () => Promise<void> } = {}
  runInNewContext(
    transpileModule(
      readFileSync(
        resolve(
          __dirname,
          '../../../scheduler/src/jobs/update-oracle-feeds.ts'
        ),
        'utf8'
      ),
      { compilerOptions: { module: ModuleKind.CommonJS } }
    ).outputText,
    {
      exports,
      Date: FakeDate,
      require: (id: string) => {
        if (!(id in imports)) throw new Error(`unexpected import ${id}`)
        return imports[id]
      },
    }
  )
  const updateOracleFeeds = exports.updateOracleFeeds
  if (!updateOracleFeeds) throw new Error('updateOracleFeeds not exported')
  return {
    fetchLatest,
    logError,
    advance: (ms: number) => {
      clock += ms
    },
    tick: async () => {
      await updateOracleFeeds()
      await flush()
    },
  }
}

describe('update-oracle-feeds stuck poll', () => {
  it('abandons a run stuck past the grace period and polls again on that firing', async () => {
    const job = loadJob()
    job.fetchLatest.mockReturnValueOnce(new Promise(() => {}))
    job.fetchLatest.mockResolvedValue(null)

    await job.tick()
    expect(job.fetchLatest).toHaveBeenCalledTimes(1)

    // Inside the grace period the hung run still holds the slot.
    job.advance(2_000)
    await job.tick()
    job.advance(MINUTE_MS)
    await job.tick()
    expect(job.fetchLatest).toHaveBeenCalledTimes(1)
    expect(job.logError).not.toHaveBeenCalledWith(
      expect.stringContaining('abandoning')
    )

    job.advance(MINUTE_MS - 2_000)
    await job.tick()
    expect(job.logError).toHaveBeenCalledWith(
      expect.stringContaining('test-feed: poll has been in flight for 120s')
    )
    expect(job.fetchLatest).toHaveBeenCalledTimes(2)

    // The replacement settled normally, so the feed keeps its cadence.
    job.advance(2_000)
    await job.tick()
    expect(job.fetchLatest).toHaveBeenCalledTimes(3)
  })

  it("does not let a late-settling abandoned run release its replacement's slot", async () => {
    const job = loadJob()
    const stuck = deferred()
    const replacement = deferred()
    job.fetchLatest
      .mockReturnValueOnce(stuck.promise)
      .mockReturnValueOnce(replacement.promise)
      .mockResolvedValue(null)

    await job.tick()
    job.advance(2 * MINUTE_MS)
    await job.tick()
    expect(job.fetchLatest).toHaveBeenCalledTimes(2)

    // The abandoned run finally settles while the replacement is in flight.
    stuck.resolve()
    await flush()
    job.advance(2_000)
    await job.tick()
    expect(job.fetchLatest).toHaveBeenCalledTimes(2)

    replacement.resolve()
    await flush()
    job.advance(2_000)
    await job.tick()
    expect(job.fetchLatest).toHaveBeenCalledTimes(3)
  })
})
