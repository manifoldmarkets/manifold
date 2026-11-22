import { promises as fs } from 'fs'
import { isAbsolute, join, relative, sep } from 'path'

import {
  bdlJournalDirectory,
  bdlRevisionFile,
  createBdlJournalReader,
  Fixture,
  parseFixture,
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

async function readJournal(
  root: string,
  folder: string,
  selector: string,
  inspect: ReturnType<typeof createBdlJournalReader>
): Promise<Fixture | undefined> {
  let journal: string
  try {
    journal = await confined(root, folder)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return
    throw err
  }
  // A missing numbered file can shorten the verified prefix between the
  // scan and the actual body read. Never substitute a flat or named copy.
  for (let attempt = 0; attempt < 3; attempt++) {
    const revision = latestBdlRevision(inspect(journal, selector))
    if (!revision) {
      if (attempt === 0) return // no numbered history has been published
      break
    }
    try {
      const entry = await read(root, bdlRevisionFile(journal, revision))
      if (
        !entry ||
        bdlUrl(entry.request.path, entry.request.params).href !== selector
      )
        throw new Error('[sports-bdl-client] Fixture request mismatch')
      return entry
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
  }
  throw new Error('[sports-bdl-client] Published recording is unavailable')
}

/** Read the recorder layout or the trimmed <league>/<endpoint>__<label>.json fixtures. */
export function createBdlFixtureTransport(now: () => number) {
  requireBdlLocalOnly()
  const dir = process.env.BDL_FIXTURE_DIR
  if (!dir) throw new Error('[sports-bdl-client] BDL_FIXTURE_DIR is required')
  const inspectJournal = createBdlJournalReader()
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
      const entry =
        (await readJournal(
          root,
          bdlJournalDirectory(cache),
          key,
          inspectJournal
        )) ?? (await read(root, cache))
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
