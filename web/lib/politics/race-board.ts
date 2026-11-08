// The race board: every race of an office in one of five columns by how our
// market rates it (the electoral college model's thresholds), grouped by
// rating, by state, or by the week's biggest moves. Pure, so it's tested and
// runs the same on the server and in the browser.

import { sortBy } from 'lodash'

import { ratingOf } from './ec-model'
import { placeName } from './official-markets'

// President (a unit's electoral votes), a state's popular vote for
// president, Senate, governor, House.
export type BoardOffice = 'P' | 'V' | 'S' | 'G' | 'H'

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

// How the rating view places races: by live rating before the freeze, by
// the frozen rating after it, and by result once the frozen odds can't be
// read (market-probs-history only goes back 72 hours, and no snapshot was
// committed): sorting by live odds then would move every called race to its
// winner's easy column, the shuffle the freeze exists to prevent.
export type BoardMode = 'live' | 'frozen' | 'results'

export type ResultColumn = 'wonD' | 'uncalled' | 'wonR' | 'wonO'

// "Won by others" shows only when an independent or third party wins.
export const RESULT_COLUMNS: { key: ResultColumn; label: string }[] = [
  { key: 'wonD', label: 'Won by Democrats' },
  { key: 'uncalled', label: 'Not yet called' },
  { key: 'wonR', label: 'Won by Republicans' },
  { key: 'wonO', label: 'Won by others' },
]

export const resultColumn = (race: BoardRace): ResultColumn =>
  race.c === 'D'
    ? 'wonD'
    : race.c === 'R'
    ? 'wonR'
    : race.c === 'O'
    ? 'wonO'
    : 'uncalled'

// Before the freeze, live. After it, frozen while every race has its frozen
// odds, or while market-probs-history can still supply the missing ones (a
// failed request the next revalidation retries); by result once it can't.
export function boardMode(opts: {
  frozen: boolean
  missingFrozenOdds: number
  historyGone: boolean
}): BoardMode {
  if (!opts.frozen) return 'live'
  return opts.missingFrozenOdds > 0 && opts.historyGone ? 'results' : 'frozen'
}

const columnKey = (race: BoardRace, mode: BoardMode): string =>
  mode === 'results' ? resultColumn(race) : boardColumn(race, mode === 'frozen')

export const flipped = (race: BoardRace) =>
  !!race.c && !!race.h && race.c !== 'O' && race.c !== race.h

// Called from the market: resolved to a party, or a party at 99% or more.
// The party a resolved race market went to, from the resolution it records.
// A market resolved as a whole names its winning answer in `resolution` and
// leaves every answer's pool (so its price) as it was, so prices can't be
// trusted for the call: a race resolved Democratic at D 80 / R 19 is still
// D. A yes/no market's YES is the party `yesParty` says. Undefined while
// open, and for a cancelled market or one resolved to a mix (MKT).
export function resolvedParty(
  market: {
    isResolved?: boolean
    resolution?: string
    outcomeType: string
    answers?: { id: string; text: string; resolution?: string }[]
  },
  partyOfAnswer: (text: string) => 'D' | 'R' | 'O',
  yesParty: 'D' | 'R' = 'R'
): 'D' | 'R' | 'O' | undefined {
  const { isResolved, resolution } = market
  if (!isResolved || !resolution || resolution === 'CANCEL') return undefined
  if (resolution === 'MKT') return undefined
  if (market.outcomeType === 'BINARY') {
    if (resolution === 'YES') return yesParty
    if (resolution === 'NO') return yesParty === 'D' ? 'R' : 'D'
    return undefined
  }
  const won =
    market.answers?.find((a) => a.resolution === 'YES') ??
    market.answers?.find((a) => a.id === resolution)
  return won ? partyOfAnswer(won.text) : undefined
}

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

const byPlace = [(r: BoardRace) => placeName(r.st), (r: BoardRace) => r.d ?? -1]

// Within a rating column the closest races come first; by state, alphabetical
// with districts in order; by moves, the 20 biggest weekly changes. By
// result: flips first in each winner's column, then by state; the closest
// uncalled races first.
export function groupRaces(
  races: BoardRace[],
  by: BoardGroupBy,
  mode: BoardMode
): BoardGroup[] {
  const frozen = mode === 'frozen'
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
  if (mode === 'results')
    return RESULT_COLUMNS.map((col) => {
      const rs = races.filter((r) => resultColumn(r) === col.key)
      return {
        key: col.key,
        label: col.label,
        races:
          col.key === 'uncalled'
            ? sortBy(rs, (r) => Math.abs(r.p - 0.5), ...byPlace)
            : sortBy(rs, (r) => (flipped(r) ? 0 : 1), ...byPlace),
      }
    }).filter((g) => g.key !== 'wonO' || g.races.length > 0)
  return BOARD_COLUMNS.map((col) => ({
    key: col.key,
    label: col.label,
    races: sortBy(
      races.filter((r) => boardColumn(r, frozen) === col.key),
      (r) => Math.abs((frozen && r.f !== undefined ? r.f : r.p) - 0.5),
      ...byPlace
    ),
  }))
}

// Seats and electoral votes per column (rating or result), for the header.
export function columnTotals(races: BoardRace[], mode: BoardMode) {
  const totals: Record<string, { races: number; ev: number }> = {}
  for (const r of races) {
    const t = (totals[columnKey(r, mode)] ??= { races: 0, ev: 0 })
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
