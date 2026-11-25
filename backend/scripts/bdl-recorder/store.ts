import { randomUUID } from 'node:crypto'
import {
  constants,
  closeSync,
  openSync,
  fstatSync,
  ftruncateSync,
  readSync,
  copyFileSync,
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
  function read(endpoint: string, params: BdlParams): BdlAttempt | undefined {
    const filename = location(endpoint, params)
    if (!existsSync(filename)) return
    const attempt: BdlAttempt = JSON.parse(readFileSync(filename, 'utf8'))
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
  function save(attempt: BdlAttempt) {
    const filename = location(attempt.request.path, attempt.request.params)
    const directory = path.dirname(filename)
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    const tmp = safeFile(canonical, [
      path.relative(canonical, filename) + '.' + randomUUID() + '.tmp',
    ])
    try {
      writeFileSync(tmp, JSON.stringify(attempt) + '\n', {
        flag: 'wx',
        mode: 0o600,
      })
      if (existsSync(filename)) {
        // Keep earlier observations (including retries) when a request repeats.
        const archive = safeFile(canonical, [
          path.relative(canonical, directory),
          'history',
          path.basename(filename, '.json') + '-' + randomUUID() + '.json',
        ])
        mkdirSync(path.dirname(archive), { recursive: true, mode: 0o700 })
        copyFileSync(filename, archive, constants.COPYFILE_EXCL)
      }
      renameSync(tmp, filename)
    } finally {
      if (existsSync(tmp)) unlinkSync(tmp)
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
