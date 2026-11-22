import { existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

export const bdlJournalDirectory = (filename: string) =>
  join(dirname(filename), 'history', basename(filename, '.json'))

export const bdlRevisionFile = (journal: string, revision: number) =>
  join(journal, String(revision), 'response.json')

/** Revisions are contiguous. Find the last committed directory without reading
 * the entire archive or relying on file clocks shared by different processes. */
export function latestBdlRevision(journal: string) {
  const has = (n: number) => existsSync(bdlRevisionFile(journal, n))
  let high = 1
  while (has(high)) high *= 2
  let low = Math.floor(high / 2)
  while (high - low > 1) {
    const mid = low + Math.floor((high - low) / 2)
    if (has(mid)) low = mid
    else high = mid
  }
  return low
}
