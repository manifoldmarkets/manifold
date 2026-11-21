// Audited semantics for 2026 election sources (October 3, 2026 audit).
//
// Label text is not a resolution rule: "(D)" on a candidate, "Democrats OR
// Independents", or an untagged name says nothing reliable about the ballot
// party a source settles on. This module lets the map read a source by its
// audited meaning instead:
// - party binaries carry their YES orientation (several deep ones are YES = D);
// - a candidate binary ("Will Lauren Boebert win?") counts as its candidate's
//   party only when they are that party's sole nominee on the race's ballot,
//   read like a one-sided party price; otherwise it is not a party source
//   (NO is any other winner);
// - multi-choice answers are classified by an audited answerId → party map;
// - same-party ballots (both finalists of one party, per the certified list)
//   count once for that party by ballot composition, not by a market price;
// - seats decided before Election Day (unopposed, not on the ballot) count by
//   that fact;
// - a one-sided price ("will the Democrat win?") counts its complement as the
//   other major party wherever that party has a nominee (complementParty).
// Sources without an audit entry keep the existing label-based reading.

import { getAnswerProbability, getDisplayProbability } from 'common/calculate'
import { Contract, isMultiCpmm } from 'common/contract'
import audit from 'web/public/data/election-source-audit-2026.json'
import { raceCandidates, sameCandidate } from './election-candidates'
import type { ElectionMode } from './election-map-model'
import { normalizeOdds, Odds } from './election-odds'

export type AuditedParty =
  | 'D'
  | 'R'
  | 'I'
  | 'L'
  | 'G'
  | 'other'
  | 'unknown'
  | 'withdrawn'

export type SourceAudit = {
  contractId: string
  kind:
    | 'ballot-party'
    | 'candidate'
    | 'party-binary'
    | 'candidate-binary'
    | 'dem-win-portfolio-answer'
  confidence: 'confirmed' | 'conditional'
  races: { raceKey: string; office: string; key: string }[]
  binaryYes?: 'D' | 'R'
  candidate?: string | null
  answerParties?: Record<string, AuditedParty>
  answers?: Record<string, string>
  answerDistricts?: Record<string, string>
  caveats?: string[]
}

export type SeatBasis =
  | { kind: 'market' }
  | { kind: 'ballot'; party: 'D' | 'R'; finalists: string[]; basis: string }
  | { kind: 'decided'; party: 'D' | 'R'; candidate: string; basis: string }
  | { kind: 'candidate-only'; candidate: string | null }

const DATA = audit as unknown as {
  sources: Record<string, SourceAudit>
  sameParty: Record<
    string,
    { party: 'D' | 'R'; finalists: string[]; basis: string }
  >
  decided: Record<
    string,
    { party: 'D' | 'R'; candidate: string; basis: string }
  >
}

export const sourceAudit = (slug?: string): SourceAudit | undefined =>
  slug ? DATA.sources[slug] : undefined

const ELECTION_MODES: string[] = ['house', 'senate', 'governor']
const sourceRace = (source: SourceAudit) => {
  const race = source.races[0]
  return race && ELECTION_MODES.includes(race.office)
    ? { mode: race.office as ElectionMode, id: race.key }
    : undefined
}

// The party a one-sided outcome ("not the Democrat", "not the Republican") is
// counted as: the other major party, whenever it has a nominee on this race's
// general-election ballot or the ballot isn't recorded. Without one, e.g. a
// top-two race between a Democrat and an independent, the complement stays a
// separate outcome.
export function complementParty(
  mode: ElectionMode,
  raceId: string,
  side: 'D' | 'R'
): 'D' | 'R' | undefined {
  const other = side === 'D' ? 'R' : 'D'
  const ballot = raceCandidates(mode, raceId)
  return ballot.length === 0 || ballot.some((c) => c.party === other)
    ? other
    : undefined
}

// Moves notDem into rep and notRep into dem where complementParty allows.
export function foldComplement(
  mode: ElectionMode,
  raceId: string,
  odds: Odds | undefined
): Odds | undefined {
  if (!odds) return odds
  const { notDem, notRep, ...rest } = odds
  const toRep = !!notDem && complementParty(mode, raceId, 'D') === 'R'
  const toDem = !!notRep && complementParty(mode, raceId, 'R') === 'D'
  if (!toRep && !toDem) return odds
  return normalizeOdds({
    ...rest,
    dem: rest.dem + (toDem ? notRep ?? 0 : 0),
    rep: rest.rep + (toRep ? notDem ?? 0 : 0),
    ...(notDem !== undefined && !toRep ? { notDem } : {}),
    ...(notRep !== undefined && !toDem ? { notRep } : {}),
  })
}

// The party a candidate binary's YES stands for: the candidate's, when they
// are that party's only nominee on the race's general-election ballot. Then a
// bet on them is a bet on the party in all but name, and the price reads like a
// one-sided party binary. A primary candidate, a same-party top-two finalist or
// a name not on the ballot gets undefined: that bet is not a party price.
export function candidateBinaryParty(
  source: SourceAudit
): 'D' | 'R' | undefined {
  if (source.kind !== 'candidate-binary' || !source.candidate) return undefined
  const race = sourceRace(source)
  if (!race) return undefined
  const ballot = raceCandidates(race.mode, race.id)
  const named = ballot.filter((c) => sameCandidate(c.name, source.candidate!))
  const party = named.length === 1 ? named[0].party : undefined
  if (party !== 'D' && party !== 'R') return undefined
  return ballot.filter((c) => c.party === party).length === 1
    ? party
    : undefined
}

// The party a binary source's YES is counted as, if any.
const binaryYesParty = (source: SourceAudit) =>
  source.kind === 'party-binary'
    ? source.binaryYes
    : source.kind === 'candidate-binary'
    ? candidateBinaryParty(source)
    : undefined

export function binaryElectionLabels(contract: Contract) {
  const source = sourceAudit(contract.slug)
  const matched = source?.contractId === contract.id ? source : undefined
  const party = matched?.kind === 'party-binary' ? matched.binaryYes : undefined
  const candidate =
    matched?.kind === 'candidate-binary' ? matched.candidate : undefined
  // A sole nominee's bet takes their party's color; NO stays "any other
  // winner", since that is what the market pays out on.
  const yesColor = party ?? (matched && candidateBinaryParty(matched))
  const race = matched && party ? sourceRace(matched) : undefined
  const noParty = race ? complementParty(race.mode, race.id, party!) : undefined
  return {
    YES: {
      pseudonymName:
        candidate ??
        (party === 'D' ? 'Democratic' : party === 'R' ? 'Republican' : 'Yes'),
      pseudonymColor:
        yesColor === 'D'
          ? ('azure' as const)
          : yesColor === 'R'
          ? ('sienna' as const)
          : ('gray' as const),
    },
    NO: {
      pseudonymName:
        noParty === 'R'
          ? 'Republican'
          : noParty === 'D'
          ? 'Democratic'
          : party || candidate
          ? 'Any other winner'
          : 'No',
      pseudonymColor:
        noParty === 'R'
          ? ('sienna' as const)
          : noParty === 'D'
          ? ('azure' as const)
          : ('gray' as const),
    },
  }
}

// Seats whose party outcome is fixed before any market price: same-party
// ballots and races decided without a November contest. The candidate market,
// if any, stays attached for display and betting; it is not the party basis.
// raceId is the map Race.id: a district id like "CA-4" or a state code.
export function seatBasis(raceId: string): SeatBasis {
  const same = DATA.sameParty[raceId]
  if (same) return { kind: 'ballot', ...same }
  const decided = DATA.decided[raceId]
  if (decided) return { kind: 'decided', ...decided }
  return { kind: 'market' }
}

// Every race whose party outcome is fixed before a market can price it.
export const fixedBasisIds = () => [
  ...Object.keys(DATA.sameParty),
  ...Object.keys(DATA.decided),
]

export const basisOdds = (basis: SeatBasis): Odds | undefined =>
  basis.kind === 'ballot' || basis.kind === 'decided'
    ? basis.party === 'D'
      ? { dem: 1, rep: 0, other: 0 }
      : { dem: 0, rep: 1, other: 0 }
    : undefined

// Party odds for a source with an audit entry. Returns undefined when the
// source must not feed party totals (candidate binaries that aren't a sole
// nominee's, cancelled markets, mechanism mismatches) — callers must NOT fall
// back to label parsing then.
export function auditedOdds(
  contract: Contract | null | undefined,
  source: SourceAudit
): Odds | undefined {
  if (!contract || contract.resolution === 'CANCEL') return undefined
  if (contract.id !== source.contractId) return undefined
  if (source.kind === 'party-binary' || source.kind === 'candidate-binary') {
    const yes = binaryYesParty(source)
    if (
      contract.mechanism !== 'cpmm-1' ||
      contract.outcomeType !== 'BINARY' ||
      !yes
    )
      return undefined
    const p = getDisplayProbability(contract)
    const odds = normalizeOdds(
      yes === 'D'
        ? { dem: p, rep: 0, other: 0, notDem: 1 - p }
        : { dem: 0, rep: p, other: 0, notRep: 1 - p }
    )
    const race = sourceRace(source)
    return race ? foldComplement(race.mode, race.id, odds) : odds
  }
  if (source.kind === 'ballot-party' || source.kind === 'candidate') {
    if (!isMultiCpmm(contract) || !contract.shouldAnswersSumToOne)
      return undefined
    const odds: Odds = { dem: 0, rep: 0, other: 0 }
    for (const answer of contract.answers) {
      if (answer.resolution === 'CANCEL') continue
      const party = source.answerParties?.[answer.id] ?? 'unknown'
      const bucket =
        party === 'D'
          ? 'dem'
          : party === 'R'
          ? 'rep'
          : party === 'unknown' || party === 'withdrawn'
          ? 'unknown'
          : 'other'
      odds[bucket] =
        (odds[bucket] ?? 0) + getAnswerProbability(contract, answer.id)
    }
    return normalizeOdds(odds)
  }
  return undefined
}

// One call for the map: what to count for this race, and why.
export function raceOdds(
  mode: ElectionMode,
  raceId: string,
  contract: Contract | null | undefined,
  slug: string | undefined,
  fallback: (contract: Contract | null | undefined) => Odds | undefined
): { odds?: Odds; basis: SeatBasis; audited: boolean } {
  const basis = seatBasis(raceId)
  const fixed = basisOdds(basis)
  if (fixed) return { odds: fixed, basis, audited: true }
  const source = sourceAudit(slug)
  if (!source)
    return {
      odds: foldComplement(mode, raceId, fallback(contract)),
      basis,
      audited: false,
    }
  if (source.kind === 'candidate-binary' && !candidateBinaryParty(source))
    return {
      odds: undefined,
      basis: { kind: 'candidate-only', candidate: source.candidate ?? null },
      audited: true,
    }
  return {
    odds: foldComplement(mode, raceId, auditedOdds(contract, source)),
    basis,
    audited: true,
  }
}
