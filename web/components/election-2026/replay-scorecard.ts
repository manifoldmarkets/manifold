import { mean } from 'lodash'
import { Contract } from 'common/contract'
import { POLLS_CLOSE_2026 } from 'web/components/usa-map/election-rewind-model'
import {
  ComparisonSeries,
  comparisonsAt,
  ReplayChamber,
} from './replay-comparisons'
import { ReplaySnapshot, snapshotProb } from './replay-model'

export type ChamberWinner = 'D' | 'R'

// The winner of a chamber-control market (YES = Republicans), once resolved.
export const chamberWinner = (
  contract: Contract | null | undefined
): ChamberWinner | undefined =>
  contract?.isResolved && contract.resolution === 'YES'
    ? 'R'
    : contract?.isResolved && contract.resolution === 'NO'
    ? 'D'
    : undefined

export type ReplayChambers = {
  [chamber in ReplayChamber]: { id?: string; winner?: ChamberWinner }
}

// Manifold against another market on one chamber, over the milestones up to
// the first poll closings: the forecast, before any results. Points are how
// much more Manifold put on the winner (once the chamber's market resolved)
// or on the Democrats (before), on average; `ahead` counts the milestones
// where that was at least a point. Page props, so no undefined.
export type ChamberScore = {
  chamber: ReplayChamber
  winner: ChamberWinner | null
  source: string
  compared: number
  ahead: number
  averagePoints: number
}

export function chamberScores(
  snapshot: ReplaySnapshot,
  series: ComparisonSeries[],
  chambers: ReplayChambers
): ChamberScore[] {
  const other = series[0]
  if (!other) return []
  const forecast = snapshot.milestones.filter((m) => m.time <= POLLS_CLOSE_2026)
  return (['senate', 'house'] as const).flatMap((chamber) => {
    const { id, winner } = chambers[chamber]
    const party = winner ?? 'D'
    const share = (rep: number) => (party === 'R' ? rep : 1 - rep)
    const edges = forecast.flatMap((m) => {
      const ours = snapshotProb(snapshot, id, m.frame)
      const theirs = comparisonsAt([other], chamber, m.time)[0]?.republicanProb
      if (ours === undefined || theirs === undefined) return []
      const edge = (share(ours) - share(theirs)) * 100
      return Number.isFinite(edge) ? [edge] : []
    })
    if (edges.length === 0) return []
    return [
      {
        chamber,
        winner: winner ?? null,
        source: other.source,
        compared: edges.length,
        ahead: edges.filter((e) => e >= 0.5).length,
        averagePoints: Math.round(mean(edges)),
      },
    ]
  })
}

export const chamberName = (chamber: ReplayChamber) =>
  chamber === 'senate' ? 'Senate' : 'House'

export const partyName = (party: ChamberWinner) =>
  party === 'D' ? 'Democrats' : 'Republicans'

const pts = (n: number) => `${Math.abs(n)} ${Math.abs(n) === 1 ? 'pt' : 'pts'}`

// "+4 pts", "−1 pt", "0 pts".
export const signedPoints = (n: number) =>
  `${n > 0 ? '+' : n < 0 ? '−' : ''}${pts(n)}`

// The headline claims the scores support, and nothing more: which chambers
// were won, and whether Manifold had the Democrats further ahead at every
// forecast milestone in every chamber (when that's the side it measured).
export function replayStory(scores: ChamberScore[]) {
  const won = scores.filter((s) => s.winner !== null)
  const sawIt = won.some((s) => s.averagePoints > 0 && s.ahead === s.compared)
  const demsAheadEverywhere =
    scores.length > 0 &&
    scores.every(
      (s) =>
        (s.winner ?? 'D') === 'D' && s.compared > 0 && s.ahead === s.compared
    )
  const winners = (['D', 'R'] as const).flatMap((party) => {
    const chambers = won.filter((s) => s.winner === party)
    return chambers.length
      ? [
          `${partyName(party)} won the ${chambers
            .map((s) => chamberName(s.chamber))
            .join(' and the ')}.`,
        ]
      : []
  })
  return { sawIt, demsAheadEverywhere, winners }
}
