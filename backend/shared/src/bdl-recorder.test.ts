import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import * as path from 'node:path'

import { bdlRecordingPathParts } from './balldontlie-request'
import { createBdlFixtureTransport } from './balldontlie-fixture'
import { bdlJournalDirectory, bdlRevisionFile } from './balldontlie-recording'
import { main } from '../../scripts/bdl-recorder'
import type { PlanStep } from '../../scripts/bdl-recorder/plan'
import { createRecorder } from '../../scripts/bdl-recorder/recorder'
import { createRecordingStore } from '../../scripts/bdl-recorder/store'

const fakeKey = ['unit', 'test', 'credential'].join('-')

function step(endpoint = '/nba/v1/games', paginate = false): PlanStep {
  const preview = { league: 'nba', path: endpoint, params: {} }
  return { label: endpoint, preview, paginate, resolve: () => [preview] }
}

// CLI integration uses a tiny synthetic plan. Plan construction has separate
// tests against representative spec files.
jest.mock('../../scripts/bdl-recorder/rate', () => ({
  acquireRecorderSlot: async () => undefined,
  maxPaidRecorderRate: 500,
}))
jest.mock('../../scripts/bdl-recorder/plan', () => ({
  buildPlan: () => [step()],
}))

const tempParent = realpathSync(tmpdir())
let temp: string
let out: string
beforeEach(() => {
  temp = mkdtempSync(path.join(tempParent, 'bdl-recorder-test-'))
  out = path.join(temp, 'raw')
})
afterEach(() => {
  jest.restoreAllMocks()
  if (
    path.dirname(temp) === tempParent &&
    path.basename(temp).startsWith('bdl-recorder-test-')
  )
    rmSync(temp, { recursive: true, force: true })
})

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? files(full) : [full]
  })
}

function setup(responses: [number, unknown][], resume = false) {
  let time = 1700000000000
  const calls: { at: number; url: string }[] = []
  const transport: typeof fetch = async (url, options) => {
    calls.push({ at: time, url: String(url) })
    expect(new Headers(options?.headers).get('Authorization')).toBe(fakeKey)
    const response = responses.shift()
    if (!response) throw new Error('Unexpected request')
    return new Response(JSON.stringify(response[1]), { status: response[0] })
  }
  const clock = {
    now: () => time,
    sleep: async (ms: number) => {
      time += ms
    },
  }
  const recorder = createRecorder({
    out,
    key: fakeKey,
    clock,
    transport,
    resume,
  })
  return { recorder, calls, clock }
}

it('follows cursors, globally spaces retries, and resumes without network', async () => {
  const pages = step('/nba/v1/games', true)
  const { recorder, calls } = setup([
    [429, { error: 'slow down' }],
    [200, { data: [{ id: 1 }], meta: { next_cursor: 2 } }],
    [200, { data: [{ id: 2 }] }],
  ])
  await recorder.run([pages])
  expect(calls).toHaveLength(3)
  expect(calls[1].at - calls[0].at).toBeGreaterThanOrEqual(20000)
  expect(calls[2].at - calls[1].at).toBeGreaterThanOrEqual(20000)
  expect(new URL(calls[2].url).searchParams.get('cursor')).toBe('2')
  expect(recorder.summary.rateLimited).toBe(1)
  const { recorder: resumed, calls: secondRun } = setup([], true)
  await resumed.run([pages])
  expect(secondRun).toHaveLength(0)
  expect(resumed.summary.resumed).toBe(2)
  expect(
    files(out).filter((name) => path.basename(name) === 'response.json')
  ).toHaveLength(3)
})

it('skips the rest of an unentitled endpoint and continues other leagues', async () => {
  const { recorder, calls } = setup([
    [401, {}],
    [200, { data: [] }],
  ])
  await recorder.run([step(), step(), step('/mma/v1/events')])
  expect(calls).toHaveLength(2)
  expect(recorder.summary).toMatchObject({
    unauthorized: 1,
    skippedUnentitled: 1,
    successful: 1,
  })
})

it('stops after exactly three consecutive server failures and preserves each response', async () => {
  const { recorder, calls } = setup([
    [503, {}],
    [500, {}],
    [502, {}],
  ])
  await expect(
    recorder.run([step(), step('/nba/v1/players')])
  ).rejects.toThrow()
  expect(calls).toHaveLength(3)
  expect(recorder.summary.serverErrors).toBe(3)
  expect(
    files(out).filter((name) => path.basename(name) === 'response.json')
  ).toHaveLength(3)
})

it('refuses both new and existing paths inside a linked worktree', () => {
  writeFileSync(path.join(temp, '.git'), 'gitdir: elsewhere')
  expect(() => createRecordingStore(out)).toThrow(/outside Git/)
  expect(existsSync(out)).toBe(false)
})

it('prints the plan without reading a key, creating output or making a request', async () => {
  const fetchSpy = jest.spyOn(global, 'fetch')
  const output: string[] = []
  await main(
    [
      '--leagues',
      'nba',
      '--spec-dir',
      temp,
      '--out',
      out,
      '--plan',
      '--key-file',
      path.join(temp, 'missing'),
    ],
    (line) => output.push(line)
  )
  expect(output[0]).toContain('GET /nba/v1/games')
  expect(output.join(' ')).toContain('1')
  expect(fetchSpy).not.toHaveBeenCalled()
  expect(existsSync(out)).toBe(false)
})

it('keeps the key out of every recorded file and output line, including provider echoes', async () => {
  const keyFile = path.join(temp, 'test-credential')
  writeFileSync(keyFile, fakeKey)
  mkdirSync(out)
  const logs = jest.spyOn(console, 'log').mockImplementation(() => undefined)
  const errors = jest
    .spyOn(console, 'error')
    .mockImplementation(() => undefined)
  const fetchSpy = jest
    .spyOn(global, 'fetch')
    .mockImplementation(async (_url, options) => {
      expect(new Headers(options?.headers).get('Authorization')).toBe(fakeKey)
      return new Response('{"data":[]}', { status: 200 })
    })
  const args = [
    '--rate',
    '60',
    '--key-file',
    keyFile,
    '--spec-dir',
    temp,
    '--leagues',
    'nba',
    '--out',
    out,
  ]
  await main(args)
  fetchSpy.mockResolvedValueOnce(
    new Response(JSON.stringify({ error: fakeKey }), { status: 401 })
  )
  await expect(main(args)).rejects.toThrow()
  const written = files(out)
    .map((name) => name + readFileSync(name, 'utf8'))
    .join('\n')
  expect(written).toContain('/nba/v1/games')
  expect(written).not.toContain(fakeKey)
  expect(written).not.toContain('Authorization')
  expect(
    JSON.stringify([...logs.mock.calls, ...errors.mock.calls])
  ).not.toContain(fakeKey)
})

it('watch appends changes only and compares against the previous run', async () => {
  const snapshot = (id: number) => ({ data: [{ id }] })
  const { recorder, clock } = setup([
    [200, snapshot(1)],
    [200, snapshot(1)],
    [200, snapshot(2)],
  ])
  const controller = new AbortController()
  const sleep = clock.sleep
  clock.sleep = async (ms) => {
    await sleep(ms)
    if (recorder.summary.successful === 3) controller.abort()
  }
  await recorder.watch('nba', '10', () => [step()], controller.signal)
  const log = path.join(out, 'watch', 'nba-10.jsonl')
  const original = readFileSync(log, 'utf8')
  expect(original.trim().split('\n')).toHaveLength(2)
  const later = setup([[200, snapshot(2)]])
  const stop = new AbortController()
  later.clock.sleep = async () => {
    stop.abort()
  }
  await later.recorder.watch('nba', '10', () => [step()], stop.signal)
  expect(readFileSync(log, 'utf8')).toBe(original)
})

it('preserves a truncated watch tail and resumes from the last complete observation', () => {
  const store = createRecordingStore(out)
  store.watch('nba', '42', { digest: 'previous' })
  const log = path.join(out, 'watch', 'nba-42.jsonl')
  const partial = '{"digest":"incom'
  writeFileSync(log, partial, { flag: 'a' })
  expect(store.lastWatchDigest('nba', '42')).toBe('previous')
  expect(readFileSync(log, 'utf8')).toBe('{"digest":"previous"}\n')
  const fragment = files(out).find((name) => name.endsWith('.partial'))
  expect(fragment && readFileSync(fragment, 'utf8')).toBe(partial)
})

it('records a rejected experimental filter and keeps ordinary HTTP failures fatal', async () => {
  const probe = { ...step(), rejectedStatuses: [422] }
  const { recorder, calls } = setup([
    [422, { error: 'invalid filter' }],
    [200, { data: [] }],
  ])
  await recorder.run([probe, step('/mma/v1/events')])
  expect(calls).toHaveLength(2)
  expect(recorder.summary.rejectedProbes).toEqual([
    { label: probe.label, status: 422 },
  ])
  const ordinary = setup([[422, {}]])
  await expect(ordinary.recorder.run([step()])).rejects.toThrow('422')
})

it('records when each change was observed within a multi-request poll', async () => {
  const { recorder } = setup([
    [200, { data: [1] }],
    [200, { data: [2] }],
  ])
  const first = step()
  const second = step('/mma/v1/events')
  const { observedAt } = await recorder.run([first, second], true)
  expect(
    Date.parse(observedAt[second.label][0]) -
      Date.parse(observedAt[first.label][0])
  ).toBe(20000)
})

it('separates dispatch, received HTTP and usable saved snapshots across retries', async () => {
  const { clock } = setup([])
  let mode: 'transport' | 'invalid' | 'valid' | 'empty' | 'error-body' =
    'transport'
  const transport = jest.fn(async () => {
    if (mode === 'transport') throw new Error('disconnected')
    if (mode === 'empty') return new Response(null, { status: 204 })
    if (mode === 'error-body') return new Response('{"error":"bad page"}')
    return new Response(mode === 'invalid' ? '{' : '{"data":[]}', {
      status: 200,
    })
  })
  const recorder = createRecorder({ out, key: fakeKey, clock, transport })
  const counts = () => {
    const { dispatched, httpResponses, usableSnapshots } = recorder.summary
    return [dispatched, httpResponses, usableSnapshots]
  }
  await expect(recorder.run([step()])).rejects.toThrow('connection failed')
  expect(counts()).toEqual([6, 0, 0])
  mode = 'invalid'
  await expect(recorder.run([step()])).rejects.toThrow('Invalid JSON')
  expect(counts()).toEqual([12, 6, 0])
  mode = 'valid'
  await recorder.run([step()])
  expect(counts()).toEqual([13, 7, 1])
  mode = 'empty'
  await expect(recorder.run([step()])).rejects.toThrow('no usable data')
  expect(counts()).toEqual([14, 8, 1])
  mode = 'error-body'
  await expect(recorder.run([step()])).rejects.toThrow('no usable data')
  expect(counts()).toEqual([15, 9, 1])
  expect(recorder.summary).toMatchObject({ calls: 15, successful: 1 })
  const second = setup([[200, { data: [] }]], true)
  await second.recorder.run([step()])
  expect(second.recorder.summary).toMatchObject({
    dispatched: 1,
    resumed: 0,
    usableSnapshots: 1,
  })
})

const endpoint = '/nba/v1/games'
function nbaArchive() {
  const { parameterHash, endpointSlug } = bdlRecordingPathParts(endpoint)
  const directory = path.join(out, 'nba', endpointSlug)
  const cache = path.join(directory, parameterHash + '.json')
  return { directory, cache, journal: bdlJournalDirectory(cache) }
}
const attempt = (id: number) => ({
  request: { path: endpoint, params: {}, at: '2026-01-01T00:00:00.000Z' },
  status: 200,
  rateLimit: { limit: null, remaining: null },
  body: { data: [id] },
})

it('publishes equal-time observations individually and recovers an interrupted cache update', async () => {
  const { directory, cache, journal } = nbaArchive()
  mkdirSync(directory, { recursive: true })
  writeFileSync(cache, JSON.stringify(attempt(0))) // Prior recorder format.
  const store = createRecordingStore(out)
  store.save(attempt(1))
  store.save(attempt(2))
  expect(
    [1, 2, 3].map(
      (n) =>
        JSON.parse(readFileSync(bdlRevisionFile(journal, n), 'utf8')).body.data
    )
  ).toEqual([[0], [1], [2]])
  // Process stopped after immutable publication and before replacing the cache.
  writeFileSync(cache, JSON.stringify(attempt(1)))
  const env = process.env
  try {
    process.env = { ...env, LOCAL_ONLY: 'true', BDL_FIXTURE_DIR: out }
    delete process.env.GOOGLE_CLOUD_PROJECT
    const response = await createBdlFixtureTransport(Date.now)(endpoint, {})
    expect(await response.json()).toEqual(attempt(2).body)
  } finally {
    process.env = env
  }
  const resumed = setup([], true)
  await resumed.recorder.run([step()])
  expect(resumed.recorder.summary).toMatchObject({ dispatched: 0, resumed: 1 })
  expect(JSON.parse(readFileSync(cache, 'utf8'))).toEqual(attempt(2))
  expect(readdirSync(journal).sort()).toEqual(['1', '2', '3'])
})

it.each([false, true])(
  'keeps both concurrent publishers when a legacy cache exists: %s',
  (legacy) => {
    const { directory, cache, journal } = nbaArchive()
    mkdirSync(directory, { recursive: true })
    if (legacy) writeFileSync(cache, JSON.stringify(attempt(0)))
    const first = createRecordingStore(out),
      second = createRecordingStore(out)
    const fs = jest.requireActual<typeof import('node:fs')>('node:fs')
    const rename = fs.renameSync
    let contended = false
    jest.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (!contended && String(to) === path.join(journal, '1')) {
        contended = true
        second.save(attempt(2))
      }
      rename(from, to)
    })
    first.save(attempt(1))
    expect(contended).toBe(true)
    const archived = readdirSync(journal).map(
      (n) =>
        JSON.parse(readFileSync(bdlRevisionFile(journal, Number(n)), 'utf8'))
          .body.data[0]
    )
    expect(archived.sort()).toEqual(legacy ? [0, 1, 2] : [1, 2])
    expect(first.read(endpoint, {})?.body).toEqual({ data: [1] })
  }
)

it('counts no dispatch if acquiring the shared rate slot fails', async () => {
  const { clock } = setup([])
  const transport = jest.fn()
  const recorder = createRecorder({
    out,
    clock,
    key: fakeKey,
    transport,
    acquireSharedSlot: async () => {
      throw new Error('admission denied')
    },
  })
  await expect(recorder.run([step()])).rejects.toThrow('admission denied')
  expect(transport).not.toHaveBeenCalled()
  expect(recorder.summary).toMatchObject({
    dispatched: 0,
    httpResponses: 0,
    usableSnapshots: 0,
  })
})
