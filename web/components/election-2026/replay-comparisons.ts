// Other markets' odds on the headline questions at the replay's milestones,
// shown beside Manifold's in the milestone table. Each row cites where and
// when it was read. Add only prices we have the right to show.

export type ReplayChamber = 'senate' | 'house'

export type ReplayComparison = {
  source: string
  url: string
  chamber: ReplayChamber
  // A milestone id from REPLAY_MILESTONES.
  milestoneId: string
  // The chance Republicans win the chamber, 0 to 1.
  republicanProb: number
  // When the price was read, as an ISO time.
  retrievedAt: string
}

export const REPLAY_COMPARISONS: ReplayComparison[] = []

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
