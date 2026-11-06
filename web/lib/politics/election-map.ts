// The /election map: what colors each state (or House district, or
// territory) in each view, and what a state's panel lists. Pure, so it's
// tested and runs the same on the server and in the browser.

import { sortBy } from 'lodash'

import { ELECTORAL_UNITS } from './ec-model'
import { placeIn, placeName, TERRITORIES } from './official-markets'
import { PrimaryCell, PrimaryRow } from './primaries'
import { BoardRace } from './race-board'

export type MapMode = 'president' | 'senate' | 'governor' | 'house' | 'primary'
export type PresidentView = 'ev' | 'popular'
export type PrimaryOffice = 'P' | 'S' | 'G'
export type Party = 'D' | 'R'

export type MapView = {
  mode: MapMode
  president: PresidentView
  office: PrimaryOffice
  party: Party
}

// Leaders of the presidential primaries: three hues that stay apart for
// every pair, in both color schemes (dataviz validator, all pairs; slots
// orange, aqua, violet of the reference palette, skipping party blue and
// red). Every other leader is gray, and the legend and labels name them.
export const LEADER_COLORS = ['#eb6834', '#1baf7a', '#6250d6']
export const OTHER_LEADER_COLOR = '#8a8a8a'

// One place's color on the map, and the words for it.
export type Fill =
  // The Democrat's two-party chance; `c` once the race is called.
  | { kind: 'rating'; p: number; c?: 'D' | 'R' | 'O' }
  // A presidential primary: its leader (or winner) and their color.
  | { kind: 'leader'; name: string; p?: number; won?: boolean; color: string }
  // A party's Senate or governor primary: its leader, shaded by how sure.
  | { kind: 'strength'; party: Party; name?: string; p?: number; won?: boolean }
  // A top-two or top-four primary: one market for every party.
  | { kind: 'open'; name?: string; p?: number; won?: boolean }

// A House district's or electoral district's key: 'CA-12', 'NE-2'; 0 is
// at-large.
export const districtKey = (st: string, d: number) => `${st}-${d}`

const cellFill = (
  cell: PrimaryCell,
  office: PrimaryOffice,
  party: Party | undefined,
  colors: Record<string, string>
): Fill => {
  const base = { name: cell.l, p: cell.p, won: cell.won === 1 }
  if (!party) return { kind: 'open', ...base }
  if (office === 'P')
    return {
      kind: 'leader',
      ...base,
      name: cell.l ?? 'No leader yet',
      color: (cell.l && colors[cell.l]) ?? OTHER_LEADER_COLOR,
    }
  return { kind: 'strength', party, ...base }
}

// The presidential primary leaders who lead the most contests of a party
// get the three colors, most first (ties by name); the rest are gray.
export function leaderColors(
  primaries: PrimaryRow[],
  party: Party
): Record<string, string> {
  const counts = new Map<string, number>()
  for (const row of primaries) {
    const name = row.o === 'P' ? row[party]?.l : undefined
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  const top = sortBy(
    [...counts],
    ([, n]) => -n,
    ([name]) => name
  ).slice(0, LEADER_COLORS.length)
  return Object.fromEntries(top.map(([name], i) => [name, LEADER_COLORS[i]]))
}

// Every place's fill in a view: states (and DC) by postal code, electoral
// and House districts by districtKey, territories and Democrats Abroad by
// their codes. A place with no race in the view is left out.
export function mapFills(
  view: MapView,
  races: BoardRace[],
  primaries: PrimaryRow[]
): Record<string, Fill> {
  const out: Record<string, Fill> = {}
  const rating = (r: BoardRace): Fill => ({
    kind: 'rating',
    p: r.p,
    ...(r.c ? { c: r.c } : {}),
  })
  if (view.mode === 'primary') {
    const colors =
      view.office === 'P' ? leaderColors(primaries, view.party) : {}
    for (const row of primaries) {
      if (row.o !== view.office) continue
      const own = row[view.party]
      // A party's own contest first; else the market every party shares.
      const fill = own
        ? cellFill(own, view.office, view.party, colors)
        : row.A
        ? cellFill(row.A, view.office, undefined, colors)
        : undefined
      // A state's regular contest wins over a special one.
      if (fill && (!out[row.st] || !row.sp)) out[row.st] = fill
    }
    return out
  }
  const office =
    view.mode === 'president'
      ? view.president === 'ev'
        ? 'P'
        : 'V'
      : view.mode === 'senate'
      ? 'S'
      : view.mode === 'governor'
      ? 'G'
      : 'H'
  for (const r of races) {
    if (r.o !== office) continue
    const key = r.d === undefined ? r.st : districtKey(r.st, r.d)
    if (!out[key] || !r.sp) out[key] = rating(r)
  }
  return out
}

// Which views have anything to show.
export function availableModes(
  races: BoardRace[],
  primaries: PrimaryRow[]
): MapMode[] {
  const has = (o: BoardRace['o']) => races.some((r) => r.o === o)
  const modes: MapMode[] = []
  if (has('P') || has('V')) modes.push('president')
  if (has('S')) modes.push('senate')
  if (has('G')) modes.push('governor')
  if (has('H')) modes.push('house')
  if (primaries.length > 0) modes.push('primary')
  return modes
}

// ---------------------------------------------------------------------------
// A state's panel
// ---------------------------------------------------------------------------

// What a row says before it's opened: party odds, a leader, or the question.
export type Summary =
  | { kind: 'party'; p: number; c?: 'D' | 'R' | 'O' }
  | { kind: 'leader'; name?: string; p?: number; won?: boolean }
  | { kind: 'question' }

export type PanelRow = {
  key: string
  label: string
  slug: string
  creator?: string
  summary: Summary
}

export type PanelSection = {
  key: 'president' | 'senate' | 'governor' | 'house' | 'primaries' | 'more'
  title: string
  rows: PanelRow[]
}

// A market on the page that isn't a board race or a primary (the off-year
// races): placed by the one place its question names.
export type PlacedMarket = {
  question: string
  slug: string
  creatorUsername: string
}

const ORDINAL = (n: number) =>
  `${n}${
    n % 100 >= 11 && n % 100 <= 13
      ? 'th'
      : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
  }`

const EV_BY_KEY = Object.fromEntries(ELECTORAL_UNITS.map((u) => [u.key, u.ev]))

const raceRow = (r: BoardRace, key: string, label: string): PanelRow[] =>
  r.s
    ? [
        {
          key,
          label,
          slug: r.s,
          ...(r.u ? { creator: r.u } : {}),
          summary: { kind: 'party', p: r.p, ...(r.c ? { c: r.c } : {}) },
        },
      ]
    : []

const PARTY_NAME = { D: 'Democratic', R: 'Republican' } as const
const OFFICE_NAME = { P: 'presidential', S: 'Senate', G: 'governor' } as const

function primaryRows(row: PrimaryRow): PanelRow[] {
  const when = [row.y, row.sp ? 'special' : undefined].filter(Boolean)
  const suffix = when.length ? ` (${when.join(' ')})` : ''
  const cells: [PrimaryCell | undefined, string, string][] = [
    [row.D, 'D', `${PARTY_NAME.D} ${OFFICE_NAME[row.o]} primary`],
    [row.R, 'R', `${PARTY_NAME.R} ${OFFICE_NAME[row.o]} primary`],
    [row.A, 'A', `${OFFICE_NAME[row.o]} primary, all parties`],
  ]
  return cells.flatMap(([cell, k, label]) =>
    cell
      ? [
          {
            key: `${row.k}-${k}`,
            label: label[0].toUpperCase() + label.slice(1) + suffix,
            slug: cell.s,
            ...(cell.u ? { creator: cell.u } : {}),
            summary: {
              kind: 'leader' as const,
              name: cell.l,
              p: cell.p,
              won: cell.won === 1,
            },
          },
        ]
      : []
  )
}

// Everything the page has on one place, by office. Empty sections are left
// out.
export function statePanel(
  st: string,
  races: BoardRace[],
  primaries: PrimaryRow[],
  more: PlacedMarket[] = []
): PanelSection[] {
  const here = races.filter((r) => r.st === st)
  const of = (o: BoardRace['o']) =>
    sortBy(
      here.filter((r) => r.o === o),
      (r) => r.d ?? -1,
      (r) => (r.sp ? 1 : 0)
    )
  const president = [
    ...of('P').flatMap((r) => {
      const unit = r.d === undefined ? st : districtKey(st, r.d)
      const ev = EV_BY_KEY[unit]
      const label =
        r.d === undefined
          ? `Electoral votes${ev ? ` (${ev})` : ''}`
          : `${ORDINAL(r.d)} district${ev ? ` (${ev} EV)` : ''}`
      return raceRow(r, `P-${unit}`, label)
    }),
    ...of('V').flatMap((r) => raceRow(r, `V-${st}`, 'Popular vote')),
  ]
  const senate = of('S').flatMap((r) =>
    raceRow(
      r,
      `S-${st}${r.sp ? '-sp' : ''}`,
      r.sp ? 'Special election' : 'Senate'
    )
  )
  const governor = of('G').flatMap((r) => raceRow(r, `G-${st}`, 'Governor'))
  const house = of('H').flatMap((r) =>
    raceRow(
      r,
      `H-${st}-${r.d ?? 0}`,
      !r.d ? 'At-large' : `${ORDINAL(r.d)} district`
    )
  )
  const order = { P: 0, S: 1, G: 2 }
  const primary = sortBy(
    primaries.filter((p) => p.st === st),
    (p) => p.y ?? 2028,
    (p) => order[p.o],
    (p) => (p.sp ? 1 : 0)
  ).flatMap(primaryRows)
  const others = more
    .filter((m) => placeIn(m.question) === st)
    .map((m) => ({
      key: `M-${m.slug}`,
      label: m.question,
      slug: m.slug,
      creator: m.creatorUsername,
      summary: { kind: 'question' as const },
    }))
  const sections: PanelSection[] = [
    { key: 'president', title: 'President', rows: president },
    { key: 'senate', title: 'Senate', rows: senate },
    { key: 'governor', title: 'Governor', rows: governor },
    { key: 'house', title: 'House', rows: house },
    { key: 'primaries', title: 'Primaries', rows: primary },
    { key: 'more', title: 'Also on the ballot', rows: others },
  ]
  return sections.filter((s) => s.rows.length > 0)
}

// The place's name for the panel: a state, DC, a territory or Democrats
// Abroad.
export const panelTitle = (st: string) =>
  st in TERRITORIES ? TERRITORIES[st] : placeName(st)

// ---------------------------------------------------------------------------
// Reading a fill
// ---------------------------------------------------------------------------

const pct = (p: number) =>
  p >= 0.995 ? '>99%' : p <= 0.005 ? '<1%' : `${Math.round(p * 100)}%`

// "D 64%", "Called for R", "Newsom 41%", "Won: Ossoff".
export function describeFill(fill: Fill): string {
  if (fill.kind === 'rating') {
    if (fill.c) return fill.c === 'O' ? 'Called: other' : `Called for ${fill.c}`
    return fill.p >= 0.5 ? `D ${pct(fill.p)}` : `R ${pct(1 - fill.p)}`
  }
  if (!fill.name) return 'No leader yet'
  if (fill.won) return `Won: ${fill.name}`
  return fill.p === undefined ? fill.name : `${fill.name} ${pct(fill.p)}`
}

// The closest contests in a view, for the panel's starting list: rated races
// nearest 50%, primaries with the least certain leader. Called and won races
// are over, so they're left out.
export function closestPlaces(
  fills: Record<string, Fill>,
  limit = 6
): string[] {
  const open = Object.entries(fills).filter(([, f]) =>
    f.kind === 'rating' ? !f.c : !f.won
  )
  const margin = (f: Fill) =>
    f.kind === 'rating' ? Math.abs(f.p - 0.5) : f.p ?? 1
  return sortBy(
    open,
    ([, f]) => margin(f),
    ([k]) => k
  )
    .slice(0, limit)
    .map(([k]) => k)
}
