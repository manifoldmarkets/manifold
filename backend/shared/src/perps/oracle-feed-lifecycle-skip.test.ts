import { readFileSync } from 'fs'
import { resolve } from 'path'
import { runInNewContext } from 'vm'
import { ModuleKind, transpileModule } from 'typescript'

// Regression for 2026-11-07..09: the 2026 generic-ballot market settled on
// 11/05, VoteHub's series had ended on 11/03, and the oracle tick's daily
// staleness probe kept paging `[oracle-feeds] daily feed
// votehub-generic-ballot-2026 is stale` every hour for a feed with nothing
// left to publish. A registry lifecycle (retired / awaiting-source) must take
// a feed out of the tick entirely: no poll, no probe, no log line. Runs the
// real scheduler job against a registry of one live feed and two inactive
// ones.

const MINUTE_MS = 60_000

const flush = async () => {
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r))
}

type FeedDef = Record<string, unknown> & { id: string }

function loadJob(feeds: FeedDef[]) {
  const fetchLatest = jest.fn(async () => null)
  const logError = jest.fn()
  const logWarn = jest.fn()
  const oneOrNone = jest.fn(async () => null)
  const pg = { oneOrNone }
  const imports: Record<string, unknown> = {
    'shared/perps/engine': { settlePerpOrderBacklog: async () => {} },
    'shared/perps/order-effects': { deliverPerpOrderEffects: async () => {} },
    'common/util/time': { MINUTE_MS },
    'common/perps/oracle': { normalizeOraclePointBatch: jest.fn() },
    'shared/oracle': { insertOraclePrices: jest.fn() },
    'shared/oracle-clock': { databaseOracleClock: () => async () => 0 },
    'shared/oracle-feeds': {
      ORACLE_FEEDS: feeds,
      // The real helper's definition, inlined: the job must consult it.
      isOracleFeedLive: (feed: { lifecycle?: unknown }) =>
        feed.lifecycle == null,
      validateOraclePoint: () => null,
    },
    'shared/supabase/init': { createSupabaseDirectClient: () => pg },
    'shared/utils': {
      log: Object.assign(jest.fn(), { error: logError, warn: logWarn }),
    },
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
      Date,
      setImmediate,
      require: (id: string) => {
        if (!(id in imports)) throw new Error(`unexpected import ${id}`)
        return imports[id]
      },
    }
  )
  const updateOracleFeeds = exports.updateOracleFeeds
  if (!updateOracleFeeds) throw new Error('updateOracleFeeds not exported')
  return { updateOracleFeeds, fetchLatest, logError, logWarn, oneOrNone }
}

describe('update-oracle-feeds and feed lifecycle', () => {
  it('neither polls nor probes a retired or awaiting-source feed', async () => {
    const retiredDaily = {
      id: 'ended-ballot',
      cadence: 'daily',
      staleAfterMs: 26 * 60 * MINUTE_MS,
      lifecycle: { phase: 'retired', at: 1, reason: 'series ended' },
    }
    const awaitingFast = {
      id: 'future-fast',
      cadence: 'fast',
      pollPeriodMs: 2_000,
      staleAfterMs: 2 * MINUTE_MS,
      lifecycle: { phase: 'awaiting-source', reason: 'no key yet' },
      fetchLatest: jest.fn(async () => ({ ts: Date.now(), price: 1 })),
    }
    const liveDaily = {
      id: 'live-daily',
      cadence: 'daily',
      staleAfterMs: 26 * 60 * MINUTE_MS,
    }
    const job = loadJob([retiredDaily, awaitingFast, liveDaily])

    await job.updateOracleFeeds()
    await flush()

    // The live daily feed was probed (one indexed read) and, having no point,
    // alerted; the retired one was not even read.
    const probed = job.oneOrNone.mock.calls.map(
      (call: unknown[]) => (call[1] as string[])[0]
    )
    expect(probed).toEqual(['live-daily'])
    expect(job.logError).toHaveBeenCalledTimes(1)
    expect(String(job.logError.mock.calls[0][0])).toContain(
      'daily feed live-daily is stale'
    )
    expect(String(job.logError.mock.calls[0][0])).not.toContain('ended-ballot')
    // The awaiting fast feed's adapter was never called.
    expect(awaitingFast.fetchLatest).not.toHaveBeenCalled()
    expect(job.logWarn).not.toHaveBeenCalled()
  })

  it('still polls a live fast feed on the same tick', async () => {
    const liveFast = {
      id: 'live-fast',
      cadence: 'fast',
      pollPeriodMs: 2_000,
      staleAfterMs: 2 * MINUTE_MS,
      fetchLatest: jest.fn(async () => null),
    }
    const parked = {
      id: 'parked-fast',
      cadence: 'fast',
      pollPeriodMs: 2_000,
      staleAfterMs: 2 * MINUTE_MS,
      lifecycle: { phase: 'awaiting-source', reason: 'no key yet' },
      fetchLatest: jest.fn(async () => null),
    }
    const job = loadJob([parked, liveFast])
    await job.updateOracleFeeds()
    await flush()
    expect(liveFast.fetchLatest).toHaveBeenCalledTimes(1)
    expect(parked.fetchLatest).not.toHaveBeenCalled()
  })
})
