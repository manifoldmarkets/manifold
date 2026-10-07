import candidates from 'web/public/data/election-candidates-2026.json'
import type { ElectionMode, Race } from './election-map-model'
import type { Odds } from './election-odds'

export type BallotCandidate = {
  name: string
  party: 'D' | 'R' | 'I' | 'L' | 'G' | 'other' | 'unknown'
}

const DATA = candidates as Record<
  ElectionMode,
  Record<string, BallotCandidate[]>
>

export const raceCandidates = (mode: ElectionMode, id: string) =>
  DATA[mode][id] ?? []

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
