// Audited semantics for 2026 election sources (October 3, 2026 audit).
//
// Label text is not a resolution rule: "(D)" on a candidate, "Democrats OR
// Independents", or an untagged name says nothing reliable about the ballot
// party a source settles on. This module lets the map read a source by its
// audited meaning instead:
// - party binaries carry their YES orientation (several deep ones are YES = D);
// - candidate binaries are never party sources (NO is any other winner);
// - multi-choice answers are classified by an audited answerId → party map;
// - same-party ballots (both finalists of one party, per the certified list)
//   count once for that party by ballot composition, not by a market price;
// - seats decided before Election Day (unopposed, not on the ballot) count by
//   that fact.
// Sources without an audit entry keep the existing label-based reading.

import { getAnswerProbability, getDisplayProbability } from 'common/calculate'
import { Contract } from 'common/contract'
import audit from 'web/public/data/election-source-audit-2026.json'
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

export function binaryElectionLabels(contract: Contract) {
  const source = sourceAudit(contract.slug)
  const matched = source?.contractId === contract.id ? source : undefined
  const party = matched?.kind === 'party-binary' ? matched.binaryYes : undefined
  const candidate =
    matched?.kind === 'candidate-binary' ? matched.candidate : undefined
  return {
    YES: {
      pseudonymName:
        candidate ??
        (party === 'D' ? 'Democratic' : party === 'R' ? 'Republican' : 'Yes'),
      pseudonymColor:
        party === 'D'
          ? ('azure' as const)
          : party === 'R'
          ? ('sienna' as const)
          : ('gray' as const),
    },
    NO: {
      pseudonymName: party || candidate ? 'Any other winner' : 'No',
      pseudonymColor: 'gray' as const,
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
// source must not feed party totals (candidate binaries, cancelled markets,
// mechanism mismatches) — callers must NOT fall back to label parsing then.
export function auditedOdds(
  contract: Contract | null | undefined,
  source: SourceAudit
): Odds | undefined {
  if (!contract || contract.resolution === 'CANCEL') return undefined
  if (contract.id !== source.contractId) return undefined
  if (source.kind === 'candidate-binary') return undefined
  if (source.kind === 'party-binary') {
    if (
      contract.mechanism !== 'cpmm-1' ||
      contract.outcomeType !== 'BINARY' ||
      !source.binaryYes
    )
      return undefined
    const p = getDisplayProbability(contract)
    return normalizeOdds(
      source.binaryYes === 'D'
        ? { dem: p, rep: 0, other: 0, notDem: 1 - p }
        : { dem: 0, rep: p, other: 0, notRep: 1 - p }
    )
  }
  if (source.kind === 'ballot-party' || source.kind === 'candidate') {
    if (
      contract.mechanism !== 'cpmm-multi-1' ||
      !contract.shouldAnswersSumToOne
    )
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
  raceId: string,
  contract: Contract | null | undefined,
  slug: string | undefined,
  fallback: (contract: Contract | null | undefined) => Odds | undefined
): { odds?: Odds; basis: SeatBasis; audited: boolean } {
  const basis = seatBasis(raceId)
  const fixed = basisOdds(basis)
  if (fixed) return { odds: fixed, basis, audited: true }
  const source = sourceAudit(slug)
  if (!source) return { odds: fallback(contract), basis, audited: false }
  if (source.kind === 'candidate-binary')
    return {
      odds: undefined,
      basis: { kind: 'candidate-only', candidate: source.candidate ?? null },
      audited: true,
    }
  return { odds: auditedOdds(contract, source), basis, audited: true }
}
