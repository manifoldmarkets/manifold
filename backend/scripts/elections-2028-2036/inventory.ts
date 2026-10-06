// Loads the cited inventories and turns them into the race list of a cycle.
// No network; everything comes from the JSON files next to this module.
import * as fs from 'fs'
import * as path from 'path'
import {
  Office,
  US_STATE_NAMES,
} from 'shared/elections/election-market-creation'
import { Cycle, CYCLES } from './cycles'
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
      cycle: number
      termsExpire: string
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
type Governors = {
  sources: Source[]
  notes: string[]
  states: {
    state: string
    incumbent: string
    party: string
    termYears: number
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
  governors: () =>
    readJson<Governors>(path.join(INVENTORY_DIR, 'governors.json')),
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
}

export const pad2 = (n: number) => String(n).padStart(2, '0')
export const ORDINAL = (n: number) =>
  `${n}${
    n % 100 >= 11 && n % 100 <= 13
      ? 'th'
      : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
  }`

export function senateClassFor(cycle: Cycle): '3' | '2' | '1' {
  return ({ 2028: '3', 2032: '2', 2036: '1' } as const)[cycle]
}

export function racesFor(cycle: Cycle): Race[] {
  if (!CYCLES.includes(cycle)) throw new Error(`unsupported cycle ${cycle}`)
  const races: Race[] = []
  const senate = inventories.senate()
  const cls = senate.classes[senateClassFor(cycle)]
  if (cls.cycle !== cycle)
    throw new Error(
      `senate class ${senateClassFor(cycle)} is not up in ${cycle}`
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
  const governors = inventories.governors()
  for (const g of governors.states)
    races.push({
      cycle,
      office: 'governor',
      state: g.state,
      stateName: STATE_NAMES[g.state],
      raceKey: `${cycle}-governor-${g.state}-regular-general`,
      unitKey: g.state,
      dashboardKey: g.state,
      seat: `${g.termYears}-year term beginning January ${cycle + 1}`,
      sources: governors.sources.map((s) => s.url),
      incumbentNote: `${g.incumbent} (${g.party}) as of October 2026; ${g.note}`,
    })
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
  if (cycle === 2028) {
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
  return races
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

export const EXPECTED_COUNTS: Record<Cycle, Record<Office, number>> = {
  2028: { senate: 34, governor: 11, president: 57, house: 435 },
  2032: { senate: 33, governor: 11, president: 57, house: 0 },
  2036: { senate: 33, governor: 11, president: 57, house: 0 },
}
