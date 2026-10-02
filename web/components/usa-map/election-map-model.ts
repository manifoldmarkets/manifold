import { getAnswerProbability, getDisplayProbability } from 'common/calculate'
import { Contract } from 'common/contract'
import { MapContractsDictionary } from 'web/public/data/elections-data'
import { senate2026 } from 'web/public/data/senate-state-data'
import {
  HOUSE_DISTRICT_MARKETS,
  HOUSE_RACE_MARKETS,
} from 'web/public/data/house-market-data'
import { DATA } from './usa-map-data'
import {
  isDemocraticAnswer,
  isRepublicanAnswer,
  partyProbsToColor,
} from './state-election-map'

export type ElectionMode = 'house' | 'senate' | 'governor'
// Ballot coverage is independent of our curated market coverage.
const GOVERNOR_STATES =
  'AK AL AR AZ CA CO CT FL GA HI IA ID IL KS MA MD ME MI MN NE NH NM NV NY OH OK OR PA RI SC SD TN TX VT WI WY'.split(
    ' '
  )
export type Odds = {
  dem: number
  rep: number
  other: number
  notDem?: number
  notRep?: number
}
const OUTCOMES = ['dem', 'rep', 'other', 'notDem', 'notRep'] as const
export type Race = {
  id: string
  state: string
  label: string
  shortLabel: string
  district?: number
  contract?: Contract
  answerId?: string
  matchup?: string
  odds?: Odds
}
export type Atlas = {
  states: { state: string; name: string; path: string; center: number[] }[]
  districts: {
    state: string
    district: number
    path: string
    center: number[]
  }[]
  hex: {
    size: number
    width: number
    height: number
    hexes: { state: string; district: number; x: number; y: number }[]
  }
  tiles: { state: string; row: number; col: number }[]
}

export const OTHER_COLOR = '#318b83'
export const COMPLEMENT_COLOR = '#9e9fbd'
export const outcomeLabel = (outcome: keyof Odds) =>
  ({ dem: 'D', rep: 'R', other: 'Other', notDem: 'Not D', notRep: 'Not R' }[
    outcome
  ])
export const TIERS = [
  { id: 'safe-d', label: 'Safe D', color: '#4a5fa8' },
  { id: 'likely-d', label: 'Likely D', color: '#718ac4' },
  { id: 'lean-d', label: 'Lean D', color: '#a9bde0' },
  { id: 'tossup', label: 'Toss-up', color: '#d9d2dc' },
  { id: 'lean-r', label: 'Lean R', color: '#e0aaa5' },
  { id: 'likely-r', label: 'Likely R', color: '#c87570' },
  { id: 'safe-r', label: 'Safe R', color: '#9d3336' },
  { id: 'other', label: 'Other leads', color: OTHER_COLOR },
  { id: 'not-d', label: 'Not Democratic', color: COMPLEMENT_COLOR },
  { id: 'not-r', label: 'Not Republican', color: COMPLEMENT_COLOR },
  { id: 'unpriced', label: 'Unpriced', color: '#a4a4b5' },
] as const
export type Tier = (typeof TIERS)[number]['id']

export function normalizeOdds(odds: Odds): Odds | undefined {
  const values = Object.values(odds)
  const sum = values.reduce((a, b) => a + b, 0)
  if (values.some((p) => !Number.isFinite(p) || p < 0) || sum <= 0)
    return undefined
  return {
    dem: odds.dem / sum,
    rep: odds.rep / sum,
    other: odds.other / sum,
    ...(odds.notDem !== undefined ? { notDem: odds.notDem / sum } : {}),
    ...(odds.notRep !== undefined ? { notRep: odds.notRep / sum } : {}),
  }
}

// These curated binary markets all ask whether the Republican wins.
// Keep independent outcomes separate, including races with no Democratic nominee.
export function electionOdds(
  contract?: Contract | null,
  twoPartyControl = false
): Odds | undefined {
  if (!contract || contract.resolution === 'CANCEL') return undefined
  if (contract.mechanism === 'cpmm-1' && contract.outcomeType === 'BINARY') {
    const rep = getDisplayProbability(contract)
    return normalizeOdds(
      twoPartyControl
        ? { dem: 1 - rep, rep, other: 0 }
        : { dem: 0, rep, other: 0, notRep: 1 - rep }
    )
  }
  if (contract.mechanism !== 'cpmm-multi-1' || !contract.shouldAnswersSumToOne)
    return undefined
  const odds = { dem: 0, rep: 0, other: 0 }
  for (const answer of contract.answers) {
    if (answer.resolution === 'CANCEL') continue
    const party = isDemocraticAnswer(answer.text)
      ? 'dem'
      : isRepublicanAnswer(answer.text)
      ? 'rep'
      : 'other'
    odds[party] += getAnswerProbability(contract, answer.id)
  }
  return normalizeOdds(odds)
}

export function leadingParty(odds?: Odds): keyof Odds | undefined {
  if (!odds) return undefined
  const sorted = [...OUTCOMES].sort((a, b) => (odds[b] ?? 0) - (odds[a] ?? 0))
  return Math.abs((odds[sorted[0]] ?? 0) - (odds[sorted[1]] ?? 0)) < 1e-9
    ? undefined
    : sorted[0]
}

export function raceTier(race: Pick<Race, 'odds'>): Tier {
  const o = race.odds
  if (!o) return 'unpriced'
  const party = leadingParty(o)
  if (party === 'notDem') return 'not-d'
  if (party === 'notRep') return 'not-r'
  if (party === 'other') return 'other'
  if (!party || o[party] < 0.6) return 'tossup'
  return `${o[party] >= 0.9 ? 'safe' : o[party] >= 0.75 ? 'likely' : 'lean'}-${
    party === 'dem' ? 'd' : 'r'
  }`
}

export const raceColor = (race: Race) =>
  !race.odds
    ? undefined
    : leadingParty(race.odds) === 'other'
    ? OTHER_COLOR
    : ['notDem', 'notRep'].includes(leadingParty(race.odds) ?? '')
    ? COMPLEMENT_COLOR
    : partyProbsToColor(
        race.odds.notRep ?? race.odds.dem,
        race.odds.notDem ?? race.odds.rep
      )
export const districtId = (state: string, district: number) =>
  `${state}-${district}`

const exactStateQuery = (value: string) =>
  Object.keys(DATA).find(
    (state) =>
      state.toLowerCase() === value || DATA[state].name.toLowerCase() === value
  )

export function matchesStateQuery(state: string, query: string) {
  const value = query.trim().toLowerCase()
  const exactState = exactStateQuery(value)
  if (exactState) return state === exactState
  return DATA[state]?.name.toLowerCase().includes(value) ?? false
}

export function matchesRaceQuery(race: Race, query: string) {
  const value = query.trim().toLowerCase().replace(/[–—‑]/g, '-')
  const district = /^([a-z]{2})[\s-]*(\d+|al|at[- ]large)$/.exec(value)
  if (district) {
    const number = /^\d+$/.test(district[2]) ? Number(district[2]) : 0
    return race.state === district[1].toUpperCase() && race.district === number
  }
  const exactState = exactStateQuery(value)
  if (exactState) return race.state === exactState
  return `${race.label} ${race.shortLabel} ${race.matchup ?? ''}`
    .toLowerCase()
    .includes(value)
}

export function parseHouseAnswer(text: string) {
  const state = Object.keys(DATA)
    .sort((a, b) => DATA[b].name.length - DATA[a].name.length)
    .find((s) => new RegExp(`^${DATA[s].name}(?:['’]s?|\\s)`, 'i').test(text))
  if (!state || state === 'DC') return undefined
  const [label, ...matchup] = text
    .slice(DATA[state].name.length)
    .trim()
    .split('·')
  const districtLabel = label.trim().replace(/^['’]s?\s*/i, '')
  const parsed =
    /^(\d+)(?:(?:st|nd|rd|th)? (?:congressional )?district)?$/i.exec(
      districtLabel
    )
  if (!parsed && !/^at[- ]large$/i.test(districtLabel)) return undefined
  const count = DATA[state].electoralVotes - 2
  if (parsed && (Number(parsed[1]) < 1 || Number(parsed[1]) > count))
    return undefined
  const district = count === 1 ? 0 : Number(parsed?.[1])
  if (
    !Number.isInteger(district) ||
    district < 0 ||
    district > count ||
    (count > 1 && district === 0)
  )
    return undefined
  return { state, district, matchup: matchup.join('·').trim() || undefined }
}

export function buildRaces(
  mode: ElectionMode,
  contracts: MapContractsDictionary,
  house?: Contract | null,
  additionalHouse: MapContractsDictionary = {}
): Race[] {
  if (mode !== 'house')
    return (
      mode === 'senate'
        ? senate2026
        : GOVERNOR_STATES.map((state) => ({ state }))
    )
      .filter(({ state }) => !!DATA[state] && state !== 'DC')
      .map(({ state }) => ({
        id: state,
        state,
        label: `${DATA[state].name} ${
          mode === 'senate' ? 'Senate' : 'Governor'
        }`,
        shortLabel: state,
        contract: contracts[state] ?? undefined,
        odds: electionOdds(contracts[state]),
      }))
  const priced = new Map<
    string,
    Pick<Race, 'contract' | 'answerId' | 'odds' | 'matchup'>
  >()
  for (const contract of [
    house,
    ...HOUSE_DISTRICT_MARKETS.map((slug) => additionalHouse[slug]),
  ]) {
    if (
      !contract ||
      contract.mechanism !== 'cpmm-multi-1' ||
      contract.shouldAnswersSumToOne ||
      contract.resolution === 'CANCEL'
    )
      continue
    for (const answer of contract.answers) {
      const parsed = parseHouseAnswer(answer.text)
      if (!parsed || answer.resolution === 'CANCEL') continue
      const id = districtId(parsed.state, parsed.district)
      if (priced.has(id)) continue
      const dem = getAnswerProbability(contract, answer.id)
      const odds = normalizeOdds({ dem, rep: 0, other: 0, notDem: 1 - dem })
      if (odds)
        priced.set(id, {
          contract,
          answerId: answer.id,
          odds,
          matchup: parsed.matchup,
        })
    }
  }
  for (const source of HOUSE_RACE_MARKETS) {
    const contract = additionalHouse[source.slug]
    const odds = electionOdds(contract)
    if (
      contract &&
      odds &&
      (source.preferOverPortfolio || !priced.has(source.district))
    )
      priced.set(source.district, { contract, odds })
  }
  return Object.entries(DATA)
    .filter(([state]) => state !== 'DC')
    .flatMap(([state, data]) => {
      const count = data.electoralVotes - 2
      return Array.from({ length: count }, (_, i) => {
        const district = count === 1 ? 0 : i + 1
        const id = districtId(state, district)
        const match = priced.get(id)
        return {
          id,
          state,
          district,
          shortLabel: `${state}-${district || 'AL'}`,
          label: `${data.name} ${
            district ? `District ${district}` : 'at-large'
          }`,
          ...match,
        }
      })
    })
}

export function seatSummary(races: Race[], mode: ElectionMode) {
  // Class 2 plus FL/OH specials: 65 seats are not on the ballot; D includes
  // the two independents who caucus with Democrats. Do not infer these from
  // the availability of a market, since an unavailable race is still a race.
  const held = mode === 'senate' ? { dem: 34, rep: 31 } : { dem: 0, rep: 0 }
  const counts = Object.fromEntries(TIERS.map((t) => [t.id, 0])) as Record<
    Tier,
    number
  >
  counts['safe-d'] = held.dem
  counts['safe-r'] = held.rep
  const leaders = {
    dem: held.dem,
    rep: held.rep,
    other: 0,
    notDem: 0,
    notRep: 0,
    tied: 0,
    unpriced: 0,
  }
  const expected = {
    dem: held.dem,
    rep: held.rep,
    other: 0,
    notDem: 0,
    notRep: 0,
  }
  for (const race of races) {
    counts[raceTier(race)]++
    const party = leadingParty(race.odds)
    if (!race.odds) leaders.unpriced++
    else {
      if (party) leaders[party]++
      else leaders.tied++
      for (const p of OUTCOMES) expected[p] += race.odds[p] ?? 0
    }
  }
  return {
    counts,
    leaders,
    expected,
    held,
    total: races.length + held.dem + held.rep,
  }
}
