// Which seat-bar groups are selected, kept in bar order. Clicking a segment
// toggles it and dragging paints a contiguous range. The explorer lists and
// outlines the union of the selected groups: races by market tier, and the
// Senate seats not on the ballot. `order` is always the groups shown on the
// current bar, left to right (zero-seat groups are not drawn, so they are
// not in it).

import { BarGroup, leadingParty, Race, TIERS } from './election-map-model'
import type { HeldSeat } from './election-incumbents'

export type GroupSelection = readonly BarGroup[]

const position = (order: readonly BarGroup[], group: BarGroup) => {
  const i = order.indexOf(group)
  return i === -1 ? Infinity : i
}

// Deduplicated, in bar order; groups missing from the bar go last.
export function sortGroups(
  groups: Iterable<BarGroup>,
  order: readonly BarGroup[]
) {
  return Array.from(new Set(groups)).sort(
    (a, b) => position(order, a) - position(order, b)
  )
}

export function toggleGroup(
  selection: GroupSelection,
  group: BarGroup,
  order: readonly BarGroup[]
): BarGroup[] {
  return selection.includes(group)
    ? selection.filter((g) => g !== group)
    : sortGroups([...selection, group], order)
}

// Every group between two segments on the bar, inclusive, in either direction.
export function groupRange(
  order: readonly BarGroup[],
  from: BarGroup,
  to: BarGroup
): BarGroup[] {
  const a = order.indexOf(from)
  const b = order.indexOf(to)
  if (a === -1 || b === -1) return []
  return order.slice(Math.min(a, b), Math.max(a, b) + 1)
}

// A drag from `anchor` to `current`: pressing an unselected segment adds the
// range it sweeps over, pressing a selected one removes it. The range is
// applied to the selection as it was when the drag began, so sweeping back
// restores whatever the pointer has left.
export function dragSelection(
  base: GroupSelection,
  order: readonly BarGroup[],
  anchor: BarGroup,
  current: BarGroup
): BarGroup[] {
  const range = groupRange(order, anchor, current)
  if (!range.length) return [...base]
  return base.includes(anchor)
    ? base.filter((g) => !range.includes(g))
    : sortGroups([...base, ...range], order)
}

// Races in the selected groups (all races when nothing is selected).
export const inSelection = (selection: GroupSelection, group: BarGroup) =>
  !selection.length || selection.includes(group)

// Held seats only show when their group is selected; they are not races,
// so an empty selection (or a search alone) never lists them.
export const heldInSelection = (selection: GroupSelection, seat: HeldSeat) =>
  selection.includes(seat.side === 'dem' ? 'held-dem' : 'held-rep')

// Short names for the summary line; the bar's tooltips keep the full labels.
const SHORT: Partial<Record<BarGroup, string>> = {
  'held-dem': 'Held D',
  'held-rep': 'Held R',
  'fixed-d': 'Only D on ballot',
  'fixed-r': 'Only R on ballot',
  unknown: 'Unclassified',
  'not-d': 'Not D',
  'not-r': 'Not R',
  unpriced: 'No odds yet',
}
export const groupName = (group: BarGroup) =>
  SHORT[group] ?? TIERS.find((t) => t.id === group)?.label ?? group

// "Safe D + Likely D", "Held D + Toss-up"; a run of four or more adjacent
// segments reads "Likely D to Likely R".
export function describeGroups(
  selection: GroupSelection,
  order: readonly BarGroup[]
): string {
  const groups = sortGroups(selection, order)
  const runs: BarGroup[][] = []
  for (const group of groups) {
    const run = runs[runs.length - 1]
    const previous = run?.[run.length - 1]
    if (
      run &&
      previous &&
      order.includes(group) &&
      order.indexOf(group) === order.indexOf(previous) + 1
    )
      run.push(group)
    else runs.push([group])
  }
  return runs
    .map((run) =>
      run.length >= 4
        ? `${groupName(run[0])} to ${groupName(run[run.length - 1])}`
        : run.map(groupName).join(' + ')
    )
    .join(' + ')
}

// Whose seat each listed race currently is, as the map colors it.
export type Leader = 'dem' | 'rep' | 'other' | 'even' | 'unpriced'
export function raceLeader(race: Pick<Race, 'odds'>): Leader {
  if (!race.odds) return 'unpriced'
  const party = leadingParty(race.odds)
  return !party ? 'even' : party === 'dem' || party === 'rep' ? party : 'other'
}

// Listed races by leader, plus held seats by the caucus that holds them.
export function countLeaders(
  races: Pick<Race, 'odds'>[],
  held: Pick<HeldSeat, 'side'>[] = []
) {
  const counts: Record<Leader, number> = {
    dem: 0,
    rep: 0,
    other: 0,
    even: 0,
    unpriced: 0,
  }
  for (const race of races) counts[raceLeader(race)]++
  for (const seat of held) counts[seat.side]++
  return counts
}

// "D 20 · R 22 · 1 even", only when the seats do not all share one leader.
export function leaderSplit(
  counts: Record<Leader, number>
): { leader: Leader; text: string }[] {
  const parts = [
    { leader: 'dem' as const, text: `D ${counts.dem}` },
    { leader: 'rep' as const, text: `R ${counts.rep}` },
    { leader: 'other' as const, text: `${counts.other} other` },
    { leader: 'even' as const, text: `${counts.even} even` },
    { leader: 'unpriced' as const, text: `${counts.unpriced} no odds` },
  ].filter((p) => counts[p.leader] > 0)
  return parts.length > 1 ? parts : []
}
