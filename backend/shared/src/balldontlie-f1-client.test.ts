jest.mock('shared/utils', () => ({
  log: Object.assign(jest.fn(), { error: jest.fn(), warn: jest.fn() }),
}))

import {
  getF1DriverStandings,
  getF1Events,
  getF1SessionResults,
  getF1Sessions,
  hasBalldontlieKey,
} from './balldontlie-f1-client'

type Call = { url: URL; headers: Record<string, string> }

const calls = (): Call[] =>
  jest.mocked(global.fetch).mock.calls.map(([url, init]) => ({
    url: new URL(url as string),
    headers: (init as RequestInit).headers as Record<string, string>,
  }))

const page = (data: unknown[], next_cursor?: string | number | null) => ({
  ok: true,
  status: 200,
  statusText: 'OK',
  json: async () => ({ data, meta: { per_page: 100, next_cursor } }),
})

beforeEach(() => {
  jest.clearAllMocks()
  process.env.BALLDONTLIE_API_KEY = 'test-key'
  global.fetch = jest
    .fn()
    .mockResolvedValue(page([])) as unknown as typeof fetch
})

it('sends the key as a bare Authorization header and asks for full pages', async () => {
  await getF1Events(2026)
  const [call] = calls()
  expect(call.url.origin + call.url.pathname).toBe(
    'https://api.balldontlie.io/f1/v1/events'
  )
  expect(call.url.searchParams.get('season')).toBe('2026')
  expect(call.url.searchParams.get('per_page')).toBe('100')
  expect(call.headers.Authorization).toBe('test-key')
})

it('follows the cursor until the last page and concatenates the data', async () => {
  jest
    .mocked(global.fetch)
    .mockResolvedValueOnce(page([{ id: 1 }, { id: 2 }], 'c2') as Response)
    .mockResolvedValueOnce(page([{ id: 3 }], 77) as Response)
    .mockResolvedValueOnce(page([{ id: 4 }], null) as Response)
  const standings = await getF1DriverStandings(2026)
  expect(standings.map((s) => s.id)).toEqual([1, 2, 3, 4])
  const cursors = calls().map((c) => c.url.searchParams.get('cursor'))
  expect(cursors).toEqual([null, 'c2', '77'])
})

it('passes array filters the way the API reads them', async () => {
  await getF1Sessions([42, 43])
  expect(calls()[0].url.searchParams.getAll('event_ids[]')).toEqual([
    '42',
    '43',
  ])
  await getF1SessionResults(420)
  expect(calls()[1].url.pathname).toBe('/f1/v1/session_results')
  expect(calls()[1].url.searchParams.getAll('session_ids[]')).toEqual(['420'])
})

it('asks for no sessions without event ids', async () => {
  expect(await getF1Sessions([])).toEqual([])
  expect(global.fetch).not.toHaveBeenCalled()
})

it('explains a 401 as a key or plan problem', async () => {
  jest.mocked(global.fetch).mockResolvedValueOnce({
    ok: false,
    status: 401,
    statusText: 'Unauthorized',
  } as Response)
  await expect(getF1SessionResults(420)).rejects.toThrow(
    /401.*plan without this endpoint/
  )
})

it('refuses a response without a data array', async () => {
  jest.mocked(global.fetch).mockResolvedValueOnce({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => ({ error: 'nope' }),
  } as Response)
  await expect(getF1Events(2026)).rejects.toThrow('no data array')
})

it('stops a runaway cursor', async () => {
  jest
    .mocked(global.fetch)
    .mockResolvedValue(page([{ id: 1 }], 'again') as Response)
  await expect(getF1Events(2026)).rejects.toThrow('more than 10 pages')
  expect(global.fetch).toHaveBeenCalledTimes(10)
})

it('reports whether a key is configured without throwing', () => {
  expect(hasBalldontlieKey()).toBe(true)
  delete process.env.BALLDONTLIE_API_KEY
  expect(hasBalldontlieKey()).toBe(false)
})
