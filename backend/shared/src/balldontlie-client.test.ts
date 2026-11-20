import { promises as fs } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  BdlAttempt,
  BdlClock,
  BdlEntitlementError,
  BdlRateLimitError,
  BdlRateLimiter,
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
  const limiter = new BdlRateLimiter(600, clock)
  const transport = jest.fn<
    ReturnType<typeof fetch>,
    Parameters<typeof fetch>
  >()
  const seen: BdlAttempt[] = []
  const client = createBdlClient({
    clock,
    limiter,
    key,
    transport,
    onAttempt: (a) => {
      seen.push(a)
    },
  })
  return { ...client, clock, limiter, transport, seen }
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
  transport.mockRejectedValueOnce(new Error('fetch error with ' + key))
  await expect(get(endpoint)).rejects.toThrow('BDL connection failed')
  await expect(get(endpoint, { id: key })).rejects.toThrow(
    'Credential found in request parameters'
  )
  expect(seen).toEqual([])
  expect(transport).toHaveBeenCalledTimes(2)
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

it('spaces requests across clients and keeps the latest shared cooldown', async () => {
  const clock = fakeClock()
  const limiter = new BdlRateLimiter(3, clock)
  const shared = {
    clock,
    limiter,
    key,
    transport: async () => json({ data: [] }),
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
  limiter.deferUntil(clock.now() + 75_000)
  limiter.deferUntil(clock.now() + 50_000)
  expect(Date.parse((await second.get(endpoint)).request.at) - initial).toBe(
    115_000
  )
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
    await expect(client.get(endpoint, params)).resolves.toMatchObject({
      body: 'final',
    })
    await expect(client.get(endpoint, { game_ids: [999] })).rejects.toThrow(
      'No matching BDL fixture'
    )
    expect(transport).not.toHaveBeenCalled()
  } finally {
    await fs.rm(dir, { recursive: true, force: true })
  }
})
