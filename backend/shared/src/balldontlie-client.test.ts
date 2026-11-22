import { isSportsBdlEnabled } from 'common/bdl/rollout'
jest.mock('common/bdl/rollout', () => ({
  isSportsBdlEnabled: jest.fn(() => true),
}))
jest.mock('./bdl/dev-admission', () => ({
  sendDevBdlRequest: jest.fn(
    async (
      _league: string,
      enabled: () => Promise<boolean>,
      send: () => Promise<unknown>
    ) => {
      if (!(await enabled()))
        throw new Error('[sports-bdl-client] League disabled')
      return send()
    }
  ),
}))
// Service accounting has its own transport-to-database tests.
jest.mock('./bdl/request-stats', () => ({
  recordServiceBdlResponse: jest.fn(),
  reportBdlRequestIssue: jest.fn(),
}))

import { BDL_LEAGUES, BDL_LEAGUE_KEYS } from 'common/bdl/leagues'
import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  BdlAttempt,
  BdlClock,
  BdlEntitlementError,
  BdlRateLimitError,
  BdlServerError,
  bdlClock,
  bdlRecordingPathParts,
  createBdlClient,
} from './balldontlie-client'

const endpoint = '/nba/v1/games'
const key = 'synthetic-bdl-credential'
const initial = Date.UTC(2026, 0, 1)

function fakeClock(): BdlClock {
  let ms = initial
  return {
    now: () => ms,
    sleep: async (delay) => {
      ms += delay
    },
  }
}

function json(body: unknown, status = 200, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers })
}

function setup() {
  const clock = fakeClock()
  const transport = jest.fn<
    ReturnType<typeof fetch>,
    Parameters<typeof fetch>
  >()
  const seen: BdlAttempt[] = []
  const client = createBdlClient({
    clock,
    role: 'recorder',
    key,
    transport,
    onAttempt: (a) => {
      seen.push(a)
    },
  })
  return { ...client, clock, transport, seen }
}

const envNames = [
  'BDL_FIXTURE_DIR',
  'LOCAL_ONLY',
  'GOOGLE_CLOUD_PROJECT',
  'SPORTS_FAKE_NOW',
] as const
const original = envNames.map((name) => process.env[name])
beforeEach(() => {
  for (const name of envNames) delete process.env[name]
})
afterEach(() => {
  envNames.forEach((name, i) => {
    if (original[i] === undefined) delete process.env[name]
    else process.env[name] = original[i]
  })
})

it('sends the key only in Authorization and records only the selected quota headers', async () => {
  const { get, transport } = setup()
  transport.mockResolvedValueOnce(
    json({ data: [] }, 200, {
      'x-ratelimit-limit': '5',
      'x-ratelimit-remaining': '4',
      'x-unrelated': key,
    })
  )
  const result = await get(endpoint, {
    game_ids: [1, 2],
    'dates[]': ['2026-01-01'],
  })
  const [url, init] = transport.mock.calls[0]
  expect(String(url)).toBe(
    'https://api.balldontlie.io/nba/v1/games?dates%5B%5D=2026-01-01&game_ids%5B%5D=1&game_ids%5B%5D=2'
  )
  expect(init).toMatchObject({
    method: 'GET',
    headers: { Authorization: key },
    redirect: 'error',
  })
  expect(result.rateLimit).toEqual({ limit: 5, remaining: 4 })
  expect(JSON.stringify(result)).not.toContain(key)
})

it.each([
  '/account/v1/status',
  '/Account/v1/status',
  'https://other.invalid/nba/v1/games',
  '//other.invalid/nba/v1/games',
  '/nba/v1/../../account/v1/status',
  '/nba/v1/%2e%2e',
  '/nba/v1/games?next=1',
  '/nba/v1/games\n',
])('rejects unsafe path %s before transport', async (path) => {
  const { get, transport } = setup()
  await expect(get(path)).rejects.toThrow('Invalid sports endpoint')
  expect(transport).not.toHaveBeenCalled()
})

it('withholds credentials in responses and sanitized network failures from observers', async () => {
  const { get, transport, seen } = setup()
  transport.mockResolvedValueOnce(json({ detail: key }, 500))
  await expect(get(endpoint)).rejects.toThrow(
    'Credential found in provider response'
  )
  transport.mockRejectedValue(new Error('fetch error with ' + key))
  await expect(get(endpoint)).rejects.toThrow('BDL connection failed')
  await expect(get(endpoint, { id: key })).rejects.toThrow(
    'Credential found in request parameters'
  )
  expect(seen).toEqual([])
  // One rejected response followed by three bounded connection failures.
  expect(transport).toHaveBeenCalledTimes(4)
})

it('canonicalizes repeated params and keeps leagues, endpoint versions and cursors distinct', () => {
  const a = bdlRecordingPathParts('/fifa/worldcup/v1/odds/opening', {
    game_ids: [4, 7],
    cursor: 1,
  })
  const b = bdlRecordingPathParts('/fifa/worldcup/v1/odds/opening', {
    cursor: '1',
    'game_ids[]': ['4', '7'],
  })
  expect(a).toEqual(b)
  expect(a).toMatchObject({
    league: 'fifa-worldcup',
    endpointSlug: 'v1-odds-opening',
  })
  expect(bdlRecordingPathParts(endpoint, { cursor: 1 })).not.toEqual(
    bdlRecordingPathParts(endpoint, { cursor: 2 })
  )
  expect(() =>
    bdlRecordingPathParts(endpoint, { ids: [1], 'ids[]': 2 })
  ).toThrow('duplicate parameter')
})

it('shares the manual rate between concurrent recorder clients and honors its latest cooldown', async () => {
  const clock = fakeClock()
  const shared = {
    role: 'recorder' as const,
    recorderRate: 3,
    clock,
    key,
    transport: async () =>
      json(
        {},
        200,
        clock.now() === initial + 40_000
          ? { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '75' }
          : undefined
      ),
  }
  const first = createBdlClient(shared)
  const second = createBdlClient(shared)
  const attempts = await Promise.all([
    first.get(endpoint),
    second.get('/nfl/v1/games'),
    first.get(endpoint),
  ])
  expect(attempts.map((a) => Date.parse(a.request.at) - initial)).toEqual([
    0, 20_000, 40_000,
  ])
  expect(Date.parse((await second.get(endpoint)).request.at) - initial).toBe(
    115_000
  )
})

it.each([
  ['scheduler', 200],
  ['api', 2000],
  ['dev', 30000],
  ['recorder', 1000],
] as const)(
  'enforces the %s budget across clients and league slugs',
  async (role, interval) => {
    const options = {
      key,
      clock: fakeClock(),
      role,
      enabledLeagues: new Set(['nba', 'nfl'] as const),
      transport: async () => json({}),
    }
    const first = createBdlClient(options)
    const second = createBdlClient(options)
    const results = [
      await first.get(endpoint),
      await second.get('/nfl/v1/games'),
      await first.get('/nfl/v1/games'),
    ]
    expect(results.map((r) => Date.parse(r.request.at) - initial)).toEqual([
      0,
      interval,
      interval * 2,
    ])
  }
)

it('halves the shared rate below 20%, pauses below 5%, and restores the budget after reset', async () => {
  const clock = fakeClock()
  const samples = [20, 19, 5, 4, 50, 50]
  const opts = {
    role: 'scheduler' as const,
    clock,
    key,
    enabledLeagues: new Set(['nba', 'nfl'] as const),
    transport: async () =>
      json({}, 200, {
        'x-ratelimit-limit': '100',
        'x-ratelimit-remaining': String(samples.shift()),
        'x-ratelimit-reset': String(initial / 1000 + 7),
      }),
  }
  const nba = createBdlClient(opts)
  const nfl = createBdlClient(opts)
  const times = []
  for (let i = 0; i < 3; i++) {
    times.push(Date.parse((await nba.get(endpoint)).request.at) - initial)
    times.push(
      Date.parse((await nfl.get('/nfl/v1/games')).request.at) - initial
    )
  }
  expect(times).toEqual([0, 200, 600, 1000, 7000, 7200])
})

it('uses the actual trial rate for adaptive disk slots and conservatively pauses without a usable reset', async () => {
  const clock = fakeClock()
  const external = jest.fn(async (_rate: number) => undefined)
  const samples = [19, 4, 100]
  const client = createBdlClient({
    role: 'recorder',
    recorderRate: 3,
    clock,
    key,
    acquireSharedSlot: external,
    transport: async () =>
      json({}, 200, {
        'x-ratelimit-limit': '100',
        'x-ratelimit-remaining': String(samples.shift()),
        'x-ratelimit-reset': 'invalid',
      }),
  })
  const times = []
  for (let i = 0; i < 3; i++)
    times.push(Date.parse((await client.get(endpoint)).request.at) - initial)
  expect(times).toEqual([0, 40_000, 100_000])
  expect(external.mock.calls.map(([rate]) => rate)).toEqual([3, 1.5, 3])
  expect(() => createBdlClient({ role: 'api', recorderRate: 500 })).toThrow(
    'Only the manual recorder'
  )
})

it('makes zero provider requests for disabled service leagues, including on direct and paged reads', async () => {
  const transport = jest.fn()
  const client = createBdlClient({ role: 'scheduler', key, transport })
  for (const slug of BDL_LEAGUE_KEYS) {
    const path = BDL_LEAGUES[slug].apiBase + '/games'
    await expect(
      client.getAll(path, {}, { maxPages: 2, matches: () => true })
    ).rejects.toThrow('League disabled')
    await expect(client.get(path)).rejects.toThrow('League disabled')
  }
  expect(transport).not.toHaveBeenCalled()
  const selected = createBdlClient({
    role: 'scheduler',
    key,
    transport,
    clock: fakeClock(),
    enabledLeagues: new Set(['nba']),
  })
  transport.mockResolvedValueOnce(json({ data: [42] }))
  await expect(
    selected.getAll(endpoint, {}, { maxPages: 2, matches: () => true })
  ).resolves.toEqual([42])
  expect(transport).toHaveBeenCalledTimes(1)
})

it('honors both server cooldowns and then retries with exponential backoff', async () => {
  const { get, transport, seen } = setup()
  transport
    .mockResolvedValueOnce(
      json({}, 429, {
        'retry-after': '3',
        'x-ratelimit-reset': String(initial / 1000 + 5),
      })
    )
    .mockResolvedValueOnce(json({}, 429))
    .mockResolvedValueOnce(json({ data: [] }))
  await get(endpoint)
  expect(
    seen.map((a) => [a.status, Date.parse(a.request.at) - initial])
  ).toEqual([
    [429, 0],
    [429, 5000],
    [200, 7000],
  ])
})

it('honors HTTP date Retry-After and quota depletion on successful requests', async () => {
  const { get, transport, seen } = setup()
  transport
    .mockResolvedValueOnce(
      json({}, 503, { 'retry-after': new Date(initial + 12_000).toUTCString() })
    )
    .mockResolvedValueOnce(
      json({}, 200, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '8' })
    )
    .mockResolvedValueOnce(json({}))
  await get(endpoint)
  await get(endpoint)
  expect(seen.map((a) => Date.parse(a.request.at) - initial)).toEqual([
    0, 12_000, 20_000,
  ])
})

it('throws typed terminal errors with no retry on a 401 and stops after three server failures', async () => {
  const { get, transport, seen } = setup()
  transport.mockResolvedValueOnce(json({}, 401))
  await expect(get(endpoint)).rejects.toBeInstanceOf(BdlEntitlementError)
  transport.mockImplementation(async () => json({}, 502))
  await expect(get(endpoint)).rejects.toBeInstanceOf(BdlServerError)
  transport.mockImplementation(async () => json({}, 429))
  await expect(get(endpoint)).rejects.toBeInstanceOf(BdlRateLimitError)
  expect(seen.map((a) => a.status)).toEqual([401, 502, 502, 502, 429, 429, 429])
})

it('follows numeric and string cursors and returns only rows that match the filter', async () => {
  const { getAll, transport } = setup()
  transport
    .mockResolvedValueOnce(
      json({ data: [{ id: 9 }], meta: { next_cursor: 0 } })
    )
    .mockResolvedValueOnce(
      json({ data: [{ id: 9 }], meta: { next_cursor: 'next' } })
    )
    .mockResolvedValueOnce(json({ data: [], meta: {} }))
  const options = {
    maxPages: 3,
    matches: (row: { id: number }) => row.id === 9,
  }
  await expect(getAll(endpoint, { game_ids: [9] }, options)).resolves.toEqual([
    { id: 9 },
    { id: 9 },
  ])
  expect(
    transport.mock.calls.map(([url]) =>
      new URL(String(url)).searchParams.get('cursor')
    )
  ).toEqual([null, '0', 'next'])
  transport.mockResolvedValueOnce(json({ data: [{ id: 8 }] }))
  await expect(getAll(endpoint, { game_ids: [9] }, options)).rejects.toThrow(
    'ignored the requested filter'
  )
})

it('rejects malformed pages, cyclic cursors and unbounded responses', async () => {
  const { getAll, transport } = setup()
  const opts = { maxPages: 20, matches: () => true }
  transport.mockResolvedValueOnce(json({ data: null }))
  await expect(getAll(endpoint, {}, opts)).rejects.toThrow('no data array')
  transport.mockImplementation(async () =>
    json({ data: [], meta: { next_cursor: 'again' } })
  )
  await expect(getAll(endpoint, {}, opts)).rejects.toThrow('Repeated cursor')
  await expect(getAll(endpoint, {}, { ...opts, maxPages: 1 })).rejects.toThrow(
    'Page cap exceeded'
  )
  expect(transport).toHaveBeenCalledTimes(4)
})

it('requires LOCAL_ONLY for fixtures and fake time, and rejects deployed hosts', () => {
  process.env.BDL_FIXTURE_DIR = 'fixtures'
  expect(() => createBdlClient()).toThrow('require LOCAL_ONLY')
  delete process.env.BDL_FIXTURE_DIR
  process.env.SPORTS_FAKE_NOW = '2026-01-01T00:00:00Z'
  expect(() => bdlClock()).toThrow('require LOCAL_ONLY')
  process.env.LOCAL_ONLY = 'true'
  expect(() => createBdlClient()).toThrow('Fake time requires fixtures')
  process.env.GOOGLE_CLOUD_PROJECT = 'test-project'
  expect(() => bdlClock()).toThrow('require LOCAL_ONLY')
})

it('replays exact requests from both layouts and picks the latest applicable scenario', async () => {
  const dir = await fs.mkdtemp(join(tmpdir(), 'bdl-fixture-'))
  try {
    process.env.BDL_FIXTURE_DIR = dir
    process.env.LOCAL_ONLY = 'true'
    process.env.SPORTS_FAKE_NOW = new Date(initial).toISOString()
    const transport = jest.fn()
    const client = createBdlClient({ transport })
    const params = { game_ids: [42] }
    const parts = bdlRecordingPathParts(endpoint, params)
    const local = join(dir, parts.league)
    const raw = join(local, parts.endpointSlug)
    await fs.mkdir(raw, { recursive: true })
    const fixture = {
      request: { path: endpoint, params },
      body: { data: [1] },
      status: 200,
    }
    const file = join(raw, parts.parameterHash + '.json')
    await fs.writeFile(file, JSON.stringify(fixture))
    await expect(
      client.get(endpoint, { 'game_ids[]': ['42'] })
    ).resolves.toMatchObject({ body: { data: [1] } })
    await fs.unlink(file)
    for (const [ms, label] of [
      [initial - 50_000, 'open'],
      [initial, 'final'],
      [initial + 100_000, 'corrected'],
    ] as const) {
      await fs.writeFile(
        join(local, 'games__' + label + '.json'),
        JSON.stringify({
          ...fixture,
          recordedAt: new Date(ms).toISOString(),
          body: label,
        })
      )
    }
    await fs.writeFile(
      join(local, 'games__adapter.json'),
      JSON.stringify({ data: [{ id: 123 }] })
    )
    await expect(client.get(endpoint, params)).resolves.toMatchObject({
      body: 'final',
    })
    await expect(client.get(endpoint, { game_ids: [999] })).rejects.toThrow(
      'No matching BDL fixture'
    )
    await fs.writeFile(
      join(local, 'games__broken.json'),
      JSON.stringify({ request: { path: endpoint }, data: [] })
    )
    await expect(client.get(endpoint, params)).rejects.toThrow(
      'Invalid BDL fixture envelope'
    )
    expect(transport).not.toHaveBeenCalled()
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})

it('rechecks the live switch when waiting to retry a provider call', async () => {
  const clock = fakeClock()
  const sleep = clock.sleep
  const enabled = new Set(['nba'] as const)
  clock.sleep = async (ms) => {
    enabled.clear()
    await sleep(ms)
  }
  const transport = jest.fn(async () => json({}, 503))
  const client = createBdlClient({
    role: 'scheduler',
    clock,
    key,
    enabledLeagues: enabled,
    transport,
  })
  await expect(client.get(endpoint)).rejects.toThrow('League disabled')
  expect(transport).toHaveBeenCalledTimes(1)
})

it('blocks every service league with an enabled-league snapshot when rollout is off', async () => {
  const transport = jest.fn()
  jest.mocked(isSportsBdlEnabled).mockReturnValue(false)
  try {
    for (const role of ['api', 'scheduler', 'dev'] as const) {
      const client = createBdlClient({
        role,
        key,
        transport,
        enabledLeagues: new Set(BDL_LEAGUE_KEYS),
      })
      for (const league of BDL_LEAGUE_KEYS) {
        const path = BDL_LEAGUES[league].apiBase + '/games'
        await expect(client.get(path)).rejects.toThrow('League disabled')
        await expect(
          client.getAll(path, {}, { maxPages: 1, matches: () => true })
        ).rejects.toThrow('League disabled')
      }
    }
    expect(transport).not.toHaveBeenCalled()
  } finally {
    jest.mocked(isSportsBdlEnabled).mockReturnValue(true)
  }
})

it('requires an actual local fixture directory for a codex replay', () => {
  const transport = jest.fn()
  expect(() => createBdlClient({ role: 'codex', key, transport })).toThrow(
    'Codex replay requires'
  )
  expect(transport).not.toHaveBeenCalled()
})

it('retries dropped responses and unreadable success bodies within the same capped budget', async () => {
  const { get, transport, seen } = setup()
  transport
    .mockRejectedValueOnce(new Error('transport'))
    .mockResolvedValueOnce(new Response('{', { status: 200 }))
    .mockResolvedValueOnce(json({ ready: true }))
  await expect(get(endpoint)).resolves.toMatchObject({ body: { ready: true } })
  expect(transport).toHaveBeenCalledTimes(3)
  expect(seen.map((a) => a.status)).toEqual([200])
})

it('rechecks live authorization for each page, even when a run started enabled', async () => {
  let enabled = true
  const transport = jest.fn(async () => {
    enabled = false
    return json({ data: [], meta: { next_cursor: 2 } })
  })
  const client = createBdlClient({
    key,
    role: 'scheduler',
    clock: fakeClock(),
    transport,
    enabledLeagues: new Set(['nba']),
    isLeagueEnabled: async (league) => league === 'nba' && enabled,
  })
  await expect(
    client.getAll(endpoint, {}, { maxPages: 3, matches: () => true })
  ).rejects.toThrow('League disabled')
  expect(transport).toHaveBeenCalledTimes(1)
})

it('runs the documented local NBA replay alongside checked-in body-only adapter inputs', async () => {
  const { replay } = await import('../../scripts/bdl-recorder/replay')
  const root = join(__dirname, '../test/fixtures/bdl')
  process.env.BDL_FIXTURE_DIR = root
  process.env.LOCAL_ONLY = 'true'
  const network = jest
    .spyOn(global, 'fetch')
    .mockRejectedValue(new Error('network disabled'))
  const printed = jest.spyOn(console, 'log').mockImplementation(() => undefined)
  try {
    await replay(['/nba/v1/games', 'per_page=1&seasons[]=2026'])
    expect(JSON.parse(printed.mock.calls[0][0])).toMatchObject({
      status: 200,
      body: { data: [{ id: 42, season: 2026 }] },
    })
    await expect(replay(['/nba/v1/games', 'seasons[]=1991'])).rejects.toThrow(
      'No matching BDL fixture'
    )
    expect(network).not.toHaveBeenCalled()
  } finally {
    network.mockRestore()
    printed.mockRestore()
  }
})
