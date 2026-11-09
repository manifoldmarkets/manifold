// The /election map: what colors each place (state, House district, Maine's
// and Nebraska's electoral districts, territory) in each view, the tracker
// above it, and what a place's card lists. Pure, so it's tested and runs the
// same on the server and in the browser.

import { sortBy, sumBy } from 'lodash'

import { ELECTORAL_UNITS, EV_TO_WIN, RatingBucket, ratingOf } from './ec-model'
import { placeIn, placeName, TERRITORIES } from './official-markets'
import { PrimaryCell, PrimaryRow } from './primaries'
import { BoardRace } from './race-board'

export type MapMode = 'president' | 'senate' | 'governor' | 'house' | 'primary'
export type PrimaryOffice = 'P' | 'S' | 'G'
export type Party = 'D' | 'R'

export type MapView = {
  mode: MapMode
  // The primaries view: which office's primaries, and whose.
  office: PrimaryOffice
  party: Party
}

// A window event that switches the map's view from elsewhere on the page
// (the primaries section's link to the other contests): detail is a partial
// MapView.
export const MAP_VIEW_EVENT = 'election-map:view'

export const MODE_OFFICE: Record<
  Exclude<MapMode, 'primary'>,
  BoardRace['o']
> = {
  president: 'P',
  senate: 'S',
  governor: 'G',
  house: 'H',
}

// Leaders of the presidential primaries: three hues that stay apart for
// every pair, in both color schemes (dataviz validator, all pairs; slots
// orange, aqua, violet of the reference palette, skipping party blue and
// red). Every other leader is gray, and the legend and labels name them.
export const LEADER_COLORS = ['#eb6834', '#1baf7a', '#6250d6']
export const OTHER_LEADER_COLOR = '#8a8a8a'
// A contest whose market names no leader yet (Other leads).
export const NO_LEADER_COLOR = '#c8c8c8'

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
      color: cell.l ? colors[cell.l] ?? OTHER_LEADER_COLOR : NO_LEADER_COLOR,
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

// The primary a place shows in a view: its party's own contest, else the
// one every party shares (top-two, top-four). A state's regular contest wins
// over a special one.
function primaryCells(view: MapView, primaries: PrimaryRow[]) {
  const out: Record<
    string,
    { row: PrimaryRow; cell: PrimaryCell; key: string }
  > = {}
  for (const row of primaries) {
    if (row.o !== view.office) continue
    const own = row[view.party]
    const cell = own ?? row.A
    if (cell && (!out[row.st] || !row.sp))
      out[row.st] = { row, cell, key: `${row.k}-${own ? view.party : 'A'}` }
  }
  return out
}

// The card row (statePanel's key) for the primary a place is colored by.
export const primaryRowKey = (
  view: MapView,
  primaries: PrimaryRow[],
  st: string
) => primaryCells(view, primaries)[st]?.key

// The race a place shows in a view, by its key: states (and DC) by postal
// code, electoral and House districts by districtKey. A state's regular
// Senate race wins over a special one.
export function viewRaces(
  mode: Exclude<MapMode, 'primary'>,
  races: BoardRace[]
): Record<string, BoardRace> {
  const office = MODE_OFFICE[mode]
  const out: Record<string, BoardRace> = {}
  for (const r of races) {
    if (r.o !== office) continue
    const key = r.d === undefined ? r.st : districtKey(r.st, r.d)
    if (!out[key] || !r.sp) out[key] = r
  }
  return out
}

// Every place's fill in a view. A place with no race in the view is left
// out.
export function mapFills(
  view: MapView,
  races: BoardRace[],
  primaries: PrimaryRow[]
): Record<string, Fill> {
  if (view.mode === 'primary') {
    const colors =
      view.office === 'P' ? leaderColors(primaries, view.party) : {}
    return Object.fromEntries(
      Object.entries(primaryCells(view, primaries)).map(([st, { row, cell }]) => [
        st,
        cellFill(cell, view.office, row[view.party] ? view.party : undefined, colors),
      ])
    )
  }
  return Object.fromEntries(
    Object.entries(viewRaces(view.mode, races)).map(([key, r]) => [
      key,
      { kind: 'rating', p: r.p, ...(r.c ? { c: r.c } : {}) } as Fill,
    ])
  )
}

// Which views have anything to show.
export function availableModes(
  races: BoardRace[],
  primaries: PrimaryRow[]
): MapMode[] {
  const has = (o: BoardRace['o']) => races.some((r) => r.o === o)
  const modes: MapMode[] = []
  if (has('P')) modes.push('president')
  if (has('S')) modes.push('senate')
  if (has('G')) modes.push('governor')
  if (has('H')) modes.push('house')
  if (primaries.length > 0) modes.push('primary')
  return modes
}

// ---------------------------------------------------------------------------
// The tracker above the map
// ---------------------------------------------------------------------------

// Senate seats not on the 2028 ballot, by party (Democrats with the
// independents who caucus with them):
// - Class 1, elected in 2024: 19 D, 14 R. Tennessee's (Blackburn's) seat is
//   up in a 2028 special, so it's a race on the map: 19 D, 13 R. Minnesota's
//   (Klobuchar's) special is in 2027; it counts for its holder (D) until
//   then.
// - Class 2, elected in 2026, from the resolved race markets: 21 D (AK, CO,
//   DE, GA, IL, IA, KS, ME, MA, MI, MN, MS, NH, NJ, NM, NC, OR, RI, SC, TX,
//   VA), 12 R (AL, AR, ID, KY, LA, MT, NE, OK, SD, TN, WV, WY). Alaska and
//   Mississippi hadn't resolved on 9 Nov 2026; they count as Democratic
//   wins (Tod, 9 Nov: "most definitely going to be democrat won").
// Ohio's and Florida's 2026 specials were for Class 3 seats, up again in
// 2028. Class 3 (34 seats) and Tennessee's special make the 35 races.
export const SENATE_NOT_UP_2028 = { D: 40, R: 25 }
export const HOUSE_MAJORITY = 218

export type TrackerTone =
  | RatingBucket
  | 'wonD'
  | 'wonR'
  | 'wonO'
  | 'notUpD'
  | 'notUpR'
  // A primary: a leader's color comes with the segment.
  | 'leader'
  | 'strength0'
  | 'strength1'
  | 'strength2'
  | 'open'

export type TrackerSegment = {
  key: string
  label: string
  // Electoral votes, seats, or contests.
  count: number
  tone: TrackerTone
  color?: string
  // The places in it, strongest for the left side first.
  places: string[]
}

export type Tracker = {
  unit: [string, string]
  // Electoral votes (or seats) where each party leads, the seats not up
  // included. Absent in the primaries.
  dem?: number
  rep?: number
  middle: string
  // Where the line goes, in the bar's units: 270, 50, 218.
  threshold?: number
  segments: TrackerSegment[]
}

const RATING_LABEL: Record<RatingBucket, string> = {
  safeD: 'Safe D',
  likelyD: 'Likely D',
  leanD: 'Lean D',
  tossup: 'Toss-up',
  leanR: 'Lean R',
  likelyR: 'Likely R',
  safeR: 'Safe R',
}
const RACE_TONES: TrackerTone[] = [
  'wonD',
  'safeD',
  'likelyD',
  'leanD',
  'tossup',
  'wonO',
  'leanR',
  'likelyR',
  'safeR',
  'wonR',
]
const WON_LABEL = { wonD: 'Won by D', wonR: 'Won by R', wonO: 'Won by other' }

// Who a race's market favors, as shown: 50.3% reads 50%, a toss-up.
export function leaderOf(race: Pick<BoardRace, 'p' | 'c'>): Party | undefined {
  if (race.c === 'D' || race.c === 'R') return race.c
  if (race.c) return undefined
  const pct = Math.round(race.p * 100)
  return pct > 50 ? 'D' : pct < 50 ? 'R' : undefined
}

const raceTone = (r: BoardRace): TrackerTone =>
  r.c === 'D'
    ? 'wonD'
    : r.c === 'R'
    ? 'wonR'
    : r.c === 'O'
    ? 'wonO'
    : ratingOf(r.p)

const EV_BY_KEY = Object.fromEntries(ELECTORAL_UNITS.map((u) => [u.key, u.ev]))
export const evOf = (r: BoardRace) =>
  r.ev ?? EV_BY_KEY[r.d === undefined ? r.st : districtKey(r.st, r.d)] ?? 0

function raceSegments(
  entries: [string, BoardRace][],
  weight: (r: BoardRace) => number
): TrackerSegment[] {
  return RACE_TONES.flatMap((tone) => {
    const inTone = sortBy(
      entries.filter(([, r]) => raceTone(r) === tone),
      ([, r]) => -r.p,
      ([k]) => k
    )
    const count = sumBy(inTone, ([, r]) => weight(r))
    if (count === 0) return []
    return [
      {
        key: tone,
        label:
          tone in WON_LABEL
            ? WON_LABEL[tone as keyof typeof WON_LABEL]
            : RATING_LABEL[tone as RatingBucket],
        count,
        tone,
        places: inTone.map(([k]) => k),
      },
    ]
  })
}

export function mapTracker(
  view: MapView,
  races: BoardRace[],
  primaries: PrimaryRow[]
): Tracker {
  if (view.mode === 'primary') return primaryTracker(view, primaries)
  const entries = Object.entries(viewRaces(view.mode, races))
  const president = view.mode === 'president'
  const weight = president ? evOf : () => 1
  const lead = (party: Party) =>
    sumBy(entries, ([, r]) => (leaderOf(r) === party ? weight(r) : 0))
  const segments = raceSegments(entries, weight)
  if (president)
    return {
      unit: ['electoral vote', 'electoral votes'],
      dem: lead('D'),
      rep: lead('R'),
      middle: `${EV_TO_WIN} to win`,
      threshold: EV_TO_WIN,
      segments,
    }
  if (view.mode === 'senate') {
    const held = (party: Party): TrackerSegment => ({
      key: `notUp${party}`,
      label: `${party === 'D' ? 'Democratic caucus' : 'Republican'} seats not up in 2028`,
      count: SENATE_NOT_UP_2028[party],
      tone: party === 'D' ? 'notUpD' : 'notUpR',
      places: [],
    })
    return {
      unit: ['seat', 'seats'],
      dem: SENATE_NOT_UP_2028.D + lead('D'),
      rep: SENATE_NOT_UP_2028.R + lead('R'),
      middle: '51 for control, or 50 with the White House',
      threshold: 50,
      segments: [held('D'), ...segments, held('R')],
    }
  }
  if (view.mode === 'house')
    return {
      unit: ['seat', 'seats'],
      dem: lead('D'),
      rep: lead('R'),
      middle: `${HOUSE_MAJORITY} for a majority · ${entries.length} seats`,
      threshold: HOUSE_MAJORITY,
      segments,
    }
  return {
    unit: ['governorship', 'governorships'],
    dem: lead('D'),
    rep: lead('R'),
    middle: `${entries.length} governorships up in 2028`,
    segments,
  }
}

const OFFICE_PLURAL = {
  P: 'presidential contests',
  S: 'Senate primaries',
  G: 'governor primaries',
} as const

function primaryTracker(view: MapView, primaries: PrimaryRow[]): Tracker {
  const cells = Object.entries(primaryCells(view, primaries))
  const unit: [string, string] = ['contest', 'contests']
  const middle = `${cells.length} ${OFFICE_PLURAL[view.office]}`
  if (view.office === 'P') {
    const colors = leaderColors(primaries, view.party)
    const byLeader = new Map<string, string[]>()
    for (const [st, { cell }] of cells) {
      const name = !cell.l ? '-' : colors[cell.l] ? cell.l : ''
      byLeader.set(name, [...(byLeader.get(name) ?? []), st])
    }
    const named = Object.keys(colors).flatMap((name) => {
      const places = byLeader.get(name) ?? []
      return places.length
        ? [
            {
              key: `leader:${name}`,
              label: `${name} leads`,
              count: places.length,
              tone: 'leader' as const,
              color: colors[name],
              places,
            },
          ]
        : []
    })
    const rest = byLeader.get('') ?? []
    const none = byLeader.get('-') ?? []
    return {
      unit,
      middle,
      segments: [
        ...named,
        ...(rest.length
          ? [
              {
                key: 'leader:other',
                label: 'Someone else leads',
                count: rest.length,
                tone: 'leader' as const,
                color: OTHER_LEADER_COLOR,
                places: rest,
              },
            ]
          : []),
        ...(none.length
          ? [
              {
                key: 'leader:none',
                label: 'No leader yet',
                count: none.length,
                tone: 'leader' as const,
                color: NO_LEADER_COLOR,
                places: none,
              },
            ]
          : []),
      ],
    }
  }
  const tones: { tone: TrackerTone; label: string }[] = [
    { tone: 'strength2', label: 'Leader at 90%+' },
    { tone: 'strength1', label: 'Leader at 60–90%' },
    { tone: 'strength0', label: 'Leader under 60%' },
    { tone: 'open', label: 'Top-two or top-four primary' },
  ]
  const toneOf = (row: PrimaryRow, cell: PrimaryCell): TrackerTone => {
    if (!row[view.party]) return 'open'
    const p = cell.won ? 1 : cell.p ?? 0
    return p >= 0.9 ? 'strength2' : p >= 0.6 ? 'strength1' : 'strength0'
  }
  return {
    unit,
    middle,
    segments: tones.flatMap(({ tone, label }) => {
      const places = cells
        .filter(([, { row, cell }]) => toneOf(row, cell) === tone)
        .map(([st]) => st)
      return places.length
        ? [{ key: tone, label, count: places.length, tone, places }]
        : []
    }),
  }
}

// The electoral units most likely to decide 2028, for the map's outlines and
// the tracker's chips: up to `limit`, each a tipping point in at least
// `floor` of simulations.
export const tippingPlaces = (
  tips: { key: string; p: number }[],
  limit = 5,
  floor = 0.03
) => tips.filter((t) => t.p >= floor).slice(0, limit)

// ---------------------------------------------------------------------------
// A place's card
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

export const ordinal = (n: number) =>
  `${n}${
    n % 100 >= 11 && n % 100 <= 13
      ? 'th'
      : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
  }`

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
  // Maine and Nebraska split their electoral votes: two statewide, one per
  // district.
  const split = of('P').some((r) => r.d !== undefined)
  const president = [
    ...of('P').flatMap((r) => {
      const unit = r.d === undefined ? st : districtKey(st, r.d)
      const ev = EV_BY_KEY[unit]
      const label =
        r.d === undefined
          ? `${split ? 'Statewide' : 'Electoral votes'}${ev ? ` (${ev})` : ''}`
          : `${ordinal(r.d)} district${ev ? ` (${ev} EV)` : ''}`
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
      !r.d ? 'At-large' : `${ordinal(r.d)} district`
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

// The panel row a place stands for in a view: the race or primary the map
// colors it by.
export function focusRowKey(view: MapView, place: string) {
  const [st, d] = place.split('-')
  switch (view.mode) {
    case 'president':
      return `P-${place}`
    case 'senate':
      return `S-${st}`
    case 'governor':
      return `G-${st}`
    case 'house':
      return `H-${st}-${d ?? 0}`
    case 'primary':
      return undefined
  }
}

// A place's name: "Pennsylvania", "Pennsylvania's 1st district", "Alaska
// at-large", "Puerto Rico". Maine's and Nebraska's statewide electoral
// votes are "Maine statewide" in the President view.
export function placeTitle(place: string, statewide = false) {
  const [st, d] = place.split('-')
  const name = st in TERRITORIES ? TERRITORIES[st] : placeName(st)
  if (d === undefined) return statewide ? `${name} statewide` : name
  const n = Number(d)
  return n === 0 ? `${name} at-large` : `${name}'s ${ordinal(n)} district`
}

// Whether a place matches a search: a postal code ("pa" finds Pennsylvania
// and, in the House, its districts), part of a name ("penn"), or a district
// ("TX-15", "tx 15", "AK-AL"). Commas separate searches.
export function matchesPlace(place: string, query: string) {
  const [st, d] = place.split('-')
  const name = (st in TERRITORIES ? TERRITORIES[st] : placeName(st)).toLowerCase()
  return query
    .split(',')
    .map((t) => t.trim().toLowerCase().replace(/[–—‑]/g, '-'))
    .filter(Boolean)
    .some((term) => {
      const district = /^([a-z]{2})[\s-]*(\d+|al|at[- ]large)$/.exec(term)
      if (district) {
        const n = /^\d+$/.test(district[2]) ? Number(district[2]) : 0
        return district[1] === st.toLowerCase() && Number(d ?? -1) === n
      }
      if (term.length === 2) return term === st.toLowerCase()
      return term.length >= 3 && name.includes(term)
    })
}

// ---------------------------------------------------------------------------
// Reading a fill
// ---------------------------------------------------------------------------

const pct = (p: number) =>
  p >= 0.995 ? '>99%' : p <= 0.005 ? '<1%' : `${Math.round(p * 100)}%`

// "D 64%", "Called for R", "Newsom 41%", "Won: Ossoff".
export function describeFill(fill: Fill): string {
  if (fill.kind === 'rating') {
    if (fill.c) return fill.c === 'O' ? 'Called: other' : `Called for ${fill.c}`
    // Who leads as shown, as everywhere else: 50.3% is even.
    const party = leaderOf(fill)
    return party === 'D'
      ? `D ${pct(fill.p)}`
      : party === 'R'
      ? `R ${pct(1 - fill.p)}`
      : 'Even'
  }
  if (!fill.name) return 'No leader yet'
  if (fill.won) return `Won: ${fill.name}`
  return fill.p === undefined ? fill.name : `${fill.name} ${pct(fill.p)}`
}

export const ratingLabel = (p: number) => RATING_LABEL[ratingOf(p)]
