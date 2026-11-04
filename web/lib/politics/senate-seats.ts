import { sortBy, sumBy } from 'lodash'

import { getAnswerProbability } from 'common/calculate'
import { MultiContract } from 'common/contract'

// Democrats need 51 seats for a majority: at 50–50, Vice President Vance
// breaks ties for the Republicans.
export const DEM_SENATE_MAJORITY = 51

// One answer of the "how many seats will the Democrats hold" market.
export type SeatBucket = {
  answerId: string
  label: string
  // The seat count, for answers that are a plain whole number ("53").
  // Undefined for Other and any answer that is not a single count.
  seats: number | undefined
  prob: number
  // The chance 24 hours ago, when known.
  dayAgoProb: number | undefined
}

export type SeatDistribution = {
  // Seat counts in ascending order, then the answers that are not a count,
  // with Other last.
  buckets: SeatBucket[]
  // The most likely seat count (Other never counts as one).
  mostLikely: SeatBucket | undefined
  // Total chance on the listed counts each side of the majority line.
  short: { prob: number; min: number; max: number } | undefined
  majority: { prob: number; min: number; max: number } | undefined
}

const clamp01 = (p: number) => Math.min(1, Math.max(0, p))

export const parseSeatCount = (text: string): number | undefined => {
  const match = /^\s*(\d{1,3})\s*$/.exec(text)
  return match ? Number(match[1]) : undefined
}

// A resolved market pays by its resolution, not its last price: the winner
// (or the MKT split), and nothing for a cancelled one.
function settledProb(contract: MultiContract, answerId: string) {
  const { isResolved, resolution, resolutions } = contract
  if (!isResolved || !resolution || resolution === 'CANCEL') return undefined
  if (resolutions) return (resolutions[answerId] ?? 0) / 100
  if (resolution === 'MKT') return undefined
  return resolution === answerId ? 1 : 0
}

// What each answer was 24 hours ago, read from a page snapshot: live bets move
// an answer's probability but not its stored probChanges, so subtracting
// those from a live probability would drift. probChanges refresh about every
// 20 minutes, so moves since the last refresh are not in the baseline yet.
export function dayAgoProbs(contract: MultiContract): Record<string, number> {
  const probs: Record<string, number> = {}
  for (const answer of contract.answers) {
    const day = answer.probChanges?.day
    const prob = getAnswerProbability(contract, answer.id)
    if (Number.isFinite(day) && Number.isFinite(prob))
      probs[answer.id] = clamp01(prob - day)
  }
  return probs
}

export function seatDistribution(
  contract: MultiContract,
  dayAgo: Record<string, number> = {}
): SeatDistribution {
  const buckets = contract.answers
    .filter((a) => a.resolution !== 'CANCEL')
    .map((a): SeatBucket => {
      const prob =
        settledProb(contract, a.id) ?? getAnswerProbability(contract, a.id)
      return {
        answerId: a.id,
        label: a.isOther ? 'Other' : a.text.trim(),
        seats: a.isOther ? undefined : parseSeatCount(a.text),
        prob: Number.isFinite(prob) ? clamp01(prob) : 0,
        dayAgoProb: dayAgo[a.id],
      }
    })
  const ordered = sortBy(
    buckets,
    (b) => (b.seats === undefined ? 1 : 0),
    (b) => (b.label === 'Other' ? 1 : 0),
    (b) => b.seats ?? 0,
    (b) => contract.answers.findIndex((a) => a.id === b.answerId)
  )
  const counts = ordered.filter((b) => b.seats !== undefined)
  const side = (inSide: (seats: number) => boolean) => {
    const group = counts.filter((b) => inSide(b.seats as number))
    if (!group.length) return undefined
    return {
      prob: sumBy(group, (b) => b.prob),
      min: group[0].seats as number,
      max: group[group.length - 1].seats as number,
    }
  }
  return {
    buckets: ordered,
    mostLikely: counts.reduce<SeatBucket | undefined>(
      (best, b) => (!best || b.prob > best.prob ? b : best),
      undefined
    ),
    short: side((seats) => seats < DEM_SENATE_MAJORITY),
    majority: side((seats) => seats >= DEM_SENATE_MAJORITY),
  }
}

// Who would run the Senate with this many Democratic seats.
export const seatOutcome = (seats: number) =>
  seats >= DEM_SENATE_MAJORITY
    ? 'Democratic majority'
    : seats === DEM_SENATE_MAJORITY - 1
    ? '50–50, Vance breaks ties'
    : 'Republican majority'
