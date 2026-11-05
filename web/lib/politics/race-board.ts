// The race board: every race of an office in one of five columns by how our
// market rates it (the electoral college model's thresholds), grouped by
// rating, by state, or by the week's biggest moves. Pure, so it's tested and
// runs the same on the server and in the browser.

import { sortBy } from 'lodash'

import { ratingOf } from './ec-model'
import { placeName } from './official-markets'

export type BoardOffice = 'P' | 'S' | 'G' | 'H'

// Wire format, short keys: up to ~600 rows ship in the page props.
export type BoardRace = {
  o: BoardOffice
  st: string // postal code
  d?: number // district (House: 0 = at-large; President: ME/NE districts)
  sp?: 1 // special election
  p: number // Democrat's two-party chance now
  w?: number // its change over the last 7 days (omitted when unknown or 0)
  f?: number // its chance when the columns froze (Election Day morning)
  c?: 'D' | 'R' | 'O' // called: resolved, or a party at 99%+
  h?: 'D' | 'R' // party that held the seat before (where known)
  s?: string // market slug (absent: no market, the row reads a prior)
  u?: string // market creator, when not @ManifoldPolitics
  ev?: number // electoral votes (President)
}

export type BoardColumn = 'solidD' | 'leanD' | 'tossup' | 'leanR' | 'solidR'

export const BOARD_COLUMNS: {
  key: BoardColumn
  label: string
  range: string
}[] = [
  { key: 'solidD', label: 'Democrats, easily', range: 'D 90%+' },
  { key: 'leanD', label: 'Democrats, narrowly', range: 'D 60–90%' },
  { key: 'tossup', label: 'Toss-ups', range: '40–60%' },
  { key: 'leanR', label: 'Republicans, narrowly', range: 'R 60–90%' },
  { key: 'solidR', label: 'Republicans, easily', range: 'R 90%+' },
]

// The EC model's seven ratings folded into five columns, so a race reads the
// same rating on the map and on the board.
export function columnOf(pDem: number): BoardColumn {
  switch (ratingOf(pDem)) {
    case 'safeD':
      return 'solidD'
    case 'likelyD':
    case 'leanD':
      return 'leanD'
    case 'tossup':
      return 'tossup'
    case 'leanR':
    case 'likelyR':
      return 'leanR'
    default:
      return 'solidR'
  }
}

// From the moment the columns freeze, a race stays in the column its
// pre-election price put it in, so results don't shuffle the board.
export const boardColumn = (race: BoardRace, frozen: boolean): BoardColumn =>
  columnOf(frozen && race.f !== undefined ? race.f : race.p)

export const flipped = (race: BoardRace) =>
  !!race.c && !!race.h && race.c !== 'O' && race.c !== race.h

// Called from the market: resolved to a party, or a party at 99% or more.
export function calledFrom(probs: {
  dem: number
  rep: number
  other: number
  resolved?: 'D' | 'R' | 'O'
}): 'D' | 'R' | 'O' | undefined {
  if (probs.resolved) return probs.resolved
  if (probs.dem >= 0.99) return 'D'
  if (probs.rep >= 0.99) return 'R'
  if (probs.other >= 0.99) return 'O'
  return undefined
}

const ORDINAL = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`
}

// "PA-7", "AK-AL", "NE-2", "MN" (+ "special").
export function raceLabel(race: Pick<BoardRace, 'o' | 'st' | 'd'>) {
  if (race.d === undefined) return race.st
  if (race.d === 0) return `${race.st}-AL`
  return `${race.st}-${race.d}`
}

export function raceName(race: Pick<BoardRace, 'o' | 'st' | 'd' | 'sp'>) {
  const state = placeName(race.st)
  const where =
    race.d === undefined
      ? state
      : race.d === 0
      ? `${state} at-large`
      : `${state}'s ${ORDINAL(race.d)} district`
  return race.sp ? `${where} (special)` : where
}

// A stable key per race (office, place, district, special).
export const raceId = (race: Pick<BoardRace, 'o' | 'st' | 'd' | 'sp'>) =>
  `${race.o}-${race.st}${race.d === undefined ? '' : `-${race.d}`}${
    race.sp ? '-sp' : ''
  }`

export const raceUrl = (race: BoardRace) =>
  race.s ? `/${race.u ?? 'ManifoldPolitics'}/${race.s}` : undefined

export type BoardGroupBy = 'rating' | 'state' | 'moves'

export type BoardGroup = { key: string; label: string; races: BoardRace[] }

// Within a rating column the closest races come first; by state, alphabetical
// with districts in order; by moves, the 20 biggest weekly changes.
export function groupRaces(
  races: BoardRace[],
  by: BoardGroupBy,
  frozen: boolean
): BoardGroup[] {
  if (by === 'moves') {
    const moved = sortBy(
      races.filter((r) => r.w !== undefined && Math.abs(r.w) >= 0.01),
      (r) => -Math.abs(r.w ?? 0)
    ).slice(0, 20)
    return [{ key: 'moves', label: 'Biggest moves this week', races: moved }]
  }
  if (by === 'state') {
    const byState = new Map<string, BoardRace[]>()
    for (const r of sortBy(
      races,
      (r) => placeName(r.st),
      (r) => r.d ?? -1
    ))
      byState.set(r.st, [...(byState.get(r.st) ?? []), r])
    return [...byState].map(([st, rs]) => ({
      key: st,
      label: placeName(st),
      races: rs,
    }))
  }
  return BOARD_COLUMNS.map((col) => ({
    key: col.key,
    label: col.label,
    races: sortBy(
      races.filter((r) => boardColumn(r, frozen) === col.key),
      (r) => Math.abs((frozen && r.f !== undefined ? r.f : r.p) - 0.5),
      (r) => placeName(r.st),
      (r) => r.d ?? -1
    ),
  }))
}

// Seats and electoral votes per column, for the header.
export function columnTotals(races: BoardRace[], frozen: boolean) {
  const totals = Object.fromEntries(
    BOARD_COLUMNS.map((c) => [c.key, { races: 0, ev: 0 }])
  ) as Record<BoardColumn, { races: number; ev: number }>
  for (const r of races) {
    const t = totals[boardColumn(r, frozen)]
    t.races++
    t.ev += r.ev ?? 0
  }
  return totals
}

// Calls so far, for the results header: seats (or electoral votes) per
// party among called races.
export function calledTotals(races: BoardRace[], weight: 'races' | 'ev') {
  const t = { D: 0, R: 0, O: 0 }
  for (const r of races) if (r.c) t[r.c] += weight === 'ev' ? r.ev ?? 0 : 1
  return t
}
