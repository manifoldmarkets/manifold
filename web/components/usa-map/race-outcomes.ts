// Turns raw market answers ("Democrats", "Josh Turek (Democrat)", "Independent
// (Dan Osborn)", "Another candidate") into one consistent set of race-panel
// rows: a party label, the candidate as a subtitle, and whether the outcome
// is on the certified ballot. Display only: party totals and map colors are
// computed elsewhere (audited-sources.ts, election-map-model.ts).

import { getDisplayProbability } from 'common/calculate'
import { BinaryContract, Contract } from 'common/contract'
import { AuditedParty, complementParty, sourceAudit } from './audited-sources'
import type { BallotCandidate } from './election-candidates'
import type { ElectionMode, Race } from './election-map-model'
import type { Odds } from './election-odds'
import { isDemocraticAnswer, isRepublicanAnswer } from './state-election-map'

// 'any' is the NO side of a one-sided question: any other winner.
export type OutcomeParty = BallotCandidate['party'] | 'any'

export type OutcomeRow = {
  key: string
  party: OutcomeParty
  label: string
  subtitle?: string
  prob: number
  onBallot: boolean
}

const PARTY_LABELS: Record<OutcomeParty, string> = {
  D: 'Democratic',
  R: 'Republican',
  I: 'Independent',
  L: 'Libertarian',
  G: 'Green',
  other: 'Other',
  unknown: 'Other',
  any: 'Any other winner',
}
export const partyLabel = (party: OutcomeParty) => PARTY_LABELS[party]

// Below this, an outcome that is not on the ballot folds under "+N more".
export const MINOR_OUTCOME = 0.01

const PARTY_WORDS =
  /^(?:the\s+)?(?:democrat(?:ic|s)?|dems?|republicans?|gop|independents?|libertarians?|greens?|third[\s-]party)(?:\s+party)?$/i
const PARTY_TAG =
  /^(?:D|R|I|L|G|DFL|Dem\.?|Rep\.?|Democrat(?:ic)?|Republican|Independent|Libertarian|Green|incumbent|inc\.?)$/i
const GENERIC =
  /^(?:(?:an?|any|some)\s*)?(?:other|another|else|field|none|third[\s-]party\s*\/?\s*other|any other winner|someone else|other candidates?|another candidate|write[\s-]?in)\b/i

// The person an answer names, if any: "Josh Turek (Democrat)" → "Josh
// Turek", "Independent (Dan Osborn)" → "Dan Osborn", "Democrats" → none.
export function candidateName(text: string): string | undefined {
  const inside = Array.from(text.matchAll(/\(([^()]*)\)/g)).map((m) =>
    m[1].trim()
  )
  const outside = text
    .replace(/\([^()]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const isName = (value: string) =>
    !!value &&
    /[a-z]/i.test(value) &&
    !PARTY_WORDS.test(value) &&
    !PARTY_TAG.test(value) &&
    !GENERIC.test(value) &&
    !/\bor\b|\//i.test(value)
  if (isName(outside)) return outside
  return inside.find(isName)
}

export const isGenericAnswer = (text: string) =>
  GENERIC.test(text.trim()) ||
  Array.from(text.matchAll(/\(([^()]*)\)/g)).some((m) => GENERIC.test(m[1]))

const normalizeName = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .split(/\s+/)
    .filter((part) => part && !/^(?:jr|sr|ii|iii|iv)$/.test(part))

// Same person, allowing for middle names/initials and suffixes.
export function sameCandidate(a: string, b: string) {
  const x = normalizeName(a)
  const y = normalizeName(b)
  if (!x.length || !y.length) return false
  if (x.join(' ') === y.join(' ')) return true
  return x[0] === y[0] && x[x.length - 1] === y[y.length - 1]
}

export const ballotMatch = (name: string, ballot: BallotCandidate[]) =>
  ballot.find((c) => sameCandidate(c.name, name))

// The party an answer is counted under: the audited classification when the
// source has one, otherwise the same label reading the map uses.
export function answerParty(
  text: string,
  audited?: AuditedParty,
  ballot: BallotCandidate[] = []
): BallotCandidate['party'] {
  if (audited) return audited === 'withdrawn' ? 'unknown' : audited
  if (isDemocraticAnswer(text)) return 'D'
  if (isRepublicanAnswer(text)) return 'R'
  if (/independent|\(\s*I\s*\)/i.test(text)) return 'I'
  if (/libertarian|\(\s*L\s*\)/i.test(text)) return 'L'
  if (/\bgreen party\b|\(\s*G\s*\)/i.test(text)) return 'G'
  const name = candidateName(text)
  return (name && ballotMatch(name, ballot)?.party) || 'other'
}

const soleNominee = (party: OutcomeParty, ballot: BallotCandidate[]) => {
  const nominees = ballot.filter((c) => c.party === party)
  return nominees.length === 1 ? nominees[0].name : undefined
}

export function outcomeRow(
  answer: { id: string; text: string; prob: number },
  ballot: BallotCandidate[],
  audited?: AuditedParty
): OutcomeRow {
  const { id, text, prob } = answer
  const party = answerParty(text, audited, ballot)
  const name = candidateName(text)
  const generic = !name && isGenericAnswer(text)
  const majorParty = party === 'D' || party === 'R' || party === 'I'
  const label =
    /democrat.*\bor\b.*independent/i.test(text) && party === 'D'
      ? 'Democratic or Independent'
      : partyLabel(party)
  const subtitle =
    name ??
    (generic
      ? 'Any other candidate'
      : majorParty
      ? soleNominee(party, ballot)
      : party === 'unknown' || party === 'other'
      ? text.trim()
      : undefined)
  const onBallot =
    ballot.length === 0 ||
    (name
      ? !!ballotMatch(name, ballot)
      : !generic && ballot.some((c) => c.party === party))
  return {
    key: id,
    party,
    label,
    subtitle: subtitle && subtitle !== label ? subtitle : undefined,
    prob,
    onBallot,
  }
}

export const isMinorOutcome = (row: OutcomeRow) =>
  row.party !== 'any' && !row.onBallot && row.prob < MINOR_OUTCOME

// Rows by odds; minor rows (under 1% and not on the ballot) fold away.
export function arrangeOutcomes(rows: OutcomeRow[]) {
  const sorted = [...rows].sort((a, b) => b.prob - a.prob)
  return {
    shown: sorted.filter((row) => !isMinorOutcome(row)),
    folded: sorted.filter(isMinorOutcome),
  }
}

const PARTY_ORDER: BallotCandidate['party'][] = [
  'D',
  'R',
  'I',
  'L',
  'G',
  'other',
  'unknown',
]
const oddsFor = (party: BallotCandidate['party'], odds?: Odds) =>
  !odds
    ? 0
    : party === 'D'
    ? odds.dem + (odds.notRep ?? 0)
    : party === 'R'
    ? odds.rep + (odds.notDem ?? 0)
    : odds.other

// Ballot lists lead with the parties that can win: by the race's odds, then
// Democrat, Republican, independents and minor parties. Names keep the
// ballot's order within a party.
export function orderBallot(
  candidates: BallotCandidate[],
  odds?: Odds
): BallotCandidate[] {
  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .sort(
      (a, b) =>
        oddsFor(b.candidate.party, odds) - oddsFor(a.candidate.party, odds) ||
        PARTY_ORDER.indexOf(a.candidate.party) -
          PARTY_ORDER.indexOf(b.candidate.party) ||
        a.index - b.index
    )
    .map(({ candidate }) => candidate)
}

const anyOtherWinner = (prob: number): OutcomeRow => ({
  key: 'NO',
  party: 'any',
  label: partyLabel('any'),
  prob,
  onBallot: true,
})

// Binary sources: an audited party question ("Will a Democrat win?"), a
// candidate question, or a legacy "Will the Republican win?" market. NO is
// the other major party only where that party has a nominee on the ballot.
export function binaryRows(
  contract: BinaryContract,
  race: Pick<Race, 'id' | 'candidates'>,
  mode: ElectionMode
): { YES: OutcomeRow; NO: OutcomeRow } {
  const ballot = race.candidates ?? []
  const audit = sourceAudit(contract.slug)
  const matched = audit?.contractId === contract.id ? audit : undefined
  const yesProb = getDisplayProbability(contract)
  if (matched?.kind === 'candidate-binary') {
    // A bet on one person, not on the party: the name leads.
    const raw = matched.candidate ?? 'The named candidate'
    const name = candidateName(raw) ?? raw
    const party = ballotMatch(name, ballot)?.party ?? 'unknown'
    return {
      YES: {
        key: 'YES',
        party,
        label: name,
        subtitle:
          party === 'unknown' || party === 'other'
            ? undefined
            : `${partyLabel(party)} candidate`,
        prob: yesProb,
        onBallot: true,
      },
      NO: anyOtherWinner(1 - yesProb),
    }
  }
  const yesParty =
    matched?.kind === 'party-binary' ? matched.binaryYes ?? 'R' : 'R'
  const noParty = complementParty(mode, race.id, yesParty)
  const yes = outcomeRow(
    { id: 'YES', text: partyLabel(yesParty), prob: yesProb },
    ballot
  )
  const no = noParty
    ? outcomeRow(
        { id: 'NO', text: partyLabel(noParty), prob: 1 - yesProb },
        ballot
      )
    : anyOtherWinner(1 - yesProb)
  return {
    YES: { ...yes, onBallot: true },
    NO: { ...no, onBallot: true },
  }
}

// A district's question in a "Which districts will Democrats win?"
// portfolio: YES is the Democrat, NO everyone else (the Republican wherever
// one is on the ballot).
export function districtRows(
  dem: number,
  race: Pick<Race, 'id' | 'candidates'>
): OutcomeRow[] {
  const ballot = race.candidates ?? []
  const noIsRep = complementParty('house', race.id, 'D') === 'R'
  return [
    {
      ...outcomeRow({ id: 'YES', text: 'Democratic', prob: dem }, ballot),
      onBallot: true,
    },
    noIsRep
      ? {
          ...outcomeRow(
            { id: 'NO', text: 'Republican', prob: 1 - dem },
            ballot
          ),
          onBallot: true,
        }
      : anyOtherWinner(1 - dem),
  ]
}

// The reader-facing line inside "About this market" for sources whose own
// rules leave cases open (audit confidence "conditional").
export const UNSPECIFIED_RULES =
  'This market’s own rules don’t spell out every case (such as how independents or recounts are handled).'

// What a race panel says about its source, written here for readers. The
// audit's `caveats` are internal review notes and are never shown.
// - `bet`: what a Yes/No means, always visible (candidate bets only).
// - `unspecifiedRules`: show the closed "About this market" disclosure.
export function sourceNotes(contract: Pick<Contract, 'id' | 'slug'>): {
  bet?: string
  unspecifiedRules: boolean
} {
  const audit = sourceAudit(contract.slug)
  if (!audit || audit.contractId !== contract.id)
    return { unspecifiedRules: false }
  const name = audit.candidate
    ? candidateName(audit.candidate) ?? audit.candidate
    : undefined
  return {
    bet:
      audit.kind === 'candidate-binary'
        ? `Yes = ${
            name ?? 'the named candidate'
          } wins; No = anyone else, including another candidate from the same party.`
        : audit.kind === 'candidate'
        ? 'Bets are on the named candidates, not on their parties.'
        : undefined,
    unspecifiedRules: audit.confidence === 'conditional',
  }
}
