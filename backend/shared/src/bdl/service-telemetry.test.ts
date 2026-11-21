jest.mock('common/bdl/rollout', () => ({
  isSportsBdlEnabled: jest.fn(() => true),
}))
jest.mock('./dev-admission', () => ({
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
jest.mock('../supabase/init', () => ({ createSupabaseDirectClient: jest.fn() }))
jest.mock('../monitoring/log', () => ({ log: { warn: jest.fn() } }))

import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  BdlClientOptions,
  BdlClock,
  BdlEntitlementError,
  BdlServerError,
  bdlRecordingPathParts,
  createBdlClient,
} from '../balldontlie-client'
import { log } from '../monitoring/log'
import { createSupabaseDirectClient } from '../supabase/init'

const endpoint = '/nba/v1/games/42'
const secret = 'synthetic-provider-key'
const begin = Date.UTC(2026, 4, 1)
type Sql = (query: string, params?: unknown[]) => Promise<null>
const none = jest.fn<ReturnType<Sql>, Parameters<Sql>>()
const tx = jest.fn(async (fn: (task: { none: Sql }) => Promise<unknown>) =>
  fn({ none })
)
const fixtureVars = [
  'BDL_FIXTURE_DIR',
  'SPORTS_FAKE_NOW',
  'GOOGLE_CLOUD_PROJECT',
  'LOCAL_ONLY',
] as const
const before = fixtureVars.map((k) => process.env[k])
beforeEach(() => {
  jest.clearAllMocks()
  none.mockReset().mockResolvedValue(null)
  jest
    .mocked(createSupabaseDirectClient)
    .mockReturnValue({ tx } as unknown as ReturnType<
      typeof createSupabaseDirectClient
    >)
  for (const k of fixtureVars) delete process.env[k]
})
afterEach(() =>
  fixtureVars.forEach((k, i) => {
    if (before[i] === undefined) delete process.env[k]
    else process.env[k] = before[i]
  })
)
const writes = () =>
  none.mock.calls
    .filter(([query]) =>
      query.startsWith('insert into sports_provider_request_stats')
    )
    .map(([, params]) => params!)
function build(
  transport: NonNullable<BdlClientOptions['transport']>,
  opts: Partial<BdlClientOptions> = {}
) {
  let time = begin
  const clock: BdlClock = {
    now: () => time,
    sleep: async (ms) => {
      time += ms
    },
  }
  return createBdlClient({
    clock,
    transport,
    role: 'scheduler',
    enabledLeagues: new Set(['nba']),
    key: secret,
    ...opts,
  })
}
const response = (status: number, body = '{}') =>
  new Response(body, {
    status,
    headers: { 'x-ratelimit-limit': '100', 'x-ratelimit-remaining': '80' },
  })

it('accounts each retry before returning one successful HTTP response and keeps the recorder observation separate', async () => {
  const transport = jest
    .fn()
    .mockResolvedValueOnce(response(503))
    .mockResolvedValueOnce(response(429))
    .mockResolvedValueOnce(response(200, '{"data":[]}'))
  const callback = jest.fn()
  const client = build(transport, { onAttempt: callback })
  await expect(
    client.get(endpoint, { date: 'private-query-value' })
  ).resolves.toMatchObject({ status: 200, body: { data: [] } })
  expect(writes().map((p) => [...p.slice(0, 9), p[10], p[11]])).toEqual([
    ['bdl', 'nba', 'v1/games/{id}', 'scheduler', 0, 0, 0, 1, 503, 100, 80],
    ['bdl', 'nba', 'v1/games/{id}', 'scheduler', 0, 0, 1, 0, 429, 100, 80],
    ['bdl', 'nba', 'v1/games/{id}', 'scheduler', 1, 0, 0, 0, 200, 100, 80],
  ])
  expect(
    none.mock.calls.filter(([q]) => q === "set local statement_timeout = '2s'")
  ).toHaveLength(3)
  expect(callback).toHaveBeenCalledTimes(3)
  expect(JSON.stringify(none.mock.calls)).not.toContain('private-query-value')
  expect(JSON.stringify(none.mock.calls)).not.toContain(secret)
})

it.each([
  ['api', 401],
  ['dev', 403],
] as const)('keeps final %s HTTP failure and role', async (role, status) => {
  const transport = jest
    .fn()
    .mockResolvedValue(response(status, 'private-body'))
  const result = build(transport, { role }).get(endpoint)
  await expect(result).rejects.toMatchObject({ status })
  expect(writes()).toHaveLength(1)
  expect(writes()[0][3]).toBe(role)
  expect(writes()[0][8]).toBe(status)
  expect(JSON.stringify(writes())).not.toContain('private-body')
  expect(transport).toHaveBeenCalledTimes(1)
})

it('counts paginated responses once per page with one aggregate key', async () => {
  const transport = jest
    .fn()
    .mockResolvedValueOnce(
      response(200, '{"data":[1],"meta":{"next_cursor":"private-cursor"}}')
    )
    .mockResolvedValueOnce(response(200, '{"data":[2]}'))
  await expect(
    build(transport).getAll(
      '/nba/v1/games',
      {},
      { maxPages: 2, matches: () => true }
    )
  ).resolves.toEqual([1, 2])
  expect(writes().map((p) => p[2])).toEqual(['v1/games', 'v1/games'])
  expect(JSON.stringify(writes())).not.toContain('private-cursor')
})

it('counts successful HTTP even for malformed, unusable, or credential-echoing bodies without saving their contents', async () => {
  const transport = jest
    .fn()
    .mockResolvedValueOnce(response(200, ','))
    .mockResolvedValueOnce(response(200, JSON.stringify({ echo: secret })))
    .mockResolvedValueOnce(response(200, '{"data":[2]}'))
  const client = build(transport, { maxAttempts: 1 })
  await expect(client.get(endpoint)).rejects.toThrow('Invalid JSON')
  await expect(client.get(endpoint)).rejects.toThrow('Credential found')
  await expect(
    client.getAll(endpoint, {}, { maxPages: 1, matches: () => false })
  ).rejects.toThrow('ignored')
  expect(writes().map((p) => p[4])).toEqual([1, 1, 1])
  expect(JSON.stringify(writes())).not.toContain(secret)
})

it('redacts a numeric credential echoed in a quota header', async () => {
  const clock = build(
    async () =>
      new Response('{}', {
        headers: {
          'x-ratelimit-limit': '123456',
          'x-ratelimit-remaining': '10',
        },
      }),
    { key: '123456' }
  )
  await expect(clock.get(endpoint)).rejects.toThrow('Credential found')
  expect(writes()[0].slice(10)).toEqual([null, 10])
})

it('awaits a slow accounting attempt without delaying body decoding', async () => {
  let release!: () => void, started!: () => void, decoded!: () => void
  const writing = new Promise<void>((r) => {
      started = r
    }),
    bodyStarted = new Promise<void>((r) => {
      decoded = r
    })
  none.mockImplementation(async (query) => {
    if (query.startsWith('insert')) {
      started()
      await new Promise<void>((r) => {
        release = r
      })
    }
    return null
  })
  const res = response(200)
  jest.spyOn(res, 'json').mockImplementation(async () => {
    decoded()
    return {}
  })
  let completed = false
  const read = build(async () => res)
    .get(endpoint)
    .then(() => {
      completed = true
    })
  await Promise.all([writing, bodyStarted])
  expect(completed).toBe(false)
  release()
  await read
})

it('a failing telemetry transaction stays out of provider retries, typed failures and return values', async () => {
  none.mockRejectedValue(new Error(secret))
  const transport = jest
    .fn()
    .mockResolvedValueOnce(response(200))
    .mockResolvedValueOnce(response(401))
    .mockResolvedValueOnce(response(503))
  const c = build(transport, { maxAttempts: 1, role: 'api' })
  await expect(c.get(endpoint)).resolves.toMatchObject({ status: 200 })
  await expect(c.get(endpoint)).rejects.toBeInstanceOf(BdlEntitlementError)
  await expect(c.get(endpoint)).rejects.toBeInstanceOf(BdlServerError)
  expect(transport).toHaveBeenCalledTimes(3)
  expect(log.warn).toHaveBeenCalledWith(
    '[sports-bdl-client] accounting write failed',
    { role: 'api' }
  )
  expect(JSON.stringify(jest.mocked(log.warn).mock.calls)).not.toContain(secret)
})

it('reports a bounded statusless connection warning without inventing an HTTP row', async () => {
  const c = build(
    jest
      .fn()
      .mockRejectedValueOnce(Error(secret))
      .mockImplementationOnce(() => {
        throw Error(secret)
      }),
    { role: 'dev', maxAttempts: 1 }
  )
  for (let i = 0; i < 2; i++)
    await expect(c.get(endpoint)).rejects.toThrow('BDL connection failed')
  expect(log.warn).toHaveBeenCalledTimes(1)
  expect(log.warn).toHaveBeenCalledWith(
    '[sports-bdl-client] connection failed',
    { role: 'dev' }
  )
  expect(createSupabaseDirectClient).not.toHaveBeenCalled()
})

it('disabled, unknown, and manual paths do not initialize the service database', async () => {
  const t = jest.fn(async () => response(200))
  const off = build(t, { enabledLeagues: new Set() })
  await expect(off.get(endpoint)).rejects.toThrow('League disabled')
  await expect(
    off.getAll(endpoint, {}, { maxPages: 2, matches: () => true })
  ).rejects.toThrow('League disabled')
  expect(t).not.toHaveBeenCalled()
  expect(() => build(t, { role: 'codex' })).toThrow('Codex replay requires')
  for (const role of ['recorder', 'dev'] as const)
    await build(t, { role }).get(
      role === 'dev' ? '/nba/v1/private-resource' : endpoint
    )
  expect(t).toHaveBeenCalledTimes(2)
  expect(createSupabaseDirectClient).not.toHaveBeenCalled()
  expect(JSON.stringify(jest.mocked(log.warn).mock.calls)).not.toContain(
    'private-resource'
  )
})

it('an explicit service role replaying a local fixture never writes provider usage', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'bdl-usage-'))
  try {
    process.env.LOCAL_ONLY = 'true'
    process.env.BDL_FIXTURE_DIR = folder
    const parts = bdlRecordingPathParts(endpoint),
      dir = join(folder, parts.league, parts.endpointSlug)
    await mkdir(dir, { recursive: true })
    await writeFile(
      join(dir, parts.parameterHash + '.json'),
      JSON.stringify({
        request: { path: endpoint, params: {} },
        status: 200,
        body: { data: [] },
      })
    )
    const transport = jest.fn()
    await expect(build(transport).get(endpoint)).resolves.toMatchObject({
      status: 200,
    })
    expect(transport).not.toHaveBeenCalled()
    expect(createSupabaseDirectClient).not.toHaveBeenCalled()
  } finally {
    await rm(folder, { force: true, recursive: true })
  }
})

it('accounts the default dev transport via ordinary fetch before returning', async () => {
  const fetchMock = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(response(200))
  try {
    const client = createBdlClient({
      key: secret,
      enabledLeagues: new Set(['nba']),
    })
    await expect(client.get(endpoint)).resolves.toMatchObject({ status: 200 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(writes().map((p) => p.slice(0, 5))).toEqual([
      ['bdl', 'nba', 'v1/games/{id}', 'dev', 1],
    ])
  } finally {
    fetchMock.mockRestore()
  }
})
