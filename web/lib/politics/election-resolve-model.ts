// Pure model for /admin/election-resolve: every market the /election map
// shows, broken into the units an admin resolves one at a time, the exact
// resolve-API call for each, and the draft post the team tweets.
//
// A unit is what one resolve call settles:
// - a binary market (YES or NO),
// - a linked multi-choice market (CHOOSE_ONE with the winning answer), or
// - one answer of an independent multi-choice portfolio (YES or NO on that
//   answer; the backend resolves those answers one by one).
// That mirrors getResolutionParams in backend/api/src/resolve-market.ts.

import { getAnswerProbability, getDisplayProbability } from 'common/calculate'
import { Contract, isMultiCpmm } from 'common/contract'
import { BALLOT_MEASURES } from 'web/components/usa-map/ballot-measures-model'
import {
  buildRaces,
  leadingParty,
  Race,
} from 'web/components/usa-map/election-map-model'
import { MIDTERMS_2026 } from 'web/public/data/elections-data'
import { governors2026 } from 'web/public/data/governors-data'
import {
  HOUSE_DISTRICT_MARKETS,
  HOUSE_RACE_MARKETS,
} from 'web/public/data/house-market-data'
import { senate2026 } from 'web/public/data/senate-state-data'

export const OFFICES = [
  'headline',
  'senate',
  'governor',
  'house',
  'measure',
] as const
export type Office = (typeof OFFICES)[number]

export const OFFICE_LABEL: Record<Office, string> = {
  headline: 'Headline',
  senate: 'Senate',
  governor: 'Governor',
  house: 'House',
  measure: 'Ballot measures',
}

const HEADLINE_LABEL: Record<keyof typeof MIDTERMS_2026, string> = {
  balanceOfPower: 'Balance of power',
  houseControl: 'House control',
  senateControl: 'Senate control',
  houseDistricts: 'House districts',
}

// One place the map reads a market from. Slug sources come from the web
// data files; ballot measures are keyed by contract id (and, for a
// portfolio, the answer that prices the measure).
export type MapSource = {
  office: Office
  race: string
  ref: { slug: string } | { id: string }
  answerId?: string
}

export function mapSources(): MapSource[] {
  const headline = (
    Object.entries(MIDTERMS_2026) as [keyof typeof MIDTERMS_2026, string][]
  )
    // The district portfolio prices the House map, so it files under House.
    .filter(([key]) => key !== 'houseDistricts')
    .map(([key, slug]) => ({
      office: 'headline' as const,
      race: HEADLINE_LABEL[key],
      ref: { slug },
    }))
  const senate = senate2026.map((m) => ({
    office: 'senate' as const,
    race: `${m.state} Senate`,
    ref: { slug: m.slug },
  }))
  const governor = governors2026.map((m) => ({
    office: 'governor' as const,
    race: `${m.state} Governor`,
    ref: { slug: m.slug },
  }))
  const portfolios = [
    {
      office: 'house' as const,
      race: HEADLINE_LABEL.houseDistricts,
      ref: { slug: MIDTERMS_2026.houseDistricts },
    },
    ...HOUSE_DISTRICT_MARKETS.map((slug) => ({
      office: 'house' as const,
      race: 'House portfolio',
      ref: { slug },
    })),
  ]
  const houseRaces = HOUSE_RACE_MARKETS.map((m) => ({
    office: 'house' as const,
    race: m.district,
    ref: { slug: m.slug },
  }))
  const measures = BALLOT_MEASURES.flatMap((m) =>
    m.source
      ? [
          {
            office: 'measure' as const,
            race: `${m.state} ${m.designation ?? m.title}`,
            ref: { id: m.source.contractId },
            answerId:
              m.source.kind === 'portfolio-answer'
                ? m.source.answerId
                : undefined,
          },
        ]
      : []
  )
  return [
    ...headline,
    ...senate,
    ...governor,
    ...portfolios,
    ...houseRaces,
    ...measures,
  ]
}

export type UnitKind = 'binary' | 'choose-one' | 'answer'

export type UnitOption = {
  // 'YES' | 'NO' for binary and answer units; the answer id for choose-one.
  value: string
  label: string
  prob: number
}

export type ResolveUnit = {
  key: string
  contractId: string
  office: Office
  race: string
  kind: UnitKind
  answerId?: string
  question: string
  // The answer this unit settles, for an answer unit.
  answerText?: string
  url: string
  options: UnitOption[]
  leader: UnitOption
  resolved: boolean
  // What it resolved to, for display.
  resolutionLabel?: string
}

const clampProb = (p: number) => (Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0)

const pickLeader = (options: UnitOption[]) =>
  options.reduce((best, o) => (o.prob > best.prob ? o : best), options[0])

const yesNo = (yes: number): UnitOption[] => [
  { value: 'YES', label: 'YES', prob: clampProb(yes) },
  { value: 'NO', label: 'NO', prob: clampProb(1 - yes) },
]

const contractUrl = (c: Contract) =>
  `/${c.creatorUsername}/${c.slug}`

// The resolve units for every map market, one entry per unit, in source
// order. A contract listed by several sources (a portfolio that prices
// several ballot measures) yields its units once; an answer a ballot
// measure names takes that measure's label.
export function buildUnits(
  sources: MapSource[],
  contractsBySlug: Record<string, Contract | undefined>,
  contractsById: Record<string, Contract | undefined>
): ResolveUnit[] {
  const units: ResolveUnit[] = []
  const seen = new Set<string>()
  const answerRace = new Map<string, string>()
  for (const s of sources)
    if (s.answerId && 'id' in s.ref)
      answerRace.set(`${s.ref.id}:${s.answerId}`, s.race)

  for (const source of sources) {
    const raw =
      'slug' in source.ref
        ? contractsBySlug[source.ref.slug]
        : contractsById[source.ref.id]
    if (!raw || seen.has(raw.id)) continue
    seen.add(raw.id)
    const contract = withResolvedOdds(raw)
    const base = {
      contractId: contract.id,
      office: source.office,
      question: contract.question,
      url: contractUrl(contract),
    }

    if (contract.outcomeType === 'BINARY') {
      const options = yesNo(getDisplayProbability(contract))
      units.push({
        ...base,
        key: contract.id,
        race: source.race,
        kind: 'binary',
        options,
        leader: pickLeader(options),
        resolved: !!contract.resolution,
        resolutionLabel: contract.resolution,
      })
      continue
    }
    if (!isMultiCpmm(contract)) continue

    if (contract.shouldAnswersSumToOne) {
      const options = contract.answers
        .filter((a) => a.resolution !== 'CANCEL')
        .map((a) => ({
          value: a.id,
          label: a.text,
          prob: clampProb(getAnswerProbability(contract, a.id)),
        }))
      if (!options.length) continue
      // The result is the answer id, or a resolutions map that
      // withResolvedOdds has turned into per-answer probabilities.
      const winner =
        contract.answers.find((a) => a.id === contract.resolution) ??
        contract.answers.find(
          (a) => getAnswerProbability(contract, a.id) >= 0.999
        )
      units.push({
        ...base,
        key: contract.id,
        race: source.race,
        kind: 'choose-one',
        options,
        leader: pickLeader(options),
        resolved: !!contract.resolution,
        resolutionLabel: winner?.text ?? contract.resolution,
      })
      continue
    }

    for (const answer of contract.answers) {
      const options = yesNo(getAnswerProbability(contract, answer.id))
      units.push({
        ...base,
        key: `${contract.id}:${answer.id}`,
        // A portfolio answer no measure names keeps the market-level label.
        race:
          answerRace.get(`${contract.id}:${answer.id}`) ??
          (source.office === 'measure' ? 'Measure portfolio' : source.race),
        kind: 'answer',
        answerId: answer.id,
        answerText: answer.text,
        options,
        leader: pickLeader(options),
        resolved: !!answer.resolution || !!contract.resolution,
        resolutionLabel: answer.resolution ?? contract.resolution,
      })
    }
  }
  return units
}

export type ResolveCall =
  | { contractId: string; outcome: 'YES' | 'NO' }
  | { contractId: string; outcome: 'YES' | 'NO'; answerId: string }
  | { contractId: string; outcome: 'CHOOSE_ONE'; answerId: string }

// The body for POST market/:contractId/resolve that settles `unit` on
// `value`. Throws for a value the unit does not offer, so a stale or
// mistyped choice can never reach the API.
export function resolveCall(unit: ResolveUnit, value: string): ResolveCall {
  if (!unit.options.some((o) => o.value === value))
    throw new Error(`${unit.race}: "${value}" is not an outcome of this market`)
  if (unit.kind === 'choose-one')
    return { contractId: unit.contractId, outcome: 'CHOOSE_ONE', answerId: value }
  if (value !== 'YES' && value !== 'NO')
    throw new Error(`${unit.race}: expected YES or NO, got "${value}"`)
  if (unit.kind === 'answer') {
    if (!unit.answerId) throw new Error(`${unit.race}: answer unit has no answer`)
    return { contractId: unit.contractId, outcome: value, answerId: unit.answerId }
  }
  return { contractId: unit.contractId, outcome: value }
}

export const optionFor = (unit: ResolveUnit, value: string) =>
  unit.options.find((o) => o.value === value)

export type SortKey = 'chance-desc' | 'chance-asc' | 'race'

const officeOrder = (o: Office) => OFFICES.indexOf(o)

export function sortUnits(units: ResolveUnit[], sort: SortKey) {
  const byRace = (a: ResolveUnit, b: ResolveUnit) =>
    officeOrder(a.office) - officeOrder(b.office) ||
    a.race.localeCompare(b.race, undefined, { numeric: true }) ||
    (a.answerText ?? '').localeCompare(b.answerText ?? '', undefined, {
      numeric: true,
    })
  return [...units].sort((a, b) =>
    sort === 'race'
      ? byRace(a, b)
      : (sort === 'chance-desc'
          ? b.leader.prob - a.leader.prob
          : a.leader.prob - b.leader.prob) || byRace(a, b)
  )
}

// ─── Movement and the tweet draft ────────────────────────────────────────────

// Every option's probability at one moment, keyed `${unit.key}|${value}`.
export type Snapshot = { t: number; probs: Record<string, number> }

export function snapshotOf(units: ResolveUnit[], t: number): Snapshot {
  const probs: Record<string, number> = {}
  for (const u of units)
    for (const o of u.options) probs[`${u.key}|${o.value}`] = o.prob
  return { t, probs }
}

// The newest snapshot at least `windowMs` old, else the oldest one held.
export function baselineFor(
  history: Snapshot[],
  now: number,
  windowMs: number
): Snapshot | undefined {
  let best: Snapshot | undefined
  for (const s of history) {
    if (s.t <= now - windowMs && (!best || s.t > best.t)) best = s
  }
  return best ?? history.reduce<Snapshot | undefined>(
    (oldest, s) => (!oldest || s.t < oldest.t ? s : oldest),
    undefined
  )
}

export type Mover = {
  unit: ResolveUnit
  option: UnitOption
  from: number
  to: number
}

// Open units whose leading option moved the most since `baseline`.
export function biggestMovers(
  units: ResolveUnit[],
  baseline: Snapshot | undefined,
  limit: number
): Mover[] {
  if (!baseline) return []
  const movers: Mover[] = []
  for (const unit of units) {
    if (unit.resolved) continue
    const from = baseline.probs[`${unit.key}|${unit.leader.value}`]
    if (from === undefined || !Number.isFinite(from)) continue
    movers.push({ unit, option: unit.leader, from, to: unit.leader.prob })
  }
  return movers
    .filter((m) => Math.abs(m.to - m.from) >= 0.02)
    .sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from))
    .slice(0, limit)
}

export type CalledTally = {
  called: number
  dem: number
  rep: number
  other: number
}

// A resolved market keeps its last prices. A binary stores the
// pre-resolution price as resolutionProbability, and a linked multi-choice
// market records the result on the contract (resolution, resolutions)
// without resolving each answer (resolveMarketHelper). Rewrite both to read
// the result, so units and the map's odds show what each market resolved to.
export function withResolvedOdds(c: Contract): Contract {
  if (!c.resolution || c.resolution === 'CANCEL') return c
  if (c.outcomeType === 'BINARY') {
    if (c.resolution !== 'YES' && c.resolution !== 'NO') return c
    return { ...c, resolutionProbability: c.resolution === 'YES' ? 1 : 0 }
  }
  if (!isMultiCpmm(c) || !c.shouldAnswersSumToOne) return c
  const { resolution, resolutions } = c
  return {
    ...c,
    answers: c.answers.map((a) =>
      a.resolution
        ? a
        : resolutions
        ? {
            ...a,
            resolution: 'MKT' as const,
            resolutionProbability: (resolutions[a.id] ?? 0) / 100,
          }
        : {
            ...a,
            resolution: a.id === resolution ? ('YES' as const) : ('NO' as const),
          }
    ),
  }
}

// What the admin saw when ticking a unit. A selection whose fingerprint no
// longer matches (question or answer edited since) must be reviewed again.
export const unitFingerprint = (unit: ResolveUnit, value: string) =>
  JSON.stringify([
    unit.question,
    unit.answerText ?? '',
    optionFor(unit, value)?.label ?? '',
  ])

export type Choice = { value: string; fingerprint: string }

export const isStale = (unit: ResolveUnit, choice: Choice) =>
  unitFingerprint(unit, choice.value) !== choice.fingerprint

// `unit` rebuilt from a freshly read copy of its market.
export function freshUnit(
  unit: ResolveUnit,
  contract: Contract | undefined
): ResolveUnit | undefined {
  if (!contract || contract.id !== unit.contractId) return undefined
  return buildUnits(
    [{ office: unit.office, race: unit.race, ref: { id: contract.id } }],
    {},
    { [contract.id]: contract }
  ).find((u) => u.key === unit.key)
}

// Why a unit must not be resolved now, judged on a copy read just before
// the call; undefined when it is still exactly what the admin approved.
export function checkBeforeResolve(
  fresh: ResolveUnit | undefined,
  choice: Choice | undefined
): string | undefined {
  if (!choice) return 'No outcome chosen.'
  if (!fresh) return 'Market or answer no longer found.'
  if (fresh.resolved) return 'Already resolved.'
  if (isStale(fresh, choice))
    return 'Edited since it was ticked. Review it again.'
  return undefined
}

// The chamber-control line's input from its binary (YES = Republicans).
// Only a YES or NO result names a winner; N/A or a partial resolution says
// nothing rather than reading its last price as an outcome.
export function chamberControl(unit?: ResolveUnit): {
  rep?: number
  resolved?: boolean
} {
  if (!unit || unit.kind !== 'binary') return {}
  if (unit.resolved) {
    if (unit.resolutionLabel === 'YES') return { rep: 1, resolved: true }
    if (unit.resolutionLabel === 'NO') return { rep: 0, resolved: true }
    return {}
  }
  return { rep: optionFor(unit, 'YES')?.prob }
}

// Map races whose market (or, for a portfolio-priced House seat, whose
// answer) has resolved, by the party the map now reads for them. Party
// semantics come from the map's own audited sources via buildRaces.
export function calledTally(races: Race[]): CalledTally {
  const tally = { called: 0, dem: 0, rep: 0, other: 0 }
  for (const race of races) {
    const c = race.contract
    if (!c) continue
    const answer =
      race.answerId && isMultiCpmm(c)
        ? c.answers.find((a) => a.id === race.answerId)
        : undefined
    const resolution = race.answerId ? answer?.resolution : c.resolution
    if (!resolution || resolution === 'CANCEL') continue
    tally.called++
    const party = leadingParty(race.odds)
    if (party === 'dem') tally.dem++
    else if (party === 'rep') tally.rep++
    else tally.other++
  }
  return tally
}

export function calledByOffice(
  contractsBySlug: Record<string, Contract | undefined>
): SummaryInput['called'] {
  const bySlug = (slug: string) => {
    const c = contractsBySlug[slug]
    return c ? withResolvedOdds(c) : null
  }
  const byState = (list: { state: string; slug: string }[]) =>
    Object.fromEntries(list.map((m) => [m.state, bySlug(m.slug)]))
  const additionalHouse = Object.fromEntries(
    [...HOUSE_DISTRICT_MARKETS, ...HOUSE_RACE_MARKETS.map((m) => m.slug)].map(
      (slug) => [slug, bySlug(slug)]
    )
  )
  return {
    senate: calledTally(buildRaces('senate', byState(senate2026))),
    governor: calledTally(buildRaces('governor', byState(governors2026))),
    house: calledTally(
      buildRaces(
        'house',
        {},
        bySlug(MIDTERMS_2026.houseDistricts),
        additionalHouse
      )
    ),
  }
}

const pct = (p: number) => `${Math.round(100 * p)}%`
const signedPts = (d: number) => {
  const pts = Math.round(100 * d)
  return pts === 0 ? 'no change' : `${pts > 0 ? '+' : '−'}${Math.abs(pts)}`
}

const moverName = (m: Mover) => {
  const what =
    m.unit.kind === 'answer'
      ? `${m.unit.answerText} ${m.option.value === 'YES' ? 'YES' : 'NO'}`
      : m.unit.kind === 'choose-one'
      ? m.option.label
      : m.option.value
  return `${m.unit.race}: ${what} ${pct(m.to)} (${signedPts(m.to - m.from)})`
}

export type SummaryInput = {
  now: number
  baseline?: Snapshot
  // P(Republicans win control) now, from the chamber-control binaries, and
  // whether those markets have resolved.
  senateRep?: number
  houseRep?: number
  senateResolved?: boolean
  houseResolved?: boolean
  called: Partial<Record<'senate' | 'house' | 'governor', CalledTally>>
  movers: Mover[]
}

const etTime = (ms: number) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
  }).format(ms) + ' ET'

const controlLine = (
  chamber: string,
  rep: number | undefined,
  key: string,
  baseline?: Snapshot,
  resolved?: boolean
) => {
  if (rep === undefined || !Number.isFinite(rep)) return undefined
  const dem = 1 - rep
  const lead = rep >= dem ? 'R' : 'D'
  if (resolved) return `${chamber}: ${lead} control, resolved on Manifold`
  const leadProb = Math.max(rep, dem)
  const before = baseline?.probs[`${key}|YES`]
  const change =
    before === undefined
      ? ''
      : ` (${signedPts(lead === 'R' ? rep - before : before - rep)})`
  return `${chamber}: ${lead} ${pct(leadProb)} to control${change}`
}

const tallyText = (label: string, t?: CalledTally) =>
  t && t.called
    ? `${label} ${t.called} (` +
      [
        t.dem ? `D ${t.dem}` : '',
        t.rep ? `R ${t.rep}` : '',
        t.other ? `other ${t.other}` : '',
      ]
        .filter(Boolean)
        .join(', ') +
      ')'
    : undefined

export function buildSummary(
  input: SummaryInput,
  keys: { senateControl?: string; houseControl?: string }
): string {
  const {
    now,
    baseline,
    senateRep,
    houseRep,
    senateResolved,
    houseResolved,
    called,
    movers,
  } = input
  const since = baseline
    ? `Moves since ${etTime(baseline.t)}`
    : 'Moves: not enough history yet'
  const calledParts = [
    tallyText('Senate', called.senate),
    tallyText('House', called.house),
    tallyText('Governor', called.governor),
  ].filter(Boolean)
  const lines = [
    `Manifold midterms, ${etTime(now)}`,
    keys.senateControl
      ? controlLine(
          'Senate',
          senateRep,
          keys.senateControl,
          baseline,
          senateResolved
        )
      : undefined,
    keys.houseControl
      ? controlLine(
          'House',
          houseRep,
          keys.houseControl,
          baseline,
          houseResolved
        )
      : undefined,
    calledParts.length ? `Resolved so far: ${calledParts.join(' · ')}` : undefined,
    movers.length ? `${since}:` : undefined,
    ...movers.map((m) => `• ${moverName(m)}`),
    'manifold.markets/election',
  ]
  return lines.filter((l): l is string => !!l).join('\n')
}
