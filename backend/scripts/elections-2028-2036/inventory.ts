// Loads the cited inventories and turns them into the race list of a cycle.
// No network; everything comes from the JSON files next to this module.
import * as fs from 'fs'
import * as path from 'path'
import {
  Office,
  US_STATE_NAMES,
} from 'shared/elections/election-market-creation'
import {
  Cycle,
  CYCLES,
  cycleConfig,
  isPresidentialYear,
  longDate,
} from './cycles'
import { UnitResults } from './seeds'

export const STATE_NAMES: Record<string, string> = {
  ...US_STATE_NAMES,
  DC: 'District of Columbia',
}

const INVENTORY_DIR = path.join(__dirname, 'inventories')
const DATA_DIR = path.join(__dirname, 'data')
const readJson = <T>(file: string): T =>
  JSON.parse(fs.readFileSync(file, 'utf8'))

type Source = { name: string; url: string; fetchedAt?: string; note?: string }
type SenateClasses = {
  sources: Source[]
  notes: string[]
  classes: Record<
    string,
    {
      // Cycles in scope in which the class has its regular election, and
      // the date the term being replaced expires in each (January 3 after).
      cycles: number[]
      termsExpire: Record<string, string>
      note?: string
      seats: {
        state: string
        incumbent: string
        party: string
        note?: string
      }[]
    }
  >
}
// Senate special elections for the rest of a term (inventories/
// senate-specials.json). Only specials whose cycle is in scope generate a
// market; the rest (Minnesota's November 2027 special) stay listed with
// their citation.
type SenateSpecials = {
  sources: Source[]
  notes: string[]
  specials: {
    cycle: number
    state: string
    class: '1' | '2' | '3'
    termEnds: string // YYYY-MM-DD
    electionDate: string // YYYY-MM-DD
    vacatedBy: string
    law: string
    outOfScope?: string
  }[]
}
type Governors = {
  sources: Source[]
  notes: string[]
  states: {
    state: string
    incumbent: string
    party: string
    termYears: number
    // Default: the term begins in January after the election. Alaska and
    // Hawaii (first Monday in December) and North Dakota (December 15)
    // start in December of the election year.
    termBegins?: 'December'
    note: string
  }[]
}
type PresidentialUnits = {
  sources: Source[]
  notes: string[]
  electoralVotes2024: Record<string, number>
  districtUnits: {
    key: string
    state: string
    district: number
    electors: number
  }[]
  national: { key: 'US'; electorsToWin: number; totalElectors: number }
}
type HouseStates = {
  sources: Source[]
  riskLevels: Record<string, string>
  states: Record<
    string,
    { seats: number; mapInUse2026: string; risk: string; note: string }
  >
}
export type Results = {
  generatedAt: string
  sources: Record<string, string>
  states: Record<string, UnitResults>
  districts: Record<
    string,
    UnitResults & { incumbent?: string; party?: string }
  >
}

export const inventories = {
  senate: () =>
    readJson<SenateClasses>(path.join(INVENTORY_DIR, 'senate-classes.json')),
  senateSpecials: () =>
    readJson<SenateSpecials>(path.join(INVENTORY_DIR, 'senate-specials.json')),
  // Presidential years: the eleven presidential-year governorships; midterm
  // years (2030, 2034): the 36 midterm-year governorships. NH and VT are in
  // both.
  governors: (cycle: Cycle) =>
    readJson<Governors>(
      path.join(
        INVENTORY_DIR,
        isPresidentialYear(cycle) ? 'governors.json' : 'governors-midterm.json'
      )
    ),
  president: () =>
    readJson<PresidentialUnits>(
      path.join(INVENTORY_DIR, 'presidential-units.json')
    ),
  house: () =>
    readJson<HouseStates>(path.join(INVENTORY_DIR, 'house-2028-states.json')),
  results: () =>
    readJson<Results>(path.join(DATA_DIR, 'presidential-results.json')),
}

export type Race = {
  cycle: Cycle
  office: Office
  state: string // 'US' for the national presidential market
  stateName: string
  district?: number // 0 = at-large (House); 1–3 for ME/NE elector districts
  raceKey: string
  unitKey: string // key into the results: state code, 'ME-02', 'AL-01', 'US'
  dashboardKey: string
  seat: string // human description for the inventory and the description
  sources: string[]
  incumbentNote?: string
  electoralVotes?: number
  redistricting?: { mapInUse2026: string; risk: string; note: string }
  // A state's popular-vote market (president, 2028/2032/2036): who gets the
  // most votes in the state, not where its electoral votes go.
  popularVote?: true
  // A Senate special election for the rest of a term (the regular races
  // leave these unset): the seat's class and the end of the term.
  special?: { senateClass: '1' | '2' | '3'; termEnds: string }
}

// Generated counts are kept per office, with the state popular-vote markets
// counted apart from the electoral presidential ones.
export type CountKey = Office | 'presidentPopularVote'
export const countKeyOf = (race: {
  office: Office
  popularVote?: boolean
}): CountKey => (race.popularVote ? 'presidentPopularVote' : race.office)

export const pad2 = (n: number) => String(n).padStart(2, '0')
export const ORDINAL = (n: number) =>
  `${n}${
    n % 100 >= 11 && n % 100 <= 13
      ? 'th'
      : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
  }`

export function senateClassFor(cycle: Cycle): '3' | '2' | '1' {
  return ({ 2028: '3', 2030: '1', 2032: '2', 2034: '3', 2036: '1' } as const)[
    cycle
  ]
}

export function racesFor(cycle: Cycle): Race[] {
  if (!CYCLES.includes(cycle)) throw new Error(`unsupported cycle ${cycle}`)
  const cfg = cycleConfig(cycle)
  const races: Race[] = []
  const senate = inventories.senate()
  const cls = senate.classes[senateClassFor(cycle)]
  if (!cls.cycles.includes(cycle))
    throw new Error(
      `senate class ${senateClassFor(cycle)} is not up in ${cycle}`
    )
  if (cls.termsExpire[cycle] !== `${cycle + 1}-01-03`)
    throw new Error(
      `senate class ${senateClassFor(
        cycle
      )}: the term replaced in ${cycle} must expire on ${cycle + 1}-01-03`
    )
  for (const seat of cls.seats) {
    races.push({
      cycle,
      office: 'senate',
      state: seat.state,
      stateName: STATE_NAMES[seat.state],
      raceKey: `${cycle}-senate-${seat.state}-regular-general`,
      unitKey: seat.state,
      dashboardKey: seat.state,
      seat: `Class ${senateClassFor(cycle)} seat; term beginning January 3, ${
        cycle + 1
      }`,
      sources: senate.sources.map((s) => s.url),
      incumbentNote: `${seat.incumbent} (${seat.party}) as of October 2026${
        seat.note ? `; ${seat.note}` : ''
      }`,
    })
  }
  racesForSenateSpecials(cycle, races)
  const governors = inventories.governors(cycle)
  for (const g of governors.states)
    races.push({
      cycle,
      office: 'governor',
      state: g.state,
      stateName: STATE_NAMES[g.state],
      raceKey: `${cycle}-governor-${g.state}-regular-general`,
      unitKey: g.state,
      dashboardKey: g.state,
      seat: `${g.termYears}-year term beginning ${
        g.termBegins === 'December'
          ? `December ${cycle}`
          : `January ${cycle + 1}`
      }`,
      sources: governors.sources.map((s) => s.url),
      incumbentNote: `${g.incumbent} (${g.party}) as of October 2026; ${g.note}`,
    })
  if (cfg.president) racesForPresident(cycle, races)
  if (cfg.house) racesForHouse(cycle, races)
  return races
}

// Specials held with the cycle's general election, for the rest of a term.
// Key `<cycle>-senate-<ST>-special-general`; dashboard key `<ST>-special`, so
// a state with a regular race the same year keeps both.
function racesForSenateSpecials(cycle: Cycle, races: Race[]) {
  const cfg = cycleConfig(cycle)
  const inv = inventories.senateSpecials()
  for (const s of inv.specials) {
    if (s.cycle !== cycle) continue
    if (s.outOfScope)
      throw new Error(`${s.state} special: marked out of scope but in ${cycle}`)
    if (s.electionDate !== cfg.electionDate)
      throw new Error(
        `${s.state} special: ${s.electionDate} is not the ${cycle} general election (${cfg.electionDate})`
      )
    if (!(Date.parse(`${s.termEnds}T00:00:00Z`) > Date.parse(s.electionDate)))
      throw new Error(`${s.state} special: the term ends before the election`)
    if (races.some((r) => r.raceKey === `${cycle}-senate-${s.state}-special-general`))
      throw new Error(`${s.state} special listed twice for ${cycle}`)
    races.push({
      cycle,
      office: 'senate',
      state: s.state,
      stateName: STATE_NAMES[s.state],
      raceKey: `${cycle}-senate-${s.state}-special-general`,
      unitKey: s.state,
      dashboardKey: `${s.state}-special`,
      seat: `Class ${s.class} seat; special election for the rest of the term ending ${longDate(
        s.termEnds
      )}`,
      sources: inv.sources.map((src) => src.url),
      incumbentNote: `${s.vacatedBy}. ${s.law}.`,
      special: { senateClass: s.class, termEnds: s.termEnds },
    })
  }
}

function racesForPresident(cycle: Cycle, races: Race[]) {
  const president = inventories.president()
  const pSources = president.sources.map((s) => s.url)
  for (const state of Object.keys(president.electoralVotes2024).sort())
    races.push({
      cycle,
      office: 'president',
      state,
      stateName: STATE_NAMES[state],
      raceKey: `${cycle}-president-${state}-general`,
      unitKey: state,
      dashboardKey: state,
      seat:
        state === 'ME' || state === 'NE'
          ? 'the two at-large electors (statewide popular vote)'
          : 'all of the state’s electors (statewide popular vote)',
      sources: pSources,
      electoralVotes: president.electoralVotes2024[state],
    })
  for (const u of president.districtUnits)
    races.push({
      cycle,
      office: 'president',
      state: u.state,
      stateName: STATE_NAMES[u.state],
      district: u.district,
      raceKey: `${cycle}-president-${u.state}-${pad2(u.district)}-general`,
      unitKey: u.key,
      dashboardKey: `${u.state}-${u.district}`,
      seat: `the one elector allocated to the ${ORDINAL(
        u.district
      )} congressional district`,
      sources: pSources,
      electoralVotes: u.electors,
    })
  races.push({
    cycle,
    office: 'president',
    state: 'US',
    stateName: 'United States',
    raceKey: `${cycle}-president-US-general`,
    unitKey: 'US',
    dashboardKey: 'US',
    seat: `${president.national.electorsToWin} of ${president.national.totalElectors} electoral votes, or a contingent election in the House`,
    sources: pSources,
    electoralVotes: president.national.totalElectors,
  })
  // Popular vote by state (Tod, 2026-11-05): one market per state and DC on
  // which ticket gets the most votes there, unaffected by how the state
  // awards its electoral votes. No ME/NE district markets: their electoral
  // markets already follow the district vote.
  for (const state of Object.keys(president.electoralVotes2024).sort())
    races.push({
      cycle,
      office: 'president',
      state,
      stateName: STATE_NAMES[state],
      raceKey: `${cycle}-president-${state}-popular-vote`,
      unitKey: state,
      dashboardKey: state,
      seat: 'the statewide popular vote for President (the most votes, whatever the state does with its electoral votes)',
      sources: pSources,
      popularVote: true,
    })
}

// 2028 only: the 435 districts on the lines in force for November 2026.
function racesForHouse(cycle: Cycle, races: Race[]) {
  const house = inventories.house()
  const results = inventories.results()
  const perState: Record<string, number> = {}
  for (const key of Object.keys(results.districts).sort()) {
    const [state, dist] = key.split('-')
    const district = dist === 'AL' ? 0 : Number(dist)
    if (!STATE_NAMES[state] || !Number.isInteger(district))
      throw new Error(`bad district key ${key}`)
    const st = house.states[state]
    if (!st) throw new Error(`no House inventory for ${state}`)
    perState[state] = (perState[state] ?? 0) + 1
    const row = results.districts[key]
    races.push({
      cycle,
      office: 'house',
      state,
      stateName: STATE_NAMES[state],
      district,
      raceKey: `${cycle}-house-${state}-${pad2(district)}-regular-general`,
      unitKey: key,
      dashboardKey: `${state}-${district}`,
      seat: `${
        district === 0 ? 'at-large district' : `${ORDINAL(district)} district`
      } on the map in effect for the 2026 election; term beginning January 3, ${
        cycle + 1
      }`,
      sources: house.sources.map((s) => s.url),
      incumbentNote: row.incumbent
        ? `${row.incumbent} ${row.party ?? ''} as of October 2026`.trim()
        : undefined,
      redistricting: {
        mapInUse2026: st.mapInUse2026,
        risk: st.risk,
        note: st.note,
      },
    })
  }
  for (const [state, st] of Object.entries(house.states))
    if ((perState[state] ?? 0) !== st.seats)
      throw new Error(
        `${state}: inventory says ${st.seats} seats, results list ${
          perState[state] ?? 0
        } districts`
      )
}

export function nationalResults(results: Results): UnitResults {
  const out: UnitResults = {}
  for (const year of [2020, 2024] as const) {
    let d = 0
    let r = 0
    let total = 0
    for (const unit of Object.values(results.states)) {
      const row = unit[year]
      if (!row) throw new Error(`national total: a state lacks ${year}`)
      d += row.d
      r += row.r
      total += row.total ?? 0
    }
    out[year] = { d, r, total }
  }
  return out
}

export function unitResults(results: Results, race: Race): UnitResults {
  if (race.office === 'house' || race.district !== undefined) {
    const row = results.districts[race.unitKey]
    if (!row) throw new Error(`no district results for ${race.unitKey}`)
    const out: UnitResults = {}
    if (row[2020]) out[2020] = row[2020]
    if (row[2024]) out[2024] = row[2024]
    return out
  }
  const row = results.states[race.unitKey]
  if (!row) throw new Error(`no state results for ${race.unitKey}`)
  return row
}

// president: 50 states + DC + ME-1/2 and NE-1/2/3 + the national market;
// presidentPopularVote: 50 states + DC.
export const EXPECTED_COUNTS: Record<Cycle, Record<CountKey, number>> = {
  // Senate: the 34 Class 3 seats plus Tennessee's Class 1 special.
  2028: {
    senate: 35,
    governor: 11,
    president: 57,
    presidentPopularVote: 51,
    house: 435,
  },
  // Midterm: Class 1 Senate and the 36 midterm-year governorships; no House
  // (district lines may still change before 2030) and no president.
  2030: {
    senate: 33,
    governor: 36,
    president: 0,
    presidentPopularVote: 0,
    house: 0,
  },
  2032: {
    senate: 33,
    governor: 11,
    president: 57,
    presidentPopularVote: 51,
    house: 0,
  },
  // Midterm: Class 3 Senate (the 2028 seats again) and the same 36
  // midterm-year governorships as 2030; no House (new maps after the 2030
  // census) and no president.
  2034: {
    senate: 34,
    governor: 36,
    president: 0,
    presidentPopularVote: 0,
    house: 0,
  },
  2036: {
    senate: 33,
    governor: 11,
    president: 57,
    presidentPopularVote: 51,
    house: 0,
  },
}
