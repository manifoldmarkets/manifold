import { isSportsBdlEnabled } from 'common/bdl/rollout'
import { calendarPhaseKey, SPORTS_CALENDAR } from 'common/sports-calendar'
import { isProd } from 'shared/utils'
import { getCompetitionSwitches } from './supabase/sports-competition-switches'
import { recordServiceBdlResponse, bdlStatsEndpoint } from './bdl/request-stats'
import { withF1ApiRead } from './bdl/f1-read-role'
import {
  BalldontlieError,
  getF1ClientStatus,
  getF1Events,
  getF1Sessions,
  getF1SessionResults,
  getF1DriverStandings,
  getF1TeamStandings,
} from './balldontlie-f1-client'

jest.mock('common/bdl/rollout', () => ({ isSportsBdlEnabled: jest.fn() }))
jest.mock('shared/utils', () => ({
  isProd: jest.fn(),
  log: { error: jest.fn() },
}))
jest.mock('./supabase/init', () => ({ createSupabaseDirectClient: jest.fn() }))
jest.mock('./supabase/sports-competition-switches', () => ({
  getCompetitionSwitches: jest.fn(),
}))
jest.mock('./bdl/request-stats', () => ({
  ...jest.requireActual<typeof import('./bdl/request-stats')>(
    './bdl/request-stats'
  ),
  recordServiceBdlResponse: jest.fn(),
}))
jest.mock('./bdl/dev-admission', () => ({
  sendDevBdlRequest: async (
    _league: string,
    on: () => Promise<boolean>,
    send: () => Promise<Response>
  ) => {
    if (!(await on())) throw new Error('League disabled')
    return send()
  },
}))

const originalFetch = global.fetch
const envKeys = [
  'SPORTS_BDL_F1_SHARED_CLIENT',
  'BALLDONTLIE_API_KEY',
  'BDL_FIXTURE_DIR',
  'SPORTS_FAKE_NOW',
] as const
const env = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]))
const localFetch = jest.fn<
  Promise<Response>,
  [url: string, init?: { headers?: unknown; redirect?: string }]
>()
beforeEach(() => {
  jest.clearAllMocks()
  localFetch.mockReset()
  process.env.SPORTS_BDL_F1_SHARED_CLIENT = 'true'
  process.env.BALLDONTLIE_API_KEY = 'synthetic-f1-auth'
  delete process.env.BDL_FIXTURE_DIR
  delete process.env.SPORTS_FAKE_NOW
  jest.mocked(isProd).mockReturnValue(true)
  jest.mocked(isSportsBdlEnabled).mockReturnValue(true)
  global.fetch = (url, init) => localFetch(String(url), init)
})
afterEach(() => {
  for (const key of envKeys) {
    if (env[key] === undefined) delete process.env[key]
    else process.env[key] = env[key]
  }
  global.fetch = originalFetch
})
const page = (data: unknown[], next?: number | string, status = 200) =>
  new Response(JSON.stringify({ data, meta: { next_cursor: next } }), {
    status,
  })
const events = () => getF1Events(2026)
const endpoints = [
  {
    path: 'events',
    query: 'season',
    value: '2026',
    run: events,
    row: { id: 11, season: 2026 },
    bad: { season: 2025 },
  },
  {
    path: 'sessions',
    query: 'event_ids[]',
    value: '11',
    run: () => getF1Sessions([11]),
    row: { id: 22, event: { id: 11 } },
    bad: { event: { id: 12 } },
  },
  {
    path: 'session_results',
    query: 'session_ids[]',
    value: '22',
    run: () => getF1SessionResults(22),
    row: { id: 33, session: { id: 22 } },
    bad: { session: { id: 12 } },
  },
  {
    path: 'driver_standings',
    query: 'season',
    value: '2026',
    run: () => getF1DriverStandings(2026),
    row: { id: 44, season: 2026 },
    bad: { season: 2025 },
  },
  {
    path: 'team_standings',
    query: 'season',
    value: '2026',
    run: () => getF1TeamStandings(2026),
    row: { id: 55, season: 2026 },
    bad: { season: 2025 },
  },
]
it.each(endpoints)(
  'returns the same ordered native $path rows and accounts for shared HTTP only',
  async ({ path, query, value, run, row }) => {
    const next = { ...row, id: 99 }
    for (const shared of [false, true]) {
      process.env.SPORTS_BDL_F1_SHARED_CLIENT = String(shared)
      localFetch
        .mockResolvedValueOnce(page([row], 81))
        .mockResolvedValueOnce(page([next]))
      await expect(run()).resolves.toEqual([row, next])
      const calls = localFetch.mock.calls.slice(-2)
      expect(
        calls.map(([url]) => {
          const u = new URL(String(url))
          return {
            path: u.pathname,
            id: u.searchParams.get(query),
            page: u.searchParams.get('per_page'),
            cursor: u.searchParams.get('cursor'),
          }
        })
      ).toEqual(
        [null, '81'].map((cursor) => ({
          path: '/f1/v1/' + path,
          id: value,
          page: '100',
          cursor,
        }))
      )
      for (const [, init] of calls) {
        expect(init?.headers).toEqual({ Authorization: 'synthetic-f1-auth' })
        expect(init?.redirect).toBe(shared ? 'error' : undefined)
      }
      expect(recordServiceBdlResponse).toHaveBeenCalledTimes(shared ? 2 : 0)
    }
    expect(bdlStatsEndpoint('/f1/v1/' + path)).toEqual({
      league: 'f1',
      template: 'v1/' + path,
    })
  }
)
it.each(endpoints)(
  'holds all $path rows on ignored or missing requested scope',
  async ({ run, row, bad }) => {
    localFetch
      .mockResolvedValueOnce(page([row], 9))
      .mockResolvedValueOnce(page([bad]))
    await expect(run()).rejects.toThrow('ignored the requested filter')
    expect(localFetch).toHaveBeenCalledTimes(2)
  }
)
it('fails before invalid scopes, no-ops for an empty list and preserves the ordinary job readiness check', async () => {
  await expect(getF1Sessions([])).resolves.toEqual([])
  for (const read of [
    () => getF1Events(NaN),
    () => getF1SessionResults(-1),
    () => getF1Sessions([0]),
    () => getF1DriverStandings(1.5),
    () => getF1TeamStandings(Infinity),
  ])
    await expect(read()).rejects.toThrow('Invalid F1')
  expect(localFetch).not.toHaveBeenCalled()
  delete process.env.BALLDONTLIE_API_KEY
  expect(getF1ClientStatus()).toBe('missing-key')
})
it('separates overlapping admin and scheduler reads, independently of the promise completion order', async () => {
  localFetch.mockImplementation(async (url) =>
    page(
      new URL(String(url)).pathname.endsWith('/events')
        ? [{ season: 2026 }]
        : []
    )
  )
  await Promise.all([
    withF1ApiRead(async () => {
      await Promise.resolve()
      return getF1Events(2026)
    }),
    getF1Sessions([11]),
  ])
  expect(recordServiceBdlResponse).toHaveBeenCalledWith(
    'api',
    expect.objectContaining({
      request: expect.objectContaining({ path: '/f1/v1/events' }),
    })
  )
  expect(recordServiceBdlResponse).toHaveBeenCalledWith(
    'scheduler',
    expect.objectContaining({
      request: expect.objectContaining({ path: '/f1/v1/sessions' }),
    })
  )
  expect(getCompetitionSwitches).not.toHaveBeenCalled()
})
it('keeps existing production transport when global rollout is off, even when the staged flag is set', async () => {
  jest.mocked(isSportsBdlEnabled).mockReturnValue(false)
  localFetch.mockResolvedValueOnce(page([{ id: 1 }]))
  await withF1ApiRead(events)
  expect(localFetch.mock.calls[0][1]).not.toHaveProperty('redirect')
  expect(recordServiceBdlResponse).not.toHaveBeenCalled()
})
it('preserves the refused-entitlement error type used by F1 market jobs', async () => {
  localFetch.mockResolvedValueOnce(page([], undefined, 401))
  const error: unknown = await getF1SessionResults(11).catch((e) => e)
  expect(error).toBeInstanceOf(BalldontlieError)
  expect(error).toMatchObject({ status: 401 })
  expect(localFetch).toHaveBeenCalledTimes(1)
  expect(recordServiceBdlResponse).toHaveBeenCalledTimes(1)
})
it('rejects repeated pagination cursors without returning partial results', async () => {
  localFetch.mockImplementation(async () => page([{ season: 2026 }], 4))
  await expect(events()).rejects.toThrow('Repeated cursor')
  expect(localFetch).toHaveBeenCalledTimes(2)
})
it('rechecks the dev phase after a 429 and spends no further slot once disabled', async () => {
  jest.mocked(isProd).mockReturnValue(false)
  const phase = SPORTS_CALENDAR.find((p) => p.provider === 'bdl-f1')!
  jest.mocked(getCompetitionSwitches).mockResolvedValue({})
  await expect(events()).rejects.toThrow('League disabled')
  expect(localFetch).not.toHaveBeenCalled()
  jest
    .mocked(getCompetitionSwitches)
    .mockResolvedValue({ [calendarPhaseKey(phase)]: true })
  localFetch.mockImplementationOnce(async () => {
    jest.mocked(getCompetitionSwitches).mockResolvedValue({})
    return page([], undefined, 429)
  })
  await expect(events()).rejects.toThrow('League disabled')
  expect(localFetch).toHaveBeenCalledTimes(1)
  expect(recordServiceBdlResponse).toHaveBeenCalledWith(
    'dev',
    expect.objectContaining({ status: 429 })
  )
})

it('keeps the legacy ten-page ceiling while refusing all rows from an unterminated page list', async () => {
  let cursor = 0
  localFetch.mockImplementation(async () => page([{ season: 2026 }], ++cursor))
  await expect(events()).rejects.toThrow('Page cap exceeded')
  expect(localFetch).toHaveBeenCalledTimes(10)
})
it('retries a temporary service error once in the same role and accounts for both HTTP responses', async () => {
  localFetch
    .mockResolvedValueOnce(page([], undefined, 503))
    .mockResolvedValueOnce(page([{ season: 2026 }]))
  await expect(withF1ApiRead(events)).resolves.toEqual([{ season: 2026 }])
  expect(
    jest
      .mocked(recordServiceBdlResponse)
      .mock.calls.map(([role, attempt]) => [role, attempt.status])
  ).toEqual([
    ['api', 503],
    ['api', 200],
  ])
})
it('stops an opted-in page walk if the shared switch changes and never falls back mid-request', async () => {
  localFetch.mockImplementationOnce(async () => {
    process.env.SPORTS_BDL_F1_SHARED_CLIENT = 'false'
    return page([{ season: 2026 }], 81)
  })
  await expect(events()).rejects.toThrow('League disabled')
  expect(localFetch).toHaveBeenCalledTimes(1)
  expect(bdlStatsEndpoint('/nba/v1/session_results')).toBeUndefined()
  expect(bdlStatsEndpoint('/f1/v2/events')).toBeUndefined()
  expect(bdlStatsEndpoint('/f1/v1/unverified')).toBeUndefined()
})
