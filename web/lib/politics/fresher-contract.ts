import { Contract } from 'common/contract'

// The newer of a market's live copy and the page's own (the election page
// refetches its props every two minutes): the one changed last, the live
// copy on a tie. Every bet and resolution moves lastUpdatedTime (place-bet
// broadcasts lastBetTime and lastUpdatedTime with the new pools), so a tab
// whose socket missed an update, such as a resolution on election night,
// takes it from the next refresh, and an older page copy never rolls back
// what the socket brought.
export function fresherContract<C extends Contract>(
  live: C | undefined,
  page: C
): C {
  if (!live || live.id !== page.id) return page
  return changedAt(page) > changedAt(live) ? page : live
}

// A live update to keep: the incoming copy unless the one held changed
// strictly later. A refetch started before a socket update (a resolution)
// can answer with the older copy after it; this keeps the newer one. Socket
// patches that leave the timestamps alone (answer edits) tie, and are kept.
export const keepNewer = <C extends Contract>(held: C | undefined, next: C) =>
  held && held.id === next.id && changedAt(held) > changedAt(next) ? held : next

// Changes when the page's copy of a market differs from the one before it:
// a later change, or an answer added or relabelled without one (answer
// edits leave the market's timestamps alone). Key a market's live
// subscription on it, and a remount refetches the market, so later socket
// patches build on the newest whole copy instead of an older one.
export const snapshotKey = (c: Contract) =>
  `${c.id}:${changedAt(c)}:${'answers' in c ? answersHash(c.answers) : 0}`

// A short hash of the answers' ids and labels (djb2), so a key stays small.
const answersHash = (answers: { id: string; text: string }[]) => {
  let h = 5381
  for (const a of answers) {
    const s = `${a.id}\u0000${a.text}\u0001`
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  }
  return `${answers.length}.${(h >>> 0).toString(36)}`
}

const changedAt = (c: Contract) =>
  Math.max(
    finiteOr0(c.lastUpdatedTime),
    finiteOr0(c.lastBetTime),
    finiteOr0(c.resolutionTime)
  )

const finiteOr0 = (x: number | undefined) =>
  x !== undefined && Number.isFinite(x) ? x : 0
