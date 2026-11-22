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
  bdlJournalDirectory,
  bdlJournalState,
  bdlLatestCache,
  bdlRevisionFile,
  latestBdlRevision,
} from 'shared/balldontlie-recording'

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

  // A rename to an existing *nonempty* directory cannot replace its contents.
  // The first writer to claim a revision publishes a complete envelope. A
  // loser can finish immediately at the next slot, even if the winner exits.
  function publish(journal: string, bytes: Buffer, importLegacy = false) {
    let compared = 0
    const pending = checked(path.join(journal, '.pending-' + randomUUID()))
    mkdirSync(pending, { mode: 0o700 })
    const file = path.join(pending, 'response.json')
    try {
      writeFileSync(file, bytes, { mode: 0o600, flag: 'wx' })
      for (;;) {
        const latest = latestBdlRevision(journal, true)
        // Two new writers may both have read the same legacy cache. Compare
        // any revisions that won the race before claiming a slot for it.
        if (importLegacy) {
          while (compared < latest) {
            const old = checked(bdlRevisionFile(journal, ++compared))
            if (readFileSync(old).equals(bytes)) return
          }
        }
        const revision = latest + 1
        const target = checked(bdlRevisionFile(journal, revision))
        try {
          renameSync(pending, path.dirname(target))
          return
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code
          if (
            !['EEXIST', 'ENOTEMPTY', 'EPERM', 'EACCES'].includes(code ?? '') ||
            !existsSync(target)
          )
            throw error
        }
      }
    } finally {
      if (existsSync(file)) unlinkSync(file)
      if (existsSync(pending)) rmdirSync(pending)
    }
  }

  // Only legacy writers replace filename. Once imported, those same bytes need
  // no further history scan in this process. Reopening a store verifies history.
  const imported = new Map<string, string>()
  function importLegacy(filename: string, journal: string, endpoint: string) {
    if (!existsSync(filename)) return
    const bytes = readFileSync(filename)
    const digest = createHash('sha256').update(bytes).digest('hex')
    if (imported.get(filename) === digest) return
    parseAttempt(bytes, endpoint, filename)
    publish(journal, bytes, true)
    imported.set(filename, digest)
  }

  function refresh(filename: string, journal: string) {
    const mirror = checked(bdlLatestCache(filename))
    for (;;) {
      const revision = latestBdlRevision(journal)
      if (!revision)
        return existsSync(filename) ? readFileSync(filename) : undefined
      const data = readFileSync(checked(bdlRevisionFile(journal, revision)))
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
      // A delayed cache writer must not leave an older revision as latest.
      if (latestBdlRevision(journal) === revision) return data
    }
  }

  function parseAttempt(bytes: Buffer, endpoint: string, filename: string) {
    const attempt: BdlAttempt = JSON.parse(bytes.toString('utf8'))
    if (
      !Number.isInteger(attempt?.status) ||
      !attempt.request ||
      attempt.request.path !== endpoint ||
      location(endpoint, attempt.request.params) !== filename ||
      !Object.prototype.hasOwnProperty.call(attempt, 'body')
    )
      throw new Error('Invalid recording at ' + filename)
    return attempt
  }
  function read(endpoint: string, params: BdlParams): BdlAttempt | undefined {
    const filename = location(endpoint, params)
    const journal = checked(bdlJournalDirectory(filename))
    if (existsSync(filename)) {
      const state = bdlJournalState(journal)
      if (state.latest && !state.hasGap)
        importLegacy(filename, journal, endpoint)
    }
    const data = refresh(filename, journal)
    return data && parseAttempt(data, endpoint, filename)
  }
  function save(attempt: BdlAttempt) {
    const filename = location(attempt.request.path, attempt.request.params)
    const journal = checked(bdlJournalDirectory(filename))
    mkdirSync(journal, { recursive: true, mode: 0o700 })
    importLegacy(filename, journal, attempt.request.path)
    publish(journal, Buffer.from(JSON.stringify(attempt) + '\n'))
    try {
      refresh(filename, journal)
      return { cacheRefreshed: true }
    } catch {
      // The revision is already committed. Report the derived failure without
      // losing the successful publication or dispatching the request again.
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
  return { read, save, watch, lastWatchDigest }
}
