import { Dirent, lstatSync, readdirSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

export const bdlJournalDirectory = (filename: string) =>
  join(dirname(filename), 'history', basename(filename, '.json'))

export const bdlRevisionFile = (journal: string, revision: number) =>
  join(journal, String(revision), 'response.json')

// Keep this mirror out of the legacy recorder's writable *.json namespace.
export const bdlLatestCache = (filename: string) =>
  join(dirname(filename), basename(filename, '.json') + '.latest')

/** Read only a contiguous prefix. Never append if that would promote or
 * overwrite an existing out-of-sequence or incomplete revision. */
export function bdlJournalState(journal: string) {
  let entries: Dirent[]
  try {
    entries = readdirSync(journal, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return { latest: 0, hasGap: false }
    throw error
  }
  const numbered = entries.filter((e) => /^[1-9]\d*$/.test(e.name))
  const directories = new Set(
    numbered.filter((e) => e.isDirectory()).map((e) => e.name)
  )
  let latest = 0
  while (directories.has(String(latest + 1))) {
    const file = lstatSync(bdlRevisionFile(journal, latest + 1), {
      throwIfNoEntry: false,
    })
    if (!file?.isFile() || file.nlink !== 1) break
    latest++
  }
  return { latest, hasGap: numbered.length !== latest }
}

export function latestBdlRevision(journal: string, forAppend = false) {
  const { latest, hasGap } = bdlJournalState(journal)
  if (hasGap && (forAppend || latest === 0))
    throw new Error(
      'Recording journal contains a missing or incomplete revision.'
    )
  return latest
}
