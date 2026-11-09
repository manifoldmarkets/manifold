// Writes web/public/data/election-officeholders.json: who holds each seat on
// /election's map (every senator, governor and House member) and, where a
// 2026 race put someone new in it, who takes it in January 2027. Public data
// only:
//   - Congress as seated: the public-domain congress-legislators dataset
//     (https://github.com/unitedstates/congress-legislators), which also
//     gives each senator's class.
//   - Governors as seated: the 2026 map's NGA roster (election-incumbents.ts).
//   - 2026 winners: each 2026 Senate and governor market and the competitive
//     House districts' market, by resolution (a yes/no market's YES side as
//     the 2026 source audit records it), named from the audited 2026
//     candidate list (election-candidates-2026.json). Safe House seats aren't
//     named until the dataset seats the new Congress.
// Rerun it after January 3, 2027 (and as 2026 races resolve):
//
//   cd web
//   TS_NODE_COMPILER_OPTIONS='{"module":"commonjs","moduleResolution":"node"}' \
//     node --no-experimental-strip-types -r ts-node/register/transpile-only \
//     -r tsconfig-paths/register scripts/election-officeholders.ts
import { writeFileSync } from 'fs'
import { join } from 'path'

import candidates from 'web/public/data/election-candidates-2026.json'
import { governors2026 } from 'web/public/data/governors-data'
import { senate2026 } from 'web/public/data/senate-state-data'
import { sourceAudit } from 'web/components/usa-map/audited-sources'
import { getIncumbentGroups } from 'web/components/usa-map/election-incumbents'
import { ELECTORAL_UNITS } from 'web/lib/politics/ec-model'
import { HOUSE_2026_DISTRICTS_SLUG } from 'web/lib/politics/elections-2028-config'
import {
  Holder,
  nameWinner,
  nextSenateElection,
  OfficeholdersFile,
  OfficeParty,
  partyOf,
  samePerson,
  Seat,
  SenateSeat,
} from 'web/lib/politics/officeholders'

const LEGISLATORS =
  'https://unitedstates.github.io/congress-legislators/legislators-current.json'
const API = 'https://api.manifold.markets/v0'
const OUT = join(__dirname, '../public/data/election-officeholders.json')

type Legislator = {
  name: {
    official_full?: string
    first: string
    last: string
    nickname?: string
    suffix?: string
  }
  terms: {
    type: 'sen' | 'rep'
    state: string
    district?: number
    class?: number
    party: string
  }[]
}
type ApiAnswer = { id: string; text: string; resolution?: string }
type ApiMarket = {
  outcomeType: string
  isResolved?: boolean
  resolution?: string
  answers?: ApiAnswer[]
}
type CandidateList = { name: string; party: string }[]

async function getJson<T>(url: string): Promise<T | undefined> {
  const r = await fetch(url)
  return r.ok ? ((await r.json()) as T) : undefined
}

// How a 2026 market resolved: the winning party, and the answer's text (a
// person's name, where it gives one). Undefined while unresolved, and for a
// yes/no market whose YES side the 2026 audit doesn't record (Maine's Senate
// market asks whether the Democrat wins; Florida's whether the Republican
// does).
function resolved(m: ApiMarket | undefined, slug: string) {
  if (!m?.isResolved) return undefined
  if (m.outcomeType === 'BINARY') {
    const audit = sourceAudit(slug)
    const yes = audit?.kind === 'party-binary' ? audit.binaryYes : undefined
    if (!yes || (m.resolution !== 'YES' && m.resolution !== 'NO'))
      return undefined
    const party: OfficeParty =
      m.resolution === 'YES' ? yes : yes === 'D' ? 'R' : 'D'
    return { party }
  }
  const won =
    m.answers?.find((a) => a.resolution === 'YES') ??
    m.answers?.find((a) => a.id === m.resolution)
  if (!won) return undefined
  const t = won.text
  const party: OfficeParty | undefined = /democrat|\(D\)/i.test(t)
    ? 'D'
    : /republican|\(R\)/i.test(t)
    ? 'R'
    : /independent|\(I\)/i.test(t)
    ? 'I'
    : undefined
  return { party, text: t.replace(/\s*\((?:D|R|I)\)\s*$/, '').trim() }
}

// A member's name as people say it: the dataset's formal name without middle
// initials or commas, with their nickname for a first name ("Bernard
// Sanders" → "Bernie Sanders", "Nicholas J. Begich III" → "Nick Begich III",
// "Eleanor Holmes Norton" kept). Where the formal name doesn't end in their
// last name, or quotes a nickname, first (or nickname) and last name.
function spokenName(n: Legislator['name']): string {
  const full = (n.official_full ?? '').replace(/,/g, '')
  const tail = [n.last, n.suffix].filter(Boolean).join(' ')
  if (full && !full.includes('"') && full.endsWith(tail)) {
    // Drop initials, a leading one too ("H. Morgan Griffith" → "Morgan
    // Griffith"), keeping at least a first and last name.
    const words = full.split(' ')
    const plain = words.filter(
      (word, i) =>
        i === words.length - 1 ||
        !/^[A-Z]\.$/.test(word) ||
        (i === 0 && words.length <= 2)
    )
    // A nickname is the name they go by ("Bernie", "Lou").
    return n.nickname && plain.length > 1
      ? [n.nickname, ...plain.slice(1)].join(' ')
      : plain.join(' ')
  }
  return [n.nickname ?? n.first, n.last, n.suffix].filter(Boolean).join(' ')
}

const elected = (holder: Holder, winner: Holder | undefined) =>
  winner && !samePerson(holder.name, winner.name) ? winner : undefined

async function main() {
  const pending: string[] = []
  const legislators = await getJson<Legislator[]>(LEGISLATORS)
  if (!legislators) throw new Error(`Couldn't read ${LEGISLATORS}`)
  const current = legislators.map((l) => ({
    name: spokenName(l.name),
    term: l.terms[l.terms.length - 1],
  }))

  // --- Senate
  const senate: Record<string, SenateSeat[]> = {}
  for (const { name, term } of current.filter((c) => c.term.type === 'sen')) {
    const cls = term.class ?? 0
    ;(senate[term.state] ??= []).push({
      name,
      party: partyOf(term.party),
      next: nextSenateElection(cls),
    })
  }
  // The 2026 race goes to the class 2 seat; a state with none held a special
  // for its class 3 seat (Florida, Ohio).
  for (const { state, slug } of senate2026) {
    const seats = senate[state] ?? []
    const seat =
      seats.find((s) => s.next === 2032) ?? seats.find((s) => s.next === 2028)
    if (!seat) continue
    const result = resolved(
      await getJson<ApiMarket>(`${API}/slug/${slug}`),
      slug
    )
    const list = (candidates.senate as Record<string, CandidateList>)[state]
    const winner = result && list ? nameWinner(list, result) : undefined
    if (!winner) pending.push(`Senate ${state}`)
    const next = elected(seat, winner)
    if (next) seat.elected = next
  }

  // --- Governors
  const governor: Record<string, Seat> = {}
  for (const { key } of ELECTORAL_UNITS.filter((u) => u.key === u.state)) {
    if (key === 'DC') continue
    const holder = getIncumbentGroups('governor', key)[0]?.members[0]
    if (holder)
      governor[key] = { name: holder.name, party: partyOf(holder.party) }
  }
  for (const { state, slug } of governors2026) {
    const seat = governor[state]
    if (!seat) continue
    const result = resolved(
      await getJson<ApiMarket>(`${API}/slug/${slug}`),
      slug
    )
    const list = (candidates.governor as Record<string, CandidateList>)[state]
    const winner = result && list ? nameWinner(list, result) : undefined
    if (!winner) pending.push(`Governor ${state}`)
    const next = elected(seat, winner)
    if (next) seat.elected = next
  }

  // --- House (and delegates, as district 0)
  const house: Record<string, Seat> = {}
  for (const { name, term } of current.filter((c) => c.term.type === 'rep')) {
    house[`${term.state}-${term.district ?? 0}`] = {
      name,
      party: partyOf(term.party),
    }
  }
  const codeByName = Object.fromEntries(
    ELECTORAL_UNITS.filter((u) => u.key === u.state).map((u) => [u.name, u.key])
  )
  const vacantElected: Record<string, Holder> = {}
  const districts = await getJson<ApiMarket>(
    `${API}/slug/${HOUSE_2026_DISTRICTS_SLUG}`
  )
  for (const a of districts?.answers ?? []) {
    const m = a.text
      .split('·')[0]
      .trim()
      .match(/^(.+?) (at-large|\d+)$/)
    const code = m ? codeByName[m[1]] : undefined
    if (!m || !code) continue
    const key = `${code}-${m[2] === 'at-large' ? 0 : Number(m[2])}`
    const seat = house[key]
    if (a.resolution !== 'YES' && a.resolution !== 'NO') {
      pending.push(`House ${key}`)
      continue
    }
    // "Will a Democrat win…": YES is the Democrat.
    const party: OfficeParty = a.resolution === 'YES' ? 'D' : 'R'
    const list = (candidates.house as Record<string, CandidateList>)[key]
    const winner = list ? nameWinner(list, { party }) : undefined
    if (!winner) pending.push(`House ${key}`)
    if (!seat) {
      if (winner) vacantElected[key] = winner
      continue
    }
    const next = elected(seat, winner)
    if (next) seat.elected = next
  }

  // Districts with no member right now (on the 2026 ballot, not seated), and
  // who takes each in January where that's named.
  const vacant = Object.fromEntries(
    Object.keys(candidates.house)
      .filter((key) => !house[key])
      .map((key) => [
        key,
        vacantElected[key] ? { elected: vacantElected[key] } : {},
      ])
  )

  const file: OfficeholdersFile = {
    asOf: new Date().toISOString().slice(0, 10),
    sources: [
      LEGISLATORS,
      'https://www.nga.org/governors/ (election-incumbents.ts roster)',
      'Resolved 2026 Manifold markets, named from election-candidates-2026.json',
    ],
    senate,
    governor,
    house,
    vacant,
    pending,
  }
  writeFileSync(OUT, JSON.stringify(file, null, 1) + '\n')
  const count = (o: Record<string, unknown>) => Object.keys(o).length
  const newly = [
    ...Object.values(senate).flat(),
    ...Object.values(governor),
    ...Object.values(house),
  ].filter((s) => s.elected).length
  console.log(
    `Wrote ${OUT}: ${count(senate)} Senate states, ${count(
      governor
    )} governors, ${count(house)} House seats (vacant: ${
      Object.keys(vacant).join(', ') || 'none'
    }); ${newly} newly elected; pending: ${pending.join(', ') || 'none'}`
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
