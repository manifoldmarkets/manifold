import candidates from 'web/public/data/election-candidates-2026.json'
import type { ElectionMode, Race } from './election-map-model'
import type { Odds } from './election-odds'

export type BallotCandidate = {
  name: string
  party: 'D' | 'R' | 'I' | 'L' | 'G' | 'other' | 'unknown'
}

const DATA = candidates as Record<
  ElectionMode,
  Record<string, Partial<BallotCandidate>[]>
>

// The data can hold an entry without a name (CO-1 had one with only a party).
// It can't be shown or matched to an answer, and name matching assumes a
// string, so drop it here, where every reader gets the ballot.
const hasName = (c: Partial<BallotCandidate>): c is BallotCandidate =>
  typeof c.name === 'string' && c.name.trim() !== '' && !!c.party

export const raceCandidates = (
  mode: ElectionMode,
  id: string
): BallotCandidate[] => (DATA[mode][id] ?? []).filter(hasName)

// A party price may cover a replacement nominee. Names are ballot context,
// never a reinterpretation of NO, a catch-all answer or a same-party contest.
export function candidateForParty(race: Race, party?: keyof Odds) {
  if (party !== 'dem' && party !== 'rep') return undefined
  if (race.basis?.kind === 'ballot' || race.basis?.kind === 'decided')
    return undefined
  const nominees = race.candidates?.filter(
    (c) => c.party === (party === 'dem' ? 'D' : 'R')
  )
  return nominees?.length === 1 ? nominees[0].name : undefined
}
