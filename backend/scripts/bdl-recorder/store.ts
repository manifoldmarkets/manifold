import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  openSync,
  fstatSync,
  ftruncateSync,
  readSync,
  rmdirSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs'
import * as path from 'node:path'

import {
  BdlAttempt,
  BdlParams,
  bdlRecordingPathParts,
} from 'shared/balldontlie-client'
import {
  bdlFileVersion,
  bdlJournalDirectory,
  createBdlJournalReader,
  bdlLatestCache,
  bdlRevisionFile,
  latestBdlRevision,
  parseFixture,
} from 'shared/balldontlie-recording'
import { bdlUrl } from 'shared/balldontlie-request'

export class RecordingCacheRefreshError extends Error {}

function assertOutsideGit(directory: string) {
  let current = directory
  for (;;) {
    if (
      path.basename(current).toLowerCase() === '.git' ||
      existsSync(path.join(current, '.git')) ||
      (existsSync(path.join(current, 'HEAD')) &&
        existsSync(path.join(current, 'objects')) &&
        existsSync(path.join(current, 'refs')))
    ) {
      throw new Error('Recordings must be outside Git working trees.')
    }
    const parent = path.dirname(current)
    if (parent === current) return
    current = parent
  }
}

// Resolve the closest existing parent before creating even the first directory.
// This catches a new output path reached through a junction into a checkout.
export function recordingRoot(input: string) {
  const absolute = path.resolve(input)
  assertOutsideGit(absolute)
  let ancestor = absolute
  while (!existsSync(ancestor)) ancestor = path.dirname(ancestor)
  const canonical = path.join(
    realpathSync(ancestor),
    path.relative(ancestor, absolute)
  )
  assertOutsideGit(canonical)
  mkdirSync(canonical, { recursive: true, mode: 0o700 })
  return canonical
}

function safeFile(root: string, parts: string[]) {
  const target = path.resolve(root, ...parts)
  const relative = path.relative(root, target)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error('Invalid recording path.')
  // Refuse redirection by an existing symlink, junction or hard-linked file
  // within the output directory, including the final JSONL append target.
  let current = root
  for (const part of relative.split(path.sep)) {
    current = path.join(current, part)
    const stat = lstatSync(current, { throwIfNoEntry: false })
    if (stat?.isSymbolicLink() || (stat?.isFile() && stat.nlink > 1))
      throw new Error(
        'Recording paths must use ordinary directories and files.'
      )
  }
  assertOutsideGit(path.dirname(target))
  return target
}

export function createRecordingStore(root: string) {
  const canonical = recordingRoot(root)
  function location(endpoint: string, params: BdlParams) {
    const { league, endpointSlug, parameterHash } = bdlRecordingPathParts(
      endpoint,
      params
    )
    return safeFile(canonical, [league, endpointSlug, parameterHash + '.json'])
  }
  function checked(filename: string) {
    return safeFile(canonical, [path.relative(canonical, filename)])
  }

  const validatedLegacy = new Map<string, string>()
  const inspect = createBdlJournalReader()
  const revisionAt = (journal: string, selector: string, forAppend = false) =>
    latestBdlRevision(inspect(journal, selector), forAppend)

  // Rename into a specific revision. A collision means a different publisher
  // committed first. No shared lease or abandoned lock needs to be recovered.
  function publishAt(
    journal: string,
    selector: string,
    revision: number,
    bytes: Buffer
  ) {
    const target = checked(bdlRevisionFile(journal, revision))
    const pending = checked(path.join(journal, '.pending-' + randomUUID()))
    mkdirSync(pending, { mode: 0o700 })
    const file = path.join(pending, 'response.json')
    try {
      writeFileSync(file, bytes, { mode: 0o600, flag: 'wx' })
      // The staging write can overlap another publisher or a newly detected
      // gap. Only rename if this is still the verified prefix's successor.
      if (revisionAt(journal, selector, true) + 1 !== revision) return false
      try {
        renameSync(pending, path.dirname(target))
        return true
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (
          ['EEXIST', 'ENOTEMPTY', 'EPERM', 'EACCES'].includes(code ?? '') &&
          existsSync(target)
        )
          return false
        throw error
      }
    } finally {
      if (existsSync(file)) unlinkSync(file)
      if (existsSync(pending)) rmdirSync(pending)
    }
  }

  function parseAttempt(bytes: Buffer, selector: string) {
    const result = parseFixture(bytes.toString('utf8'), false)
    if (
      !result ||
      bdlUrl(result.request.path, result.request.params).href !== selector
    )
      throw new Error('Recording request mismatch.')
    return result
  }

  function importLegacy(filename: string, journal: string, selector: string) {
    if (!existsSync(filename)) return
    for (;;) {
      // Sample the mutable legacy file *after* the immutable prefix. If a
      // competing importer wins this slot, never retry the old sample in a
      // later revision. Read the current flat file against the new prefix.
      const state = inspect(journal, selector)
      const latest = latestBdlRevision(state, true)
      const bytes = readFileSync(filename)
      const digest = createHash('sha256').update(bytes).digest('hex')
      if (state.digests.has(digest)) return
      parseAttempt(bytes, selector)
      if (publishAt(journal, selector, latest + 1, bytes)) return
    }
  }

  function refresh(filename: string, journal: string, selector: string) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const revision = revisionAt(journal, selector)
      if (!revision) {
        if (attempt > 0) break
        return existsSync(filename) ? readFileSync(filename) : undefined
      }
      let data: Buffer
      try {
        data = readFileSync(checked(bdlRevisionFile(journal, revision)))
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue
        throw err
      }
      try {
        const mirror = checked(bdlLatestCache(filename))
        const cached = existsSync(mirror) ? readFileSync(mirror) : undefined
        if (!cached?.equals(data)) {
          const tmp = checked(mirror + '.' + randomUUID() + '.tmp')
          try {
            writeFileSync(tmp, data, { mode: 0o600, flag: 'wx' })
            renameSync(tmp, mirror)
          } finally {
            if (existsSync(tmp)) unlinkSync(tmp)
          }
        }
      } catch {
        throw new RecordingCacheRefreshError(
          'The recording cache could not be refreshed.'
        )
      }
      if (revisionAt(journal, selector) === revision) return data
    }
    throw new RecordingCacheRefreshError(
      'The recording changed while refreshing its cache.'
    )
  }

  function assertAppendable(endpoint: string, params: BdlParams) {
    const filename = location(endpoint, params)
    const selector = bdlUrl(endpoint, params).href
    revisionAt(checked(bdlJournalDirectory(filename)), selector, true)
    const stat = lstatSync(filename, { bigint: true, throwIfNoEntry: false })
    if (!stat) return
    const key = filename + '\n' + selector
    const version = bdlFileVersion(stat)
    if (validatedLegacy.get(key) === version) return
    parseAttempt(readFileSync(filename), selector)
    validatedLegacy.set(key, version)
    if (validatedLegacy.size > 32)
      validatedLegacy.delete(validatedLegacy.keys().next().value!)
  }

  function read(endpoint: string, params: BdlParams) {
    const filename = location(endpoint, params)
    const journal = checked(bdlJournalDirectory(filename))
    const selector = bdlUrl(endpoint, params).href
    if (existsSync(filename)) {
      const state = inspect(journal, selector)
      if (state.latest && !state.hasGap)
        importLegacy(filename, journal, selector)
    }
    const data = refresh(filename, journal, selector)
    return data && parseAttempt(data, selector)
  }

  function save(attempt: BdlAttempt) {
    const filename = location(attempt.request.path, attempt.request.params)
    const journal = checked(bdlJournalDirectory(filename))
    const selector = bdlUrl(attempt.request.path, attempt.request.params).href
    const bytes = Buffer.from(JSON.stringify(attempt) + '\n')
    parseAttempt(bytes, selector)
    mkdirSync(journal, { recursive: true, mode: 0o700 })
    importLegacy(filename, journal, selector)
    for (;;) {
      const next = revisionAt(journal, selector, true) + 1
      if (publishAt(journal, selector, next, bytes)) break
    }
    try {
      refresh(filename, journal, selector)
      return { cacheRefreshed: true }
    } catch {
      // The immutable rename already committed. Failures while reading that
      // revision or updating the derived latest file are reported separately.
      return { cacheRefreshed: false }
    }
  }
  function watchPath(league: string, id: string) {
    if (
      !/^[a-z0-9]+(?:\/[a-z0-9]+)*$/.test(league) ||
      !/^[a-z0-9_-]+$/i.test(id)
    )
      throw new Error('Invalid watch identifier.')
    const filename = safeFile(canonical, [
      'watch',
      league.replace(/\//g, '-') + '-' + id + '.jsonl',
    ])
    return filename
  }
  function lastWatchDigest(league: string, id: string): string | undefined {
    const filename = watchPath(league, id)
    if (!existsSync(filename)) return
    // Read backwards to the last complete JSON line. A killed process may
    // leave a partial UTF-8 tail; keep its bytes before repairing the log.
    const fd = openSync(filename, 'r+')
    try {
      const size = fstatSync(fd).size
      let offset = size
      let tail = Buffer.alloc(0)
      let end = -1
      let start = -1
      while (offset > 0) {
        const length = Math.min(offset, 8192)
        offset -= length
        const block = Buffer.alloc(length)
        if (readSync(fd, block, 0, length, offset) !== length)
          throw new Error('Watch log changed while reading.')
        tail = Buffer.concat([block, tail])
        end = tail.lastIndexOf(10)
        start = end > 0 ? tail.lastIndexOf(10, end - 1) : -1
        if (start >= 0 || (end >= 0 && offset === 0)) break
      }
      if (offset + end + 1 < size) {
        const fragment = filename + '.' + randomUUID() + '.partial'
        writeFileSync(fragment, tail.subarray(end + 1), {
          flag: 'wx',
          mode: 0o600,
        })
        ftruncateSync(fd, offset + end + 1)
      }
      if (end < 0) return
      return JSON.parse(tail.subarray(start + 1, end).toString('utf8')).digest
    } finally {
      closeSync(fd)
    }
  }
  function watch(league: string, id: string, change: unknown) {
    const filename = watchPath(league, id)
    mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 })
    appendFileSync(filename, JSON.stringify(change) + '\n', { mode: 0o600 })
  }
  return { read, save, watch, lastWatchDigest, assertAppendable }
}
