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

const changedAt = (c: Contract) =>
  Math.max(
    finiteOr0(c.lastUpdatedTime),
    finiteOr0(c.lastBetTime),
    finiteOr0(c.resolutionTime)
  )

const finiteOr0 = (x: number | undefined) =>
  x !== undefined && Number.isFinite(x) ? x : 0
