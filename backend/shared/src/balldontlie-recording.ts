import { createHash } from 'node:crypto'
import {
  BigIntStats,
  Dirent,
  lstatSync,
  readdirSync,
  readFileSync,
} from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { BdlParams, bdlUrl } from './balldontlie-request'

export const bdlJournalDirectory = (filename: string) =>
  join(dirname(filename), 'history', basename(filename, '.json'))

export const bdlRevisionFile = (journal: string, revision: number) =>
  join(journal, String(revision), 'response.json')

// Keep this mirror out of the legacy recorder's writable *.json namespace.
export const bdlLatestCache = (filename: string) =>
  join(dirname(filename), basename(filename, '.json') + '.latest')

export type Fixture = {
  request: { path: string; params: BdlParams; at?: string }
  recordedAt?: string
  status: number
  body: unknown
  rateLimit?: { limit?: number | null; remaining?: number | null } | null
}

export function parseFixture(
  text: string,
  namedSample: boolean
): Fixture | undefined {
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
  const quota = value.rateLimit
  if (
    quota != null &&
    (typeof quota !== 'object' ||
      Array.isArray(quota) ||
      [quota.limit, quota.remaining].some(
        (n) => n != null && (!Number.isFinite(n) || n < 0)
      ))
  )
    throw new Error('[sports-bdl-client] Invalid BDL fixture quota')
  return value
}

type JournalState = {
  latest: number
  hasGap: boolean
  digests: Set<string>
}

type ValidatedRevision = { stamp: string; digest: string }

export const bdlFileVersion = (stat: BigIntStats) =>
  [stat.dev, stat.ino, stat.size, stat.mtimeNs, stat.ctimeNs].join(':')

/** Verify the contiguous prefix for this request, including every envelope.
 * Keep only metadata of recent selectors so rereading large unchanged bodies
 * does not dominate each append. An edited or replaced slot is checked again. */
export function createBdlJournalReader() {
  const recent = new Map<string, Map<number, ValidatedRevision>>()
  return function inspect(journal: string, selector: string): JournalState {
    const state = { latest: 0, hasGap: false, digests: new Set<string>() }
    let entries: Dirent[]
    try {
      entries = readdirSync(journal, { withFileTypes: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return state
      throw error
    }
    const key = journal + '\n' + selector
    const cached = recent.get(key) ?? new Map<number, ValidatedRevision>()
    recent.delete(key)
    recent.set(key, cached)
    if (recent.size > 32) recent.delete(recent.keys().next().value!)
    const numbered = entries.filter((e) => /^[1-9]\d*$/.test(e.name))
    const directories = new Set(
      numbered.filter((e) => e.isDirectory()).map((e) => e.name)
    )
    for (let revision = 1; directories.has(String(revision)); revision++) {
      const file = bdlRevisionFile(journal, revision)
      const stat = lstatSync(file, { bigint: true, throwIfNoEntry: false })
      if (!stat?.isFile() || stat.nlink !== BigInt(1)) break
      const stamp = bdlFileVersion(stat)
      let verified = cached.get(revision)
      if (verified?.stamp !== stamp) {
        let bytes: Buffer
        try {
          bytes = readFileSync(file)
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') break
          throw err
        }
        try {
          const result = parseFixture(bytes.toString('utf8'), false)
          if (
            !result ||
            bdlUrl(result.request.path, result.request.params).href !== selector
          )
            break
        } catch {
          break
        }
        verified = {
          stamp,
          digest: createHash('sha256').update(bytes).digest('hex'),
        }
        cached.set(revision, verified)
      }
      state.latest = revision
      state.digests.add(verified.digest)
    }
    state.hasGap = numbered.length !== state.latest
    return state
  }
}

export function latestBdlRevision(
  { latest, hasGap }: JournalState,
  forAppend = false
) {
  if (hasGap && (forAppend || latest === 0))
    throw new Error(
      'Recording journal contains a missing or incomplete revision.'
    )
  return latest
}
