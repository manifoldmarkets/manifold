import { TennisTiming } from './tennis-time'

export type TennisTour = 'atp' | 'wta'
export type TennisPlayer = { id: number; name: string }
export type TennisRound = 'R32' | 'R16' | 'QF' | 'SF' | 'F'
export type TennisPlayerSet = { games: number; tiebreak: number | null }
export type TennisSide = TennisPlayer & {
  sets: TennisPlayerSet[]
  points: string | null
  serving: boolean
}
export type TennisMatch = {
  tour: TennisTour
  id: number
  eventId: string
  tournament: { id: number; season: number; name: string }
  round: TennisRound | null
  eligibleRound: boolean
  bestOf: 3 | 5
  timing: TennisTiming | null
  sides: [TennisSide, TennisSide]
  status:
    | 'scheduled'
    | 'live'
    | 'final'
    | 'suspended'
    | 'canceled'
    | 'unavailable'
  attention: 'walkover' | 'retired' | 'defaulted' | 'status' | 'scores' | null
  winnerId: number | null
}
export const tennisRoundNames: Record<TennisRound, string> = {
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarterfinal',
  SF: 'Semifinal',
  F: 'Final',
}
export function tennisMatchTitle(match: TennisMatch) {
  const [a, b] = match.sides
  return (
    a.name +
    ' vs ' +
    b.name +
    ', ' +
    match.tournament.name +
    (match.round ? ' ' + match.round : '')
  )
}

// A listing is grouped by published round. BDL supplies neither draw slots nor progression edges.
export function tennisDraw(
  matches: readonly TennisMatch[],
  tour: TennisTour,
  tournamentId: number,
  season: number
) {
  const byId = new Map<number, TennisMatch>()
  const ambiguous = new Set<number>()
  for (const m of matches) {
    if (
      m.tour !== tour ||
      m.tournament.id !== tournamentId ||
      m.tournament.season !== season
    )
      continue
    if (byId.has(m.id)) ambiguous.add(m.id)
    else byId.set(m.id, m)
  }
  const all = [...byId.values()].filter(
    (m) => m.eligibleRound && !ambiguous.has(m.id)
  )
  return (Object.keys(tennisRoundNames) as TennisRound[])
    .map((round) => ({
      round,
      matches: all
        .filter((m) => m.round === round)
        .sort(
          (a, b) =>
            (a.timing?.earliestStart ?? Infinity) -
              (b.timing?.earliestStart ?? Infinity) || a.id - b.id
        ),
    }))
    .filter((group) => group.matches.length)
}
