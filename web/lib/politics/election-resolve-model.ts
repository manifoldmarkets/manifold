// Pure model for /admin/election-resolve: every market the /election map
// shows, broken into the units an admin resolves one at a time, the exact
// resolve-API call for each, and how each unit moved over a recent window.
//
// A unit is what one resolve call settles:
// - a binary market (YES or NO),
// - a linked multi-choice market (CHOOSE_ONE with the winning answer), or
// - one answer of an independent multi-choice portfolio (YES or NO on that
//   answer; the backend resolves those answers one by one).
// That mirrors getResolutionParams in backend/api/src/resolve-market.ts.

import { getAnswerProbability, getDisplayProbability } from 'common/calculate'
import { Contract, isMultiCpmm } from 'common/contract'
import { sumBy } from 'lodash'
import { BALLOT_MEASURES } from 'web/components/usa-map/ballot-measures-model'
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
  // What it resolved to, for display, and when.
  resolutionLabel?: string
  resolutionTime?: number
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
        resolutionTime: contract.resolutionTime,
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
        resolutionTime: contract.resolutionTime,
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
        resolutionTime: answer.resolutionTime ?? contract.resolutionTime,
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

// ─── Recent movers ───────────────────────────────────────────────────────────
//
// Built from trades rather than from what this tab has watched, so a window
// is complete the moment its trades load. Every bet row carries the price
// before it, so the first trade on a series after a moment gives the
// series' price at that moment, and a series with no trade since has not
// moved. A trade on one answer of a linked market records each sibling it
// moved as its own row in the same bet group, so every answer is covered.

// One price line: a binary market, or one answer of a multi-choice market.
export const seriesKey = (contractId: string, answerId?: string | null) =>
  `${contractId}|${answerId ?? ''}`

export type Trade = { t: number; before: number }
// series key -> its trades, ascending by time
export type TradeStore = Map<string, Trade[]>

export type TradeRow = {
  contractId?: string
  answerId?: string | null
  createdTime: number
  probBefore: number
}

// Adds rows to the store in place, skipping rows it already holds: the
// incremental refresh overlaps the previous one. Points rows carry no
// contract id, so their caller passes it. Returns how many were new.
export function addTrades(
  store: TradeStore,
  seen: Set<string>,
  rows: TradeRow[],
  contractId?: string
): number {
  let added = 0
  const touched = new Set<Trade[]>()
  for (const row of rows) {
    const cid = row.contractId ?? contractId
    if (
      !cid ||
      !Number.isFinite(row.createdTime) ||
      !Number.isFinite(row.probBefore)
    )
      continue
    const key = seriesKey(cid, row.answerId)
    const id = `${key}|${row.createdTime}|${row.probBefore}`
    if (seen.has(id)) continue
    seen.add(id)
    let list = store.get(key)
    if (!list) {
      list = []
      store.set(key, list)
    }
    list.push({ t: row.createdTime, before: row.probBefore })
    touched.add(list)
    added++
  }
  for (const list of touched) list.sort((a, b) => a.t - b.t)
  return added
}

// Index of the first trade strictly after `since`.
const firstAfter = (trades: Trade[], since: number) => {
  let lo = 0
  let hi = trades.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (trades[mid].t > since) hi = mid
    else lo = mid + 1
  }
  return lo
}

const priceAt = (store: TradeStore, key: string, since: number) => {
  const trades = store.get(key)
  if (!trades) return undefined
  const i = firstAfter(trades, since)
  return i < trades.length ? trades[i].before : undefined
}

const unitSeries = (unit: ResolveUnit) =>
  unit.kind === 'choose-one'
    ? unit.options.map((o) => seriesKey(unit.contractId, o.value))
    : [seriesKey(unit.contractId, unit.answerId)]

export function tradesSince(
  unit: ResolveUnit,
  store: TradeStore,
  since: number
) {
  return sumBy(unitSeries(unit), (key) => {
    const trades = store.get(key)
    return trades ? trades.length - firstAfter(trades, since) : 0
  })
}

// Each option's price at `since`. An option whose series has not traded
// since then is still at its current price.
export function pricesAt(
  unit: ResolveUnit,
  store: TradeStore,
  since: number
): Record<string, number> {
  const out: Record<string, number> = {}
  if (unit.kind === 'choose-one') {
    for (const o of unit.options)
      out[o.value] = clampProb(
        priceAt(store, seriesKey(unit.contractId, o.value), since) ?? o.prob
      )
    return out
  }
  const yes = priceAt(store, seriesKey(unit.contractId, unit.answerId), since)
  for (const o of unit.options)
    out[o.value] =
      yes === undefined
        ? o.prob
        : clampProb(o.value === 'YES' ? yes : 1 - yes)
  return out
}

export type Move = {
  unit: ResolveUnit
  // The option that gained the most over the window.
  option: UnitOption
  from: number
  to: number
  trades: number
}

// Units that traded since `since`, each with the option that gained the
// most, biggest gain first. Gains under `minChange` are left out.
export function movesSince(
  units: ResolveUnit[],
  store: TradeStore,
  since: number,
  minChange = 0
): Move[] {
  const moves: Move[] = []
  for (const unit of units) {
    const trades = tradesSince(unit, store, since)
    if (!trades) continue
    const then = pricesAt(unit, store, since)
    let best: Move | undefined
    for (const option of unit.options) {
      const from = then[option.value]
      if (!best || option.prob - from > best.to - best.from)
        best = { unit, option, from, to: option.prob, trades }
    }
    const gain = best ? best.to - best.from : 0
    if (best && gain > 1e-9 && gain >= minChange) moves.push(best)
  }
  return moves.sort(
    (a, b) =>
      b.to - b.from - (a.to - a.from) || a.unit.race.localeCompare(b.unit.race)
  )
}

// The current leader and its price at `since`.
export function leaderChange(
  unit: ResolveUnit,
  store: TradeStore,
  since: number
) {
  return {
    option: unit.leader,
    from: pricesAt(unit, store, since)[unit.leader.value],
    to: unit.leader.prob,
  }
}

export const resolvedSince = (units: ResolveUnit[], since: number) =>
  units
    .filter((u) => u.resolved && (u.resolutionTime ?? 0) > since)
    .sort((a, b) => (b.resolutionTime ?? 0) - (a.resolutionTime ?? 0))
