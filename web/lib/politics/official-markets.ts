// The official @ManifoldPolitics election markets for 2027–2036, and how the
// /election page picks between an official market and the community market
// it replaces.
//
// Every official market's id is fixed before it exists: the national script
// creates each market with the id sha256(series + key) and the per-race
// pipeline with its own reserved id. scripts/election-2028-markets.ts reads
// both scripts' outputs and writes public/data/election-markets-2028.json, so the page
// knows every id without anyone pasting them in. A market that doesn't exist
// yet (or is still unlisted while it's being created) just isn't fetched, and
// its slot falls back.

import { ELECTORAL_UNITS } from './ec-model'

export type OfficialKind =
  // Per-race pipeline: one party market per race.
  | 'president-national' // which party wins the presidency
  | 'president-unit' // a state's or a Maine/Nebraska district's electoral votes
  | 'president-popular' // a state's popular vote
  | 'senate'
  | 'governor'
  | 'house'
  // National script.
  | 'presidential-primary' // one party's presidential primary in a state or territory
  | 'senate-primary'
  | 'governor-primary'
  | 'national' // everything else, placed by key

export type MarketRef = {
  id: string
  cycle: number
  kind: OfficialKind
  // Postal code; 'US' for national pipeline markets. Territories use their
  // codes (PR, GU, VI, AS, MP); Democrats Abroad is 'DA'.
  state?: string
  // House district (0 = at-large) or presidential district.
  district?: number
  // A party's own primary; absent for a top-two or top-four primary.
  party?: 'D' | 'R'
  special?: boolean
  // Opening two-party chance of the Democrat (pipeline party markets).
  pDem?: number
  // The question (national markets only; race markets are labelled by place).
  q?: string
}

export type OfficialMarketsFile = {
  generatedAt: string
  sources: Record<string, string>
  markets: Record<string, MarketRef>
}

// ---------------------------------------------------------------------------
// Places
// ---------------------------------------------------------------------------

export const TERRITORIES: Record<string, string> = {
  PR: 'Puerto Rico',
  GU: 'Guam',
  VI: 'U.S. Virgin Islands',
  AS: 'American Samoa',
  MP: 'Northern Mariana Islands',
  DA: 'Democrats Abroad',
}

const STATE_NAME_BY_CODE: Record<string, string> = Object.fromEntries(
  ELECTORAL_UNITS.filter((u) => u.key === u.state).map((u) => [u.key, u.name])
)

export const placeName = (code: string) =>
  STATE_NAME_BY_CODE[code] ?? TERRITORIES[code] ?? code

// Names a question may use for a place, longest first so "West Virginia"
// isn't read as Virginia, nor "Washington, D.C." as Washington.
const PLACE_PATTERNS: [RegExp, string][] = [
  ...Object.entries(TERRITORIES).map(([code, name]): [string, string] => [
    code,
    name,
  ]),
  ['VI', 'Virgin Islands'],
  ['MP', 'Northern Marianas'],
  ['DC', 'District of Columbia'],
  ['DC', 'Washington, D.C.'],
  ['DC', 'Washington, DC'],
  ...Object.entries(STATE_NAME_BY_CODE).filter(([code]) => code !== 'DC'),
]
  .sort((a, b) => b[1].length - a[1].length)
  .map(([code, name]) => [
    new RegExp(
      // A trailing word boundary only after a word character ("D.C." ends
      // in a period).
      `\\b${name.replace(/[.,]/g, (c) => `\\${c}`)}${
        /\w$/.test(name) ? '\\b' : ''
      }`,
      'i'
    ),
    code,
  ])

// The single place a question names, or undefined for none or several.
export function placeIn(question: string): string | undefined {
  let rest = question
  const found = new Set<string>()
  for (const [re, code] of PLACE_PATTERNS) {
    if (!re.test(rest)) continue
    found.add(code)
    rest = rest.replace(re, ' ')
  }
  return found.size === 1 ? [...found][0] : undefined
}

// ---------------------------------------------------------------------------
// Classification (used by the generator)
// ---------------------------------------------------------------------------

// A row of the national script's offline plan (out/plan.json).
export type NationalPlanRow = {
  key: string
  cycle: number
  question: string
  topics: string[]
  reservedId: string
}

const partyIn = (question: string): 'D' | 'R' | undefined => {
  const d = /\bDemocrat(ic|s)?\b/i.test(question)
  const r = /\bRepublican(s)?\b|\bGOP\b/i.test(question)
  return d === r ? undefined : d ? 'D' : 'R'
}

export function classifyNational(row: NationalPlanRow): MarketRef {
  const { question: q } = row
  const base = { id: row.reservedId, cycle: row.cycle }
  const presidentialPrimary =
    row.topics.includes('2028-presidential-primaries') ||
    /presidential (primary|primaries|caucus|caucuses|contest)\b/i.test(q)
  const primaryWords =
    /\b(primary|primaries|caucus|caucuses|nominee|nomination)\b/i
  const place = placeIn(q)
  if (presidentialPrimary && place)
    return {
      ...base,
      kind: 'presidential-primary',
      state: place,
      party: partyIn(q),
    }
  if (place && primaryWords.test(q) && /\bSenate\b/i.test(q))
    return {
      ...base,
      kind: 'senate-primary',
      state: place,
      party: partyIn(q),
      ...(/\bspecial\b/i.test(q) ? { special: true } : {}),
    }
  if (place && primaryWords.test(q) && /\bgovernor|gubernatorial\b/i.test(q))
    return {
      ...base,
      kind: 'governor-primary',
      state: place,
      party: partyIn(q),
    }
  return { ...base, kind: 'national', q }
}

// A per-race pipeline manifest entry (only the fields read here).
export type PipelineEntry = {
  raceKey: string
  status: string
  proposition?: string
  identity: {
    cycle: number
    office: 'president' | 'senate' | 'governor' | 'house'
    state: string
    district?: number
    election?: string
  }
  payload?: { answers?: string[]; answerProbs?: number[] }
}

export function classifyPipeline(entry: PipelineEntry, id: string): MarketRef {
  const { identity: who, payload } = entry
  const kind: OfficialKind =
    who.office === 'president'
      ? entry.proposition === 'popular-vote-party'
        ? 'president-popular'
        : who.state === 'US'
        ? 'president-national'
        : 'president-unit'
      : who.office
  const [d, r] = payload?.answerProbs ?? []
  const pDem =
    Number.isFinite(d) && Number.isFinite(r) && d + r > 0
      ? Math.round((d / (d + r)) * 1000) / 1000
      : undefined
  return {
    id,
    cycle: who.cycle,
    kind,
    state: who.state,
    ...(who.district !== undefined ? { district: who.district } : {}),
    ...(who.election === 'special' ? { special: true } : {}),
    ...(pDem !== undefined ? { pDem } : {}),
  }
}

// ---------------------------------------------------------------------------
// Slots: official or community
// ---------------------------------------------------------------------------

type SlotMarket = {
  visibility?: string
  deleted?: boolean
  uniqueBettorCount?: number
}

const usable = <C extends SlotMarket>(c: C | null | undefined): c is C =>
  !!c && c.visibility === 'public' && c.deleted !== true

// The official market takes a slot once it exists (public) and has at least
// as many traders as the community market there; until then the community
// market keeps it (its history and depth are what the charts need). Either
// alone takes it; neither leaves the slot to its fallback.
export function pickSlot<C extends SlotMarket>(
  official: C | null | undefined,
  community: C | null | undefined
): C | undefined {
  if (!usable(official)) return usable(community) ? community : undefined
  if (!usable(community)) return official
  return (official.uniqueBettorCount ?? 0) >= (community.uniqueBettorCount ?? 0)
    ? official
    : community
}

// Which official markets the page loads: 2028's (not the popular vote, which
// has a community slot), the national ones, each primary through its own
// year while the primaries show (Minnesota's 2027 Senate special has one),
// and 2030's once that section shows.
export function pageLoads(
  ref: Pick<MarketRef, 'cycle' | 'kind'>,
  show: { primaries: boolean; midterms2030: boolean; year: number }
) {
  if (ref.kind.endsWith('-primary'))
    return show.primaries && ref.cycle >= show.year
  if (ref.cycle === 2028) return ref.kind !== 'president-popular'
  if (ref.kind === 'national' || ref.kind === 'president-national') return true
  return ref.cycle === 2030 && show.midterms2030
}

// ---------------------------------------------------------------------------
// Who held each seat before (for the race board's "flipped" shading)
// ---------------------------------------------------------------------------

// 2024 presidential winners by electoral unit: Harris won these 19 states,
// DC, Maine's 1st and Nebraska's 2nd district; Trump won every other unit.
const DEM_2024 = new Set([
  'CA',
  'CO',
  'CT',
  'DE',
  'DC',
  'HI',
  'IL',
  'ME',
  'ME-1',
  'MD',
  'MA',
  'MN',
  'NE-2',
  'NH',
  'NJ',
  'NM',
  'NY',
  'OR',
  'RI',
  'VT',
  'VA',
  'WA',
])
export const president2024Winner = (unit: string): 'D' | 'R' =>
  DEM_2024.has(unit) ? 'D' : 'R'

// The party holding each Senate seat up in 2028 (Class 3, last elected in
// 2022; Ohio and Florida in their 2026 specials: Sherrod Brown won Ohio, a
// Republican won Florida) and Tennessee's 2028 special (Blackburn's seat,
// filled by a Republican governor's appointee). Minnesota's special for
// Klobuchar's seat is in 2027 (Minn. Stat. 204D.28), not on this board.
export const SENATE_2028_HOLDER: Record<string, 'D' | 'R'> = {
  AL: 'R',
  AK: 'R',
  AZ: 'D',
  AR: 'R',
  CA: 'D',
  CO: 'D',
  CT: 'D',
  FL: 'R',
  GA: 'D',
  HI: 'D',
  ID: 'R',
  IL: 'D',
  IN: 'R',
  IA: 'R',
  KS: 'R',
  KY: 'R',
  LA: 'R',
  MD: 'D',
  MO: 'R',
  NV: 'D',
  NH: 'D',
  NY: 'D',
  NC: 'R',
  ND: 'R',
  OH: 'D',
  OK: 'R',
  OR: 'D',
  PA: 'D',
  SC: 'R',
  SD: 'R',
  UT: 'R',
  VT: 'D',
  WA: 'D',
  WI: 'R',
}
export const SENATE_2028_SPECIAL_HOLDER: Record<string, 'D' | 'R'> = {
  TN: 'R',
}

// Governors up in 2028 whose seats weren't on the 2026 ballot (NGA roster,
// October 2026), plus New Hampshire (two-year terms; Republicans won 2026).
// Vermont also elects every two years; it's left out until its 2026 result
// is recorded.
export const GOVERNOR_2028_HOLDER: Record<string, 'D' | 'R'> = {
  DE: 'D',
  IN: 'R',
  MO: 'R',
  MT: 'R',
  NC: 'D',
  ND: 'R',
  NH: 'R',
  UT: 'R',
  WA: 'D',
  WV: 'R',
}
