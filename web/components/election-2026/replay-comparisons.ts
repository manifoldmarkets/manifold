import data from 'web/public/data/election-2026-comparisons.json'

// Other markets' odds on the headline questions at the replay's milestones,
// shown beside Manifold's in the milestone table. Each row cites where and
// when its price was set. Kalshi's rows come from
// web/scripts/election-2026-replay-comparisons.ts.

export type ReplayChamber = 'senate' | 'house'

export type ReplayComparison = {
  source: string
  url: string
  chamber: ReplayChamber
  // A milestone id from REPLAY_MILESTONES.
  milestoneId: string
  // The chance Republicans win the chamber, 0 to 1.
  republicanProb: number
  // When that price was set and when it was read, as ISO times.
  quotedAt: string
  retrievedAt: string
}

export type ReplayComparisonsFile = { rows: ReplayComparison[] }

// How each source's price at a milestone is read, for the table's notes.
export const COMPARISON_METHODS: { [source: string]: string } = {
  Kalshi:
    'Kalshi: the midpoint of the best bid and ask for the Republican contract at the end of the minute before each milestone.',
  Polymarket:
    'Polymarket: the last price of the Republican outcome at or before each milestone.',
}

export const REPLAY_COMPARISONS = (data as ReplayComparisonsFile).rows

export function comparisonsAt(
  comparisons: ReplayComparison[],
  chamber: ReplayChamber,
  milestoneId: string
) {
  return comparisons.filter(
    (c) =>
      c.chamber === chamber &&
      c.milestoneId === milestoneId &&
      Number.isFinite(c.republicanProb)
  )
}
