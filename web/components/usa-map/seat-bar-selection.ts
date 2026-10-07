// Which seat-bar groups (tiers) are selected, kept in bar order. Clicking a
// segment toggles it, dragging paints a contiguous range, and presets replace
// the selection. The explorer lists and outlines the union of the selected
// groups' races. `order` is always the tiers shown on the current bar, left
// to right (zero-seat groups are not drawn, so they are not in it).

import { leadingParty, Race, Tier, TIERS } from './election-map-model'

export type TierSelection = readonly Tier[]

const position = (order: readonly Tier[], tier: Tier) => {
  const i = order.indexOf(tier)
  return i === -1 ? Infinity : i
}

// Deduplicated, in bar order; tiers missing from the bar go last.
export function sortTiers(tiers: Iterable<Tier>, order: readonly Tier[]) {
  return Array.from(new Set(tiers)).sort(
    (a, b) => position(order, a) - position(order, b)
  )
}

export const sameTiers = (a: TierSelection, b: TierSelection) =>
  a.length === b.length && a.every((t) => b.includes(t))

export function toggleTier(
  selection: TierSelection,
  tier: Tier,
  order: readonly Tier[]
): Tier[] {
  return selection.includes(tier)
    ? selection.filter((t) => t !== tier)
    : sortTiers([...selection, tier], order)
}

// Every tier between two segments on the bar, inclusive, in either direction.
export function tierRange(
  order: readonly Tier[],
  from: Tier,
  to: Tier
): Tier[] {
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
  base: TierSelection,
  order: readonly Tier[],
  anchor: Tier,
  current: Tier
): Tier[] {
  const range = tierRange(order, anchor, current)
  if (!range.length) return [...base]
  return base.includes(anchor)
    ? base.filter((t) => !range.includes(t))
    : sortTiers([...base, ...range], order)
}

export const PRESETS = [
  {
    id: 'competitive',
    label: 'Competitive',
    description: 'Lean D, Toss-up and Lean R',
    tiers: ['lean-d', 'tossup', 'lean-r'],
  },
  {
    id: 'likely-d',
    label: 'Likely+ D',
    description: 'Democrats 75% or more, including seats only they contest',
    tiers: ['fixed-d', 'safe-d', 'likely-d'],
  },
  {
    id: 'likely-r',
    label: 'Likely+ R',
    description: 'Republicans 75% or more, including seats only they contest',
    tiers: ['likely-r', 'safe-r', 'fixed-r'],
  },
] as const satisfies readonly {
  id: string
  label: string
  description: string
  tiers: readonly Tier[]
}[]
export type Preset = (typeof PRESETS)[number]

// The preset's groups that are on this bar, in bar order; empty when none is.
export const presetTiers = (preset: Preset, order: readonly Tier[]) =>
  order.filter((t) => (preset.tiers as readonly Tier[]).includes(t))

export function activePreset(
  selection: TierSelection,
  order: readonly Tier[]
): Preset | undefined {
  if (!selection.length) return undefined
  return PRESETS.find((p) => sameTiers(presetTiers(p, order), selection))
}

// Short names for the summary line; the bar's tooltips keep the full labels.
const SHORT: Partial<Record<Tier, string>> = {
  'fixed-d': 'Only D on ballot',
  'fixed-r': 'Only R on ballot',
  unknown: 'Unclassified',
  'not-d': 'Not D',
  'not-r': 'Not R',
  unpriced: 'No odds yet',
}
export const tierName = (tier: Tier) =>
  SHORT[tier] ?? TIERS.find((t) => t.id === tier)?.label ?? tier

// "Safe D + Likely D", "Lean D + Toss-up + Lean R"; a run of four or more
// adjacent segments reads "Likely D to Likely R".
export function describeTiers(
  selection: TierSelection,
  order: readonly Tier[]
): string {
  const tiers = sortTiers(selection, order)
  const runs: Tier[][] = []
  for (const tier of tiers) {
    const run = runs[runs.length - 1]
    const previous = run?.[run.length - 1]
    if (
      run &&
      previous &&
      order.includes(tier) &&
      order.indexOf(tier) === order.indexOf(previous) + 1
    )
      run.push(tier)
    else runs.push([tier])
  }
  return runs
    .map((run) =>
      run.length >= 4
        ? `${tierName(run[0])} to ${tierName(run[run.length - 1])}`
        : run.map(tierName).join(' + ')
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

export function countLeaders(races: Pick<Race, 'odds'>[]) {
  const counts: Record<Leader, number> = {
    dem: 0,
    rep: 0,
    other: 0,
    even: 0,
    unpriced: 0,
  }
  for (const race of races) counts[raceLeader(race)]++
  return counts
}

// "D 20 · R 22 · 1 even", only when the races do not all share one leader.
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

// Races in the selected groups (all races when nothing is selected).
export const inSelection = (selection: TierSelection, tier: Tier) =>
  !selection.length || selection.includes(tier)
