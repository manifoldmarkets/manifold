// Pure model for the "Ballot measures" election tab.
//
// A state can have several unrelated measures, so the map shows counts, not
// one aggregate probability, and never a D/R balance. Each measure is priced
// by exactly one audited source:
// - a binary whose YES means approval (or, for a reverse-worded market,
//   rejection — `yesOrientation: 'reject'`), or
// - one answer of an independent multi-answer portfolio ("which measures
//   pass"). Portfolio answers are independent: never normalise them.
// Pass/Fail buttons trade the exact contract outcome that matches the side.

import { getAnswerProbability, getDisplayProbability } from 'common/calculate'
import { Contract, isMultiCpmm } from 'common/contract'
import data from 'web/public/data/ballot-measures-2026.json'

export type MeasureSource =
  | {
      kind: 'binary'
      contractId: string
      slug: string
      yesOrientation: 'approve' | 'reject'
      confidence: 'confirmed' | 'conditional'
      criteriaNote?: string
      offBallot?: string
    }
  | {
      kind: 'portfolio-answer'
      contractId: string
      slug: string
      answerId: string
      yesOrientation: 'approve'
      confidence: 'confirmed' | 'conditional'
      criteriaNote?: string
      offBallot?: string
    }

export type BallotMeasure = {
  key: string
  state: string
  designation: string | null // official label, e.g. "Proposition 50"
  title: string
  shortSummary: string
  topic: string
  officialSourceUrl: string
  approvalRule: string
  aliases?: string[]
  yesMeans?: string
  noMeans?: string
  coverage?: string
  verification?: string
  marketNote?: string
  // undefined: no linked market yet (planned or held), distinct from a
  // state having no statewide measures at all.
  source?: MeasureSource
}

export const BALLOT_MEASURES = (data.measures as BallotMeasure[]).slice().sort(
  (a, b) =>
    a.state.localeCompare(b.state) ||
    (a.designation ?? a.title).localeCompare(b.designation ?? b.title, 'en', {
      numeric: true,
    })
)
export const MEASURE_CONTRACT_IDS = [
  ...new Set(
    BALLOT_MEASURES.flatMap((m) => (m.source ? [m.source.contractId] : []))
  ),
]
export const measureColor = (count: number) =>
  count === 0
    ? undefined
    : count < 3
    ? '#b9ddd6'
    : count < 6
    ? '#79b9ac'
    : count < 10
    ? '#408c80'
    : '#24665d'

export type MeasureSide = 'pass' | 'fail'

// Chance the measure is approved, from its audited source; undefined when the
// source is missing, cancelled or not the expected contract.
export function approvalChance(
  measure: BallotMeasure,
  contract: Contract | null | undefined
): number | undefined {
  const s = measure.source
  if (!s || !contract || contract.id !== s.contractId) return undefined
  if (contract.resolution === 'CANCEL') return undefined
  if (s.kind === 'binary') {
    if (contract.mechanism !== 'cpmm-1' || contract.outcomeType !== 'BINARY')
      return undefined
    const yes = getDisplayProbability(contract)
    return Number.isFinite(yes)
      ? s.yesOrientation === 'approve'
        ? yes
        : 1 - yes
      : undefined
  }
  if (!isMultiCpmm(contract) || contract.shouldAnswersSumToOne) return undefined
  const answer = contract.answers.find((a) => a.id === s.answerId)
  if (!answer || answer.resolution === 'CANCEL') return undefined
  const chance = getAnswerProbability(contract, answer.id)
  return Number.isFinite(chance) ? chance : undefined
}

// The probability shown on a side's button; the two sides always complement.
export const sideProbability = (chance: number, side: MeasureSide) =>
  side === 'pass' ? chance : 1 - chance

// What a Pass/Fail click must submit: the exact contract outcome (and answer
// for a portfolio). A reverse-worded binary flips YES/NO.
export function tradeFor(
  measure: BallotMeasure,
  side: MeasureSide
):
  | { contractId: string; outcome: 'YES' | 'NO'; answerId?: string }
  | undefined {
  const s = measure.source
  if (!s) return undefined
  const approveIsYes = s.yesOrientation === 'approve'
  const outcome = (side === 'pass') === approveIsYes ? 'YES' : 'NO'
  return s.kind === 'portfolio-answer'
    ? { contractId: s.contractId, outcome, answerId: s.answerId }
    : { contractId: s.contractId, outcome }
}

export type StateMeasureStatus =
  | { kind: 'no-measures' }
  | { kind: 'measures'; total: number; linked: number; unlinked: number }

// Counts per state for the map. States with no statewide measure on the
// Nov 3 ballot are kept and labelled, not dropped or shown as unpriced.
export function stateMeasureStatus(
  states: string[],
  measures: BallotMeasure[]
): Record<string, StateMeasureStatus> {
  const out: Record<string, StateMeasureStatus> = {}
  for (const st of states) {
    const here = measures.filter((m) => m.state === st)
    out[st] = here.length
      ? {
          kind: 'measures',
          total: here.length,
          linked: here.filter((m) => m.source).length,
          unlinked: here.filter((m) => !m.source).length,
        }
      : { kind: 'no-measures' }
  }
  return out
}

const NUMBER_WORDS: Record<string, string> = {
  prop: 'proposition',
  q: 'question',
  amend: 'amendment',
  sq: 'state question',
}

// Search by state (name or code), designation ("prop 50", "Q6", "amendment 3",
// "SQ 845") or topic/subject words.
export function matchesMeasureQuery(
  measure: BallotMeasure,
  query: string,
  stateName: string
) {
  const q = query.trim().toLowerCase().replace(/[–—]/g, '-')
  if (!q) return true
  if (q === measure.state.toLowerCase() || q === stateName.toLowerCase())
    return true
  const designation = (measure.designation ?? '').toLowerCase()
  const num =
    /^(?:([a-z]{2})\s+)?(prop|proposition|q|question|amend|amendment|issue|measure|sq|state question)?\.?\s*#?\s*([0-9]{1,4}|[a-z]{1,2})$/.exec(
      q
    )
  if (num && num[3] && designation) {
    const [, st, kind, value] = num
    if (st && st !== measure.state.toLowerCase()) return false
    const k = kind ? NUMBER_WORDS[kind] ?? kind : undefined
    const re = new RegExp(`(^|\\s)${k ? `${k}\\s+` : ''}${value}$`, 'i')
    if (re.test(designation)) return true
    if (!k && designation.endsWith(` ${value}`)) return true
  }
  const normalize = (s: string) =>
    s
      .toLowerCase()
      .replace(/\bprop\.?\s*(?=\d)/g, 'proposition ')
      .replace(/\bq\.?\s*(?=\d)/g, 'question ')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
  const haystack = normalize(
    `${measure.state} ${stateName} ${designation} ${measure.title} ${
      measure.shortSummary
    } ${measure.topic} ${(measure.aliases ?? []).join(' ')}`
  )
  const tokens = new Set(haystack.split(' '))
  return normalize(q)
    .split(' ')
    .every((word) => tokens.has(word))
}
