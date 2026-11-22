import { promises as fs } from 'fs'
import { isAbsolute, join, relative, sep } from 'path'

import {
  bdlJournalDirectory,
  bdlRevisionFile,
  latestBdlRevision,
} from './balldontlie-recording'
import { BdlParams, bdlRecordingPathParts, bdlUrl } from './balldontlie-request'

export function requireBdlLocalOnly() {
  // Match shared/utils without loading its Firebase or database dependencies in the recorder.
  if (
    process.env.LOCAL_ONLY !== 'true' ||
    process.env.GOOGLE_CLOUD_PROJECT != null
  )
    throw new Error(
      '[sports-bdl-client] BDL fixtures and fake time require LOCAL_ONLY'
    )
}

type Fixture = {
  request: { path: string; params: BdlParams; at?: string }
  recordedAt?: string
  status: number
  body: unknown
  rateLimit?: { limit?: number | null; remaining?: number | null }
}

function parseFixture(text: string, namedSample: boolean): Fixture | undefined {
  let value: Fixture
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('[sports-bdl-client] Invalid JSON in BDL fixture')
  }
  // Named adapter examples contain an unwrapped provider page, with no
  // request identity. Never invent a request for them. Incomplete envelopes
  // (or a malformed canonical recording) must still fail closed.
  if (
    namedSample &&
    value &&
    typeof value === 'object' &&
    'data' in value &&
    Object.keys(value).every((key) => key === 'data' || key === 'meta')
  )
    return
  if (
    !value?.request ||
    typeof value.request.path !== 'string' ||
    !value.request.params ||
    typeof value.request.params !== 'object' ||
    Array.isArray(value.request.params) ||
    !Number.isInteger(value.status) ||
    value.status < 200 ||
    value.status > 599 ||
    !('body' in value)
  )
    throw new Error('[sports-bdl-client] Invalid BDL fixture envelope')
  return value
}

async function confined(root: string, candidate: string) {
  const target = await fs.realpath(candidate)
  const tail = relative(root, target)
  if (isAbsolute(tail) || tail === '..' || tail.startsWith('..' + sep))
    throw new Error(
      '[sports-bdl-client] Fixture path is outside BDL_FIXTURE_DIR'
    )
  return target
}

async function read(root: string, path: string, namedSample = false) {
  const target = await confined(root, path)
  const stat = await fs.stat(target)
  if (!stat.isFile() || stat.nlink !== 1)
    throw new Error('[sports-bdl-client] Invalid fixture file')
  return parseFixture(await fs.readFile(target, 'utf8'), namedSample)
}

/** Read the recorder layout or the trimmed <league>/<endpoint>__<label>.json fixtures. */
export function createBdlFixtureTransport(now: () => number) {
  requireBdlLocalOnly()
  const dir = process.env.BDL_FIXTURE_DIR
  if (!dir) throw new Error('[sports-bdl-client] BDL_FIXTURE_DIR is required')
  return async (path: string, params: BdlParams): Promise<Response> => {
    requireBdlLocalOnly()
    const { league, endpointSlug, parameterHash } = bdlRecordingPathParts(
      path,
      params
    )
    const root = await fs.realpath(dir)
    const local = await confined(root, join(root, league))
    const key = bdlUrl(path, params).href
    const matches = (fixture: Fixture) =>
      bdlUrl(fixture.request.path, fixture.request.params).href === key
    let fixture: Fixture
    try {
      const cache = join(local, endpointSlug, parameterHash + '.json')
      const journal = bdlJournalDirectory(cache)
      let revision = 0
      try {
        revision = latestBdlRevision(await confined(root, journal))
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      }
      const entry = await read(
        root,
        revision ? bdlRevisionFile(journal, revision) : cache
      )
      if (!entry || !matches(entry))
        throw new Error('[sports-bdl-client] Fixture request mismatch')
      fixture = entry
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
      const files = await fs.readdir(local)
      const names = [
        endpointSlug,
        endpointSlug.replace(/^v\d+-/, ''),
        path.split('/').pop(),
      ]
      const named = files.filter(
        (file) =>
          file.endsWith('.json') &&
          names.some((name) => file.startsWith(name + '__'))
      )
      const scenarios = (
        await Promise.all(
          named.map((name) => read(root, join(local, name), true))
        )
      )
        .filter((entry): entry is Fixture => entry !== undefined)
        .filter(matches)
        .map((entry) => {
          const at = entry.request.at ?? entry.recordedAt
          const time = at == null ? -Infinity : Date.parse(at)
          if (Number.isNaN(time))
            throw new Error('[sports-bdl-client] Invalid fixture time')
          return { entry, time }
        })
        .filter(({ time }) => time <= now())
        .sort((a, b) => b.time - a.time)
      if (!scenarios.length)
        throw new Error('[sports-bdl-client] No matching BDL fixture')
      if (scenarios.length > 1 && scenarios[0].time === scenarios[1].time)
        throw new Error('[sports-bdl-client] Ambiguous BDL fixture')
      fixture = scenarios[0].entry
    }
    const headers = new Headers()
    for (const key of ['limit', 'remaining'] as const) {
      const value = fixture.rateLimit?.[key]
      if (value != null) headers.set('x-ratelimit-' + key, String(value))
    }
    const noBody = [204, 205, 304].includes(fixture.status)
    return new Response(noBody ? null : JSON.stringify(fixture.body), {
      status: fixture.status,
      headers,
    })
  }
}
