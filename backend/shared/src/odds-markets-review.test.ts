// Based on the four preserved independent-review reproducers for PR #4178.
// Provider, database, and external side effects are mocked; the resolver and
// its reservation/checkpoint logic execute normally. Deferred promises expose
// interleavings without live provider calls, timers, or production mutations.
jest.mock('shared/utils', () => ({
  getUser: jest.fn(),
  isProd: () => false,
  log: Object.assign(jest.fn(), { error: jest.fn(), warn: jest.fn() }),
  contractColumnsToSelect: 'data',
}))
jest.mock('shared/supabase/init', () => ({
  pgp: {
    as: {
      format: (sql: string, values: unknown[]) =>
        JSON.stringify({ sql, values }),
    },
  },
}))
jest.mock('shared/sports-goal-annotations', () => ({}))
jest.mock('shared/resolve-market-helpers', () => ({
  resolveMarketHelper: jest.fn(),
}))
jest.mock('shared/tiptap', () => ({
  anythingToRichText: () => ({ type: 'doc', content: [] }),
}))
jest.mock('shared/supabase/contracts', () => ({
  generateContractEmbeddings: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('shared/supabase/utils', () => ({
  bulkInsertQuery: () => 'insert answers',
}))
jest.mock('shared/supabase/answers', () => ({
  answerToRow: (answer: unknown) => answer,
}))
jest.mock('shared/create-contract-helpers', () => ({
  generateAntes: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('shared/txn/run-txn', () => ({
  runTxnOutsideBetQueue: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('shared/update-group-contracts-internal', () => ({
  addGroupToContract: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('shared/websockets/helpers', () => ({}))
jest.mock('shared/complete-quest-internal', () => ({
  completeCalculatedQuestFromTrigger: jest.fn().mockResolvedValue(undefined),
}))
jest.mock('shared/notifications/create-new-contract-notif', () => ({}))
jest.mock('shared/notifications/create-new-contract-comment-notif', () => ({}))
jest.mock('shared/helpers/embeddings', () => ({}))
jest.mock('shared/the-odds-api-client', () => ({
  getUpcomingOdds: jest.fn(),
  getScores: jest.fn(),
}))
jest.mock('shared/publish-sports-live-score', () => ({
  publishSportsLiveScore: jest.fn().mockResolvedValue(undefined),
}))

import { OddsApiEvent } from 'common/odds-markets'
import { APIError } from 'common/api/utils'
import { User } from 'common/user'
import { getUser, log } from 'shared/utils'
import { getScores, getUpcomingOdds } from 'shared/the-odds-api-client'
import { SupabaseDirectClient } from 'shared/supabase/init'
import { resolveMarketHelper } from 'shared/resolve-market-helpers'
import { publishSportsLiveScore } from 'shared/publish-sports-live-score'
import { newScorePollState, pollOddsScoresAndResolve } from './odds-markets'

// Pipeline code filters on Date.now(); pin it inside the NFL regular season,
// before the fixture's kickoff, so the fixtures never go stale.
const NOW = Date.parse('2026-09-10T12:00:00Z')

const creator = {
  id: 'sports-user',
  username: 'ManifoldSports',
  name: 'Sports',
  createdTime: 0,
} as User
const event: OddsApiEvent = {
  id: 'event',
  sport_key: 'americanfootball_nfl',
  sport_title: 'NFL',
  commence_time: '2026-09-13T17:00:00Z',
  home_team: 'Home',
  away_team: 'Away',
  bookmakers: [
    {
      key: 'book',
      title: 'Book',
      last_update: '',
      markets: [
        {
          key: 'h2h',
          last_update: '',
          outcomes: [
            { name: 'Home', price: -150 },
            { name: 'Away', price: 130 },
          ],
        },
      ],
    },
  ],
}

function database() {
  const none = jest.fn().mockResolvedValue({ id: 'game' })
  const pg = {
    manyOrNone: jest.fn().mockResolvedValue([]),
    map: jest.fn().mockResolvedValue([]),
    none,
    task: jest.fn(
      async (work: (task: { oneOrNone: typeof none }) => Promise<void>) =>
        work({ oneOrNone: none })
    ),
  }
  return {
    pg,
    client: pg as unknown as SupabaseDirectClient,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  jest.spyOn(Date, 'now').mockReturnValue(NOW)
  jest.mocked(getUser).mockResolvedValue(creator)
  jest.mocked(getUpcomingOdds).mockResolvedValue([event])
})

afterAll(() => {
  jest.restoreAllMocks()
})

const reviewGame = (id = 'game', sportKey = 'americanfootball_nfl') => ({
  data: {
    id,
    mechanism: 'cpmm-multi-2',
    outcomeType: 'MULTIPLE_CHOICE',
    sportsHomeTeam: 'Home',
    sportsAwayTeam: 'Away',
    sportsLeague: sportKey === 'soccer_epl' ? 'EPL' : 'NFL',
    sportsEventId: `odds:${sportKey}:event`,
    sportsStartTimestamp: new Date(NOW - 4 * 60 * 60 * 1000).toISOString(),
  },
})
const reviewAnswers = [
  { id: 'away-answer', text: 'Away', index: 1, contract_id: 'game' },
  { id: 'home-answer', text: 'Home', index: 0, contract_id: 'game' },
]
const reviewScore = (completed: boolean) => ({
  ...event,
  completed,
  scores: [
    { name: 'Away', score: '3' },
    { name: 'Home', score: '10' },
  ],
  last_update: null,
})
beforeEach(() => {
  jest.mocked(getScores).mockReset()
  jest.mocked(resolveMarketHelper).mockReset()
  jest.mocked(publishSportsLiveScore).mockReset().mockResolvedValue(undefined)
})

it('R4178-01: abandonment while fetching answers must stop a subsequent resolution', async () => {
  const db = database()
  let current = true
  db.pg.manyOrNone
    .mockResolvedValueOnce([reviewGame()])
    .mockImplementationOnce(async () => {
      current = false // deadline/replacement while this read is pending
      return reviewAnswers
    })
  jest.mocked(getScores).mockResolvedValue([reviewScore(true)])
  await pollOddsScoresAndResolve(db.client, newScorePollState(), () => current)
  expect(resolveMarketHelper).not.toHaveBeenCalled()
})

it('R4178-01: abandonment while a live-score DB write waits must stop subsequent publish', async () => {
  const db = database()
  let current = true
  db.pg.manyOrNone.mockResolvedValueOnce([reviewGame()])
  db.pg.map.mockImplementation(async (_sql, _params, fn) => [
    fn({ target: 'sport:nfl', interval_seconds: 30 }),
  ])
  db.pg.none.mockImplementationOnce(async () => {
    current = false
  })
  jest.mocked(getScores).mockResolvedValue([reviewScore(false)])
  await pollOddsScoresAndResolve(db.client, newScorePollState(), () => current)
  expect(publishSportsLiveScore).not.toHaveBeenCalled()
})

it('R4178-02: a rejected provider call crossing the deadline must not start the next sport', async () => {
  const db = database(),
    state = newScorePollState()
  let current = true
  db.pg.manyOrNone.mockResolvedValueOnce([
    reviewGame(),
    reviewGame('other', 'soccer_epl'),
  ])
  jest
    .mocked(getScores)
    .mockImplementationOnce(async () => {
      current = false
      state.lastPolled.soccer_epl = NOW + 180000 // replacement run already polled
      throw new Error('provider timeout after run deadline')
    })
    .mockResolvedValue([])
  await pollOddsScoresAndResolve(db.client, state, () => current)
  expect(jest.mocked(getScores).mock.calls.map(([key]) => key)).toEqual([
    'americanfootball_nfl',
  ])
  expect(state.lastPolled.soccer_epl).toBe(NOW + 180000)
})

it('R4178-02: an old provider success must not erase the replacement failure backoff', async () => {
  const db = database(),
    state = newScorePollState()
  let current = true
  db.pg.manyOrNone.mockResolvedValueOnce([reviewGame()])
  jest.mocked(getScores).mockImplementationOnce(async () => {
    current = false
    state.failures.americanfootball_nfl = 3 // replacement owns the current state
    return [reviewScore(false)]
  })
  await pollOddsScoresAndResolve(db.client, state, () => current)
  expect(state.failures.americanfootball_nfl).toBe(3)
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

function liveDatabase() {
  const db = database()
  db.pg.manyOrNone.mockImplementation(async (sql: string) =>
    sql.includes('from answers') ? reviewAnswers : [reviewGame()]
  )
  db.pg.map.mockImplementation(async (_sql, _params, fn) => [
    fn({ target: 'sport:nfl', interval_seconds: 30 }),
  ])
  return db
}

const advanceTick = () => jest.mocked(Date.now).mockReturnValue(NOW + 180_000)

it.each(['write', 'publish', 'answers', 'resolve'] as const)(
  'R4178-01: holds the market across a deferred %s and allows other markets to progress',
  async (boundary) => {
    const db = liveDatabase()
    const state = newScorePollState()
    const entered = deferred<void>()
    const settled = deferred<void>()
    const isFinal = boundary !== 'write'
    let current = true
    const wait = async () => {
      entered.resolve()
      await settled.promise
    }
    if (boundary === 'write') db.pg.none.mockImplementationOnce(wait)
    if (boundary === 'publish')
      jest.mocked(publishSportsLiveScore).mockImplementationOnce(wait)
    if (boundary === 'answers')
      db.pg.manyOrNone
        .mockResolvedValueOnce([reviewGame()])
        .mockImplementationOnce(async () => {
          await wait()
          return reviewAnswers
        })
    if (boundary === 'resolve')
      jest.mocked(resolveMarketHelper).mockImplementationOnce(async () => {
        await wait()
        return {} as Awaited<ReturnType<typeof resolveMarketHelper>>
      })
    jest.mocked(getScores).mockResolvedValue([reviewScore(isFinal)])
    const old = pollOddsScoresAndResolve(db.client, state, () => current)
    await entered.promise
    expect(state.inFlight.has('game')).toBe(true)
    current = false
    advanceTick()

    // Replacement sees both the busy game and an unrelated game in this sport.
    db.pg.manyOrNone.mockResolvedValueOnce([reviewGame(), reviewGame('other')])
    jest.mocked(getScores).mockResolvedValue([reviewScore(false)])
    const replacement = await pollOddsScoresAndResolve(db.client, state)
    expect(replacement.live).toBe(1)
    expect(publishSportsLiveScore).toHaveBeenLastCalledWith(
      'other',
      expect.objectContaining({ sportsLiveUpdatedTime: NOW + 180_000 })
    )
    expect(state.inFlight.has('game')).toBe(true)
    const calls = {
      writes: db.pg.none.mock.calls.length,
      publishes: jest.mocked(publishSportsLiveScore).mock.calls.length,
      reads: db.pg.manyOrNone.mock.calls.length,
      resolves: jest.mocked(resolveMarketHelper).mock.calls.length,
    }
    state.missing.game = NOW + 180_000
    state.lastOverdueAlert.game = NOW + 180_000
    settled.resolve()
    await old
    // Issued work may finish; it starts no follow-on action and cannot clear
    // replacement bookkeeping. Only the old reservation is released.
    expect(db.pg.none).toHaveBeenCalledTimes(calls.writes)
    expect(publishSportsLiveScore).toHaveBeenCalledTimes(calls.publishes)
    expect(db.pg.manyOrNone).toHaveBeenCalledTimes(calls.reads)
    expect(resolveMarketHelper).toHaveBeenCalledTimes(calls.resolves)
    expect(state.missing.game).toBe(NOW + 180_000)
    expect(state.lastOverdueAlert.game).toBe(NOW + 180_000)
    expect(state.inFlight.size).toBe(0)
  }
)

it('R4178-01: a replacement read begun under a reservation cannot use its stale row after release', async () => {
  const db = liveDatabase()
  const state = newScorePollState()
  const entered = deferred<void>()
  const mutation = deferred<void>()
  const read = deferred<ReturnType<typeof reviewGame>[]>()
  let current = true
  db.pg.none.mockImplementationOnce(async () => {
    entered.resolve()
    await mutation.promise
  })
  jest.mocked(getScores).mockResolvedValue([reviewScore(false)])
  const old = pollOddsScoresAndResolve(db.client, state, () => current)
  await entered.promise
  current = false
  advanceTick()
  db.pg.manyOrNone.mockReturnValueOnce(read.promise)
  const replacement = pollOddsScoresAndResolve(db.client, state)
  mutation.resolve()
  await old
  expect(state.inFlight.size).toBe(0)
  read.resolve([reviewGame()])
  await replacement
  expect(db.pg.none).toHaveBeenCalledTimes(1)
  expect(getScores).toHaveBeenCalledTimes(1)
  expect(publishSportsLiveScore).not.toHaveBeenCalled()

  // Only a subsequent fresh row read can write the corrected score.
  jest.mocked(getScores).mockResolvedValue([
    {
      ...reviewScore(false),
      scores: [
        { name: 'Home', score: '20' },
        { name: 'Away', score: '3' },
      ],
    },
  ])
  await pollOddsScoresAndResolve(db.client, state)
  expect(publishSportsLiveScore).toHaveBeenCalledWith(
    'game',
    expect.objectContaining({ sportsHomeScore: 20 })
  )
  expect(db.pg.none).toHaveBeenCalledTimes(2)
})

it.each(['success', 'failure'] as const)(
  'R4178-02: stale provider %s preserves every replacement counter and never polls the next sport',
  async (outcome) => {
    const db = liveDatabase()
    const state = newScorePollState()
    const entered = deferred<void>()
    const provider = deferred<ReturnType<typeof reviewScore>[]>()
    let current = true
    db.pg.manyOrNone.mockResolvedValueOnce([
      reviewGame(),
      reviewGame('other', 'soccer_epl'),
    ])
    jest.mocked(getScores).mockImplementationOnce(() => {
      entered.resolve()
      return provider.promise
    })
    const old = pollOddsScoresAndResolve(db.client, state, () => current)
    await entered.promise
    current = false
    state.failures = { americanfootball_nfl: 3, soccer_epl: 2 }
    state.lastPolled = {
      americanfootball_nfl: NOW + 180_000,
      soccer_epl: NOW + 180_000,
    }
    state.lastFinished = {
      americanfootball_nfl: NOW + 180_000,
      soccer_epl: NOW + 180_000,
    }
    state.missing = { game: NOW + 180_000 }
    state.lastOverdueAlert = { game: NOW + 180_000 }
    const replacement = JSON.stringify(state)
    if (outcome === 'success') provider.resolve([reviewScore(true)])
    else provider.reject(new Error('provider timed out'))
    await old
    expect(JSON.stringify(state)).toBe(replacement)
    expect(getScores).toHaveBeenCalledTimes(1)
    expect(db.pg.none).not.toHaveBeenCalled()
  }
)

it('R4178-02: stale settings rejection cannot replace the new settings-error timestamp', async () => {
  const db = liveDatabase()
  const state = newScorePollState()
  let current = true
  db.pg.map.mockImplementationOnce(async () => {
    current = false
    state.lastSettingsError = NOW + 180_000
    throw new Error('old settings read failed')
  })
  await pollOddsScoresAndResolve(db.client, state, () => current)
  expect(state.lastSettingsError).toBe(NOW + 180_000)
  expect(log.error).not.toHaveBeenCalled()
  expect(getScores).not.toHaveBeenCalled()
})

it.each(['success', 'failure'] as const)(
  'R4178-02: stale finals follow-up %s starts no next request or mutation',
  async (outcome) => {
    const db = liveDatabase()
    const state = newScorePollState()
    const game = reviewGame()
    game.data.sportsStartTimestamp = new Date(NOW - 10 * 60_000).toISOString()
    db.pg.manyOrNone.mockResolvedValueOnce([
      game,
      reviewGame('other', 'soccer_epl'),
    ])
    let current = true
    jest
      .mocked(getScores)
      .mockResolvedValueOnce([])
      .mockImplementationOnce(async () => {
        current = false
        state.lastFinished.americanfootball_nfl = NOW + 180_000
        state.failures.americanfootball_nfl = 3
        state.missing.game = NOW + 180_000
        if (outcome === 'failure') throw new Error('old follow-up failed')
        return [reviewScore(true)]
      })
    await pollOddsScoresAndResolve(db.client, state, () => current)
    expect(getScores).toHaveBeenCalledTimes(2)
    expect(state.lastFinished.americanfootball_nfl).toBe(NOW + 180_000)
    expect(state.failures.americanfootball_nfl).toBe(3)
    expect(state.missing.game).toBe(NOW + 180_000)
    expect(state.lastPolled.soccer_epl).toBeUndefined()
    expect(db.pg.none).not.toHaveBeenCalled()
  }
)

it.each(['write', 'resolve'] as const)(
  'R4178-01: settled %s rejection releases for a later retry even after abandonment',
  async (boundary) => {
    const db = liveDatabase()
    const state = newScorePollState()
    let current = true
    const fail = async () => {
      current = false
      state.missing.game = NOW + 180_000
      throw new Error('Query read timeout')
    }
    if (boundary === 'write') db.pg.none.mockImplementationOnce(fail)
    else
      jest
        .mocked(resolveMarketHelper)
        .mockImplementationOnce(
          async (_contract, _resolver, _creator, _args, onTransactionState) => {
            onTransactionState?.('started')
            return fail()
          }
        )
    jest
      .mocked(getScores)
      .mockResolvedValue([reviewScore(boundary === 'resolve')])
    await pollOddsScoresAndResolve(db.client, state, () => current)
    expect(state.inFlight.has('game')).toBe(false)
    expect(state.missing.game).toBe(NOW + 180_000)
    expect(log.error).toHaveBeenCalledWith(
      expect.stringContaining('game: helper rejected')
    )
    const writes = db.pg.none.mock.calls.length
    const resolves = jest.mocked(resolveMarketHelper).mock.calls.length
    jest.mocked(Date.now).mockReturnValue(NOW + 31 * 60_000)
    await pollOddsScoresAndResolve(db.client, state)
    expect(getScores).toHaveBeenCalledTimes(2)
    expect(db.pg.none).toHaveBeenCalledTimes(writes + 1)
    expect(resolveMarketHelper).toHaveBeenCalledTimes(
      resolves + (boundary === 'resolve' ? 1 : 0)
    )
  }
)

it.each(['write', 'resolve'] as const)(
  'serialization rejection at %s warns and retries without an ERROR',
  async (boundary) => {
    const db = liveDatabase()
    const state = newScorePollState()
    const failure = Object.assign(new Error('serialization failure'), {
      code: '40001',
    })
    if (boundary === 'write') db.pg.none.mockRejectedValueOnce(failure)
    else jest.mocked(resolveMarketHelper).mockRejectedValueOnce(failure)
    jest
      .mocked(getScores)
      .mockResolvedValue([reviewScore(boundary === 'resolve')])

    await pollOddsScoresAndResolve(db.client, state)

    expect(log.warn).toHaveBeenCalledWith(
      expect.stringMatching(/game: serialization failure; run=.* stage=/)
    )
    expect(log.error).not.toHaveBeenCalled()
    expect(state.inFlight.size).toBe(0)
    expect(state.inFlightDetails.size).toBe(0)
    const writes = db.pg.none.mock.calls.length
    const resolves = jest.mocked(resolveMarketHelper).mock.calls.length
    jest.mocked(Date.now).mockReturnValue(NOW + 31 * 60_000)
    await pollOddsScoresAndResolve(db.client, state)
    expect(db.pg.none).toHaveBeenCalledTimes(writes + 1)
    expect(resolveMarketHelper).toHaveBeenCalledTimes(
      resolves + (boundary === 'resolve' ? 1 : 0)
    )
  }
)

it.each(['40001', '40P01', '55P03', '57014', '23503', '23505', '23514'])(
  'a confirmed server rejection (%s) releases its reservation for retry',
  async (code) => {
    const db = liveDatabase()
    const state = newScorePollState()
    db.pg.none.mockRejectedValueOnce(
      Object.assign(new Error('server rejected statement'), { code })
    )
    jest.mocked(getScores).mockResolvedValue([reviewScore(false)])
    await pollOddsScoresAndResolve(db.client, state)
    expect(state.inFlight.size).toBe(0)
    advanceTick()
    expect((await pollOddsScoresAndResolve(db.client, state)).live).toBe(1)
    expect(publishSportsLiveScore).toHaveBeenCalledTimes(1)
  }
)

it('a confirmed resolution rollback releases its reservation without quarantine', async () => {
  const db = liveDatabase()
  const state = newScorePollState()
  jest.mocked(getScores).mockResolvedValue([reviewScore(true)])
  jest
    .mocked(resolveMarketHelper)
    .mockRejectedValueOnce(new APIError(403, 'Contract is already resolved'))
  await pollOddsScoresAndResolve(db.client, state)
  expect(state.inFlight.size).toBe(0)
  expect(log.error).not.toHaveBeenCalledWith(
    expect.stringContaining('mutation outcome unknown')
  )
})

it('a failed answer read releases its reservation and stale failure cannot mark a game missing', async () => {
  const db = liveDatabase()
  const state = newScorePollState()
  let current = true
  db.pg.manyOrNone
    .mockResolvedValueOnce([reviewGame(), reviewGame('other')])
    .mockImplementationOnce(async () => {
      current = false
      state.missing.game = NOW + 180_000
      throw new Error('read timeout')
    })
  jest.mocked(getScores).mockResolvedValue([reviewScore(true)])
  await pollOddsScoresAndResolve(db.client, state, () => current)
  expect(state.inFlight.size).toBe(0)
  expect(state.missing).toEqual({ game: NOW + 180_000 })
  expect(db.pg.none).toHaveBeenCalledTimes(1)
  expect(resolveMarketHelper).not.toHaveBeenCalled()
})

it.each([false, true])(
  'a post-commit resolution error releases its reservation (abandoned: %s)',
  async (abandoned) => {
    const db = liveDatabase()
    const state = newScorePollState()
    let current = true
    jest.mocked(getScores).mockResolvedValue([reviewScore(true)])
    jest
      .mocked(resolveMarketHelper)
      .mockImplementationOnce(
        async (_contract, _resolver, _creator, _args, onTransactionState) => {
          onTransactionState?.('started')
          onTransactionState?.('committed')
          if (abandoned) {
            current = false
            state.missing.game = NOW + 180_000
          }
          throw new Error('revalidation connection failed after commit')
        }
      )
    await pollOddsScoresAndResolve(db.client, state, () => current)
    expect(state.inFlight.size).toBe(0)
    expect(log.error).not.toHaveBeenCalledWith(
      expect.stringContaining('mutation outcome unknown')
    )
    if (abandoned) expect(state.missing.game).toBe(NOW + 180_000)
    else
      expect(log).toHaveBeenCalledWith(
        expect.stringContaining('revalidation connection failed after commit')
      )
  }
)

it.each(['write', 'resolve'] as const)(
  'a connection acquisition failure before %s releases its reservation for retry',
  async (boundary) => {
    const db = liveDatabase()
    const state = newScorePollState()
    const error = new Error('connection acquisition failed')
    if (boundary === 'write') db.pg.task.mockRejectedValueOnce(error)
    else jest.mocked(resolveMarketHelper).mockRejectedValueOnce(error)
    jest
      .mocked(getScores)
      .mockResolvedValue([reviewScore(boundary === 'resolve')])
    await pollOddsScoresAndResolve(db.client, state)
    expect(state.inFlight.size).toBe(0)
    expect(log.error).not.toHaveBeenCalledWith(
      expect.stringContaining('mutation outcome unknown')
    )
    expect(db.pg.none).toHaveBeenCalledTimes(boundary === 'write' ? 0 : 1)
    jest.mocked(Date.now).mockReturnValue(NOW + 5 * 60_000)
    const result = await pollOddsScoresAndResolve(db.client, state)
    expect(boundary === 'write' ? result.live : result.resolved).toBe(1)
  }
)

it('abandonment during connection acquisition skips the score write', async () => {
  const db = liveDatabase()
  const state = newScorePollState()
  let current = true
  db.pg.task.mockImplementationOnce(async (work) => {
    current = false
    await work({ oneOrNone: db.pg.none })
  })
  jest.mocked(getScores).mockResolvedValue([reviewScore(false)])
  await pollOddsScoresAndResolve(db.client, state, () => current)
  expect(db.pg.none).not.toHaveBeenCalled()
  expect(publishSportsLiveScore).not.toHaveBeenCalled()
  expect(state.inFlight.size).toBe(0)
})

it('R4178-01/02: a stale provider result cannot overwrite a replacement final', async () => {
  const db = liveDatabase()
  const state = newScorePollState()
  const entered = deferred<void>()
  const provider = deferred<ReturnType<typeof reviewScore>[]>()
  let current = true
  jest.mocked(getScores).mockImplementationOnce(() => {
    entered.resolve()
    return provider.promise
  })
  const old = pollOddsScoresAndResolve(db.client, state, () => current)
  await entered.promise
  current = false
  advanceTick()
  jest.mocked(getScores).mockResolvedValue([
    {
      ...reviewScore(true),
      scores: [
        { name: 'Home', score: '20' },
        { name: 'Away', score: '3' },
      ],
    },
  ])
  expect((await pollOddsScoresAndResolve(db.client, state)).resolved).toBe(1)
  expect(publishSportsLiveScore).toHaveBeenLastCalledWith(
    'game',
    expect.objectContaining({
      sportsHomeScore: 20,
      sportsLiveStatus: 'FINISHED',
      sportsLiveUpdatedTime: NOW + 180_000,
    })
  )
  provider.resolve([reviewScore(false)])
  await old
  expect(db.pg.none).toHaveBeenCalledTimes(1)
  expect(publishSportsLiveScore).toHaveBeenCalledTimes(1)
  expect(resolveMarketHelper).toHaveBeenCalledTimes(1)
  expect(state.lastPolled.americanfootball_nfl).toBe(NOW + 180_000)
})

it.each([false, true])(
  'a rejected guarded score write is neither published nor resolved (final: %s)',
  async (completed) => {
    const db = liveDatabase()
    db.pg.none.mockResolvedValueOnce(null)
    jest.mocked(getScores).mockResolvedValue([reviewScore(completed)])
    const state = newScorePollState()
    const result = await pollOddsScoresAndResolve(db.client, state)
    expect(result).toMatchObject({ live: 0, resolved: 0, pending: 1 })
    expect(publishSportsLiveScore).not.toHaveBeenCalled()
    expect(resolveMarketHelper).not.toHaveBeenCalled()
    expect(state.inFlight.size).toBe(0)
    expect(state.inFlightDetails.size).toBe(0)
  }
)
