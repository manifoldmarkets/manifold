// Real scheduler deadline and resolver, with offline dependencies and controlled
// promises. No SQL, provider calls or resolution transactions are executed.
jest.mock('shared/monitoring/log', () => {
  // Select the production JSON serializer without starting any cloud service.
  const previous = process.env.GOOGLE_CLOUD_PROJECT
  process.env.GOOGLE_CLOUD_PROJECT = 'deadline-test'
  const actual = jest.requireActual<typeof import('./monitoring/log')>(
    'shared/monitoring/log'
  )
  if (previous === undefined) delete process.env.GOOGLE_CLOUD_PROJECT
  else process.env.GOOGLE_CLOUD_PROJECT = previous
  return actual
})
jest.mock('shared/utils', () => {
  const { log } = jest.requireMock<typeof import('./monitoring/log')>(
    'shared/monitoring/log'
  )
  return {
    getUser: jest.fn(),
    isProd: () => false,
    log: Object.assign(jest.fn(log), { error: jest.fn(log.error) }),
    contractColumnsToSelect: 'data',
  }
})
jest.mock('croner', () => ({
  Cron: jest
    .fn()
    .mockImplementation((_schedule: unknown, options: { name: string }) => ({
      name: options.name,
    })),
}))
jest.mock('shared/supabase/init', () => ({
  createSupabaseDirectClient: jest.fn(),
}))
jest.mock('shared/sports-goal-annotations', () => ({}))
jest.mock('shared/resolve-market-helpers', () => ({
  resolveMarketHelper: jest.fn(),
}))
jest.mock('shared/tiptap', () => ({}))
jest.mock('shared/supabase/contracts', () => ({}))
jest.mock('shared/supabase/utils', () => ({}))
jest.mock('shared/supabase/answers', () => ({}))
jest.mock('shared/create-contract-helpers', () => ({}))
jest.mock('shared/txn/run-txn', () => ({}))
jest.mock('shared/update-group-contracts-internal', () => ({}))
jest.mock('shared/websockets/helpers', () => ({}))
jest.mock('shared/complete-quest-internal', () => ({}))
jest.mock('shared/notifications/create-new-contract-notif', () => ({}))
jest.mock('shared/notifications/create-new-contract-comment-notif', () => ({}))
jest.mock('shared/helpers/embeddings', () => ({}))
jest.mock('shared/the-odds-api-client', () => ({
  hasOddsApiKey: () => true,
  getScores: jest.fn(),
}))
jest.mock('shared/publish-sports-live-score', () => ({
  publishSportsLiveScore: jest.fn(),
}))
jest.mock('shared/odds-markets', () => {
  const actual = jest.requireActual<typeof import('./odds-markets')>(
    'shared/odds-markets'
  )
  const state = actual.newScorePollState()
  return {
    ...actual,
    newScorePollState: () => state,
    pollOddsScoresAndResolve: jest.fn(actual.pollOddsScoresAndResolve),
  }
})

import { User } from 'common/user'
import { Cron, CronOptions } from 'croner'
import { createJob } from 'scheduler/jobs/helpers'
import { resolveOddsSportsMarkets } from 'scheduler/jobs/sports-odds-resolve'
import { newScorePollState, pollOddsScoresAndResolve } from './odds-markets'
import { createSupabaseDirectClient } from './supabase/init'
import { resolveMarketHelper } from './resolve-market-helpers'
import { getScores } from './the-odds-api-client'
import { publishSportsLiveScore } from './publish-sports-live-score'
import { getUser, log } from './utils'

const NOW = Date.parse('2026-09-10T12:00:00Z')
const DEADLINE = 180_000
const state = newScorePollState()
const output: { at: number; line: string }[] = []
const game = (id: string) => ({
  data: {
    id,
    mechanism: 'cpmm-multi-2',
    outcomeType: 'MULTIPLE_CHOICE',
    sportsHomeTeam: 'Home',
    sportsAwayTeam: 'Away',
    sportsLeague: 'NFL',
    sportsEventId: 'odds:americanfootball_nfl:event',
    sportsStartTimestamp: new Date(NOW - 4 * 60 * 60_000).toISOString(),
  },
})
const score = (completed: boolean) => ({
  id: 'event',
  sport_key: 'americanfootball_nfl',
  sport_title: 'NFL',
  commence_time: new Date(NOW - 4 * 60 * 60_000).toISOString(),
  home_team: 'Home',
  away_team: 'Away',
  completed,
  scores: [
    { name: 'Home', score: '10' },
    { name: 'Away', score: '3' },
  ],
  last_update: null,
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

function currentWork() {
  const results = jest.mocked(pollOddsScoresAndResolve).mock.results
  return results[results.length - 1].value as ReturnType<
    typeof pollOddsScoresAndResolve
  >
}

function reservations(error: unknown): unknown {
  expect(error).toBeInstanceOf(Error)
  if (!(error instanceof Error)) throw new Error('Expected a deadline error')
  const json = error.message.match(/reservations=(\[.*\])\./)?.[1]
  if (!json) throw new Error('Deadline must report its reserved markets')
  expect(error.message).toContain('deadline does not cancel database work')
  return JSON.parse(json) as unknown
}

function schedulerRun() {
  // Cron itself is stubbed to avoid background schedules. Execute the actual
  // catch callback configured by createJob and the real production serializer.
  const job = createJob('sports-odds-resolve', null, resolveOddsSportsMarkets)
  const calls = jest.mocked(Cron).mock.calls
  const options = calls[calls.length - 1][1] as CronOptions
  return resolveOddsSportsMarkets().catch((error: unknown) => {
    if (typeof options.catch !== 'function')
      throw new Error('Missing cron error handler')
    options.catch(error, job)
    return error
  })
}

function assertDeadlineLog(error: unknown, at: number) {
  const entry = output[output.length - 1]
  const parsed = JSON.parse(entry.line) as {
    severity: string
    message: string
    err: { name: string; message: string; stack: string }
  }
  expect(entry.at).toBe(at)
  expect(parsed.severity).toBe('ERROR')
  expect(parsed.message).toBe(
    '[sports-odds-resolve] Error during job execution.'
  )
  expect(parsed.err.name).toBe('Error')
  expect(parsed.err.message).toBe((error as Error).message)
  // Assert the parsed operator-visible payload, not just in-memory metadata.
  expect(reservations(new Error(parsed.err.message))).toEqual(
    reservations(error)
  )
}

beforeEach(() => {
  jest.useFakeTimers().setSystemTime(NOW)
  jest.clearAllMocks()
  output.length = 0
  jest.spyOn(console, 'log').mockImplementation((line: unknown) => {
    output.push({ at: Date.now(), line: String(line) })
  })
  const actual =
    jest.requireActual<typeof import('./odds-markets')>('./odds-markets')
  Object.assign(state, actual.newScorePollState())
  jest.mocked(getUser).mockResolvedValue({ id: 'sports' } as User)
  jest.mocked(resolveMarketHelper).mockReset()
  jest.mocked(publishSportsLiveScore).mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

it.each(['score-write', 'resolution-transaction'] as const)(
  'identifies a pending %s at the deadline, then distinguishes unknown carryover without repeating alerts',
  async (stage) => {
    const entered = deferred<void>()
    const operation = deferred<void>()
    const none = jest.fn().mockResolvedValue(undefined)
    const pg = {
      none,
      task: async (work: (task: { none: typeof none }) => Promise<void>) =>
        work({ none }),
      map: jest.fn(
        async (
          _sql: string,
          _values: unknown[],
          convert: (row: {
            target: string
            interval_seconds: number
          }) => unknown
        ) => [convert({ target: 'sport:nfl', interval_seconds: 30 })]
      ),
      manyOrNone: jest.fn(async (sql: string) =>
        sql.includes('from answers')
          ? [
              { id: 'home', text: 'Home', index: 0, contract_id: 'affected' },
              { id: 'away', text: 'Away', index: 1, contract_id: 'affected' },
            ]
          : [game('affected')]
      ),
    }
    jest
      .mocked(createSupabaseDirectClient)
      .mockReturnValue(
        pg as unknown as ReturnType<typeof createSupabaseDirectClient>
      )
    const wait = async () => {
      entered.resolve()
      await operation.promise
    }
    if (stage === 'score-write') none.mockImplementationOnce(wait)
    else
      jest
        .mocked(resolveMarketHelper)
        .mockImplementationOnce(
          async (_contract, _resolver, _creator, _args, observe) => {
            observe?.('started')
            await wait()
            return {} as Awaited<ReturnType<typeof resolveMarketHelper>>
          }
        )
    jest
      .mocked(getScores)
      .mockResolvedValue([score(stage === 'resolution-transaction')])

    let deadlineSettled = false
    const deadline = schedulerRun().then((error) => {
      deadlineSettled = true
      return error
    })
    const oldWork = currentWork()
    await entered.promise
    const owner = state.inFlightDetails.get('affected')!.runId
    jest.advanceTimersByTime(DEADLINE - 1)
    await Promise.resolve()
    expect(deadlineSettled).toBe(false)
    expect(log.error).not.toHaveBeenCalled()
    jest.advanceTimersByTime(1)
    const error = await deadline
    assertDeadlineLog(error, NOW + DEADLINE)
    expect(reservations(error)).toEqual([
      {
        id: 'affected',
        runId: owner,
        stage,
        stageStartedAt: NOW,
        status: 'pending',
      },
    ])
    expect((error as Error).message).toContain(`run=${owner}`)
    expect(state.inFlight.has('affected')).toBe(true)
    expect(log.error).not.toHaveBeenCalled()

    // SQL/resolution (including any rollback wait) is still pending when the
    // deadline identifies the market. Only this later rejection is unknown.
    state.missing.affected = NOW + DEADLINE
    jest.advanceTimersByTime(60_000)
    operation.reject(new Error('Query read timeout'))
    await oldWork
    expect(state.inFlight.has('affected')).toBe(true)
    expect(state.missing.affected).toBe(NOW + DEADLINE)
    expect(state.inFlightDetails.get('affected')).toEqual({
      runId: owner,
      stage,
      stageStartedAt: NOW,
      status: 'unknown',
    })
    expect(log.error).toHaveBeenCalledTimes(1)
    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining(
        `affected: mutation outcome unknown; run=${owner} stage=${stage}`
      )
    )
    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining('Verify the old database work has ended')
    )
    const unknownLog = JSON.parse(output[output.length - 1].line) as {
      severity: string
      message: string
    }
    expect(unknownLog.severity).toBe('ERROR')
    expect(unknownLog.message).toContain(
      `affected: mutation outcome unknown; run=${owner} stage=${stage}`
    )
    const publishes = jest.mocked(publishSportsLiveScore).mock.calls.length
    for (let i = 0; i < 3; i++) await resolveOddsSportsMarkets()
    expect(log.error).toHaveBeenCalledTimes(1)
    expect(getScores).toHaveBeenCalledTimes(1)
    expect(publishSportsLiveScore).toHaveBeenCalledTimes(publishes)

    // A later deadline includes both its own pending market and the old
    // unknown reservation, correlated to different runs. No extra alert fires
    // just because a normal replacement tick skipped the old reservation.
    const otherEntered = deferred<void>()
    const otherOperation = deferred<void>()
    pg.manyOrNone.mockResolvedValue([game('affected'), game('other')])
    none.mockImplementationOnce(() => {
      otherEntered.resolve()
      return otherOperation.promise
    })
    jest.mocked(getScores).mockResolvedValue([score(false)])
    const replacementStartedAt = Date.now()
    const replacement = schedulerRun()
    const replacementWork = currentWork()
    await otherEntered.promise
    const newOwner = state.inFlightDetails.get('other')!.runId
    expect(newOwner).not.toBe(owner)
    jest.advanceTimersByTime(DEADLINE)
    const replacementError = await replacement
    assertDeadlineLog(replacementError, replacementStartedAt + DEADLINE)
    expect(reservations(replacementError)).toEqual([
      {
        id: 'affected',
        runId: owner,
        stage,
        stageStartedAt: NOW,
        status: 'unknown',
      },
      {
        id: 'other',
        runId: newOwner,
        stage: 'score-write',
        stageStartedAt: replacementStartedAt,
        status: 'pending',
      },
    ])
    otherOperation.resolve()
    await replacementWork
    expect(state.inFlight.has('affected')).toBe(true)
    expect(state.inFlight.has('other')).toBe(false)
    expect(state.inFlightDetails.has('other')).toBe(false)
    expect(publishSportsLiveScore).toHaveBeenCalledTimes(publishes)
    expect(log.error).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)
  }
)
