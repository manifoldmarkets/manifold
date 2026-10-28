import { addDays, toDayNumber } from './stats-window'

// Week-level signals for a daily stat: is this week unusual, compared with the
// stat's own history? Weeks are whole 7-day windows ending at the latest day,
// so day-of-week effects cancel.

export type DayPoint = { x: string; y: number }
export type WeekMean = { start: string; end: string; mean: number }

// A week needs this many of its 7 days to count, or its mean isn't comparable.
const MIN_WEEK_DAYS = 6
// An extreme is flagged when it beats at least half a year of weeks before
// it...
export const MIN_EXTREME_WEEKS = 26
// ...and sits this many typical weekly moves from the recent median, so a
// flat stat edging to a new low isn't news.
const EXTREME_DISTANCE = 2
// A move is unusual at this many times the stat's typical weekly move.
const UNUSUAL_MOVE_FACTOR = 3
// How many earlier weekly moves set "typical" (and weeks, "recent").
const TYPICAL_MOVE_WEEKS = 12
// A run of weekly rises or falls is flagged at this length.
export const MIN_STREAK_WEEKS = 4

// Means of whole weeks ending at lastDay, newest first. The list stops at the
// first week with too few days, so a gap never sits inside it.
export const weeklyMeans = (points: DayPoint[], lastDay: string) => {
  const byDay = new Map<number, number>()
  for (const p of points) {
    const n = toDayNumber(p.x)
    if (Number.isFinite(n) && Number.isFinite(p.y)) byDay.set(n, p.y)
  }
  const last = toDayNumber(lastDay)
  const first = Math.min(...byDay.keys())
  const weeks: WeekMean[] = []
  for (let end = last; end - 6 >= first; end -= 7) {
    let sum = 0
    let days = 0
    for (let n = end - 6; n <= end; n++) {
      const y = byDay.get(n)
      if (y !== undefined) {
        sum += y
        days++
      }
    }
    if (days < MIN_WEEK_DAYS) break
    weeks.push({
      start: addDays(lastDay, end - 6 - last),
      end: addDays(lastDay, end - last),
      mean: sum / days,
    })
  }
  return weeks
}

export type StatSignal =
  // This week is the highest (lowest) since the week ending `since`, the last
  // one at least as high (low), or since the data begins (`sinceStart`).
  | {
      kind: 'high' | 'low'
      weeks: number
      since: string
      sinceStart: boolean
    }
  // This week moved `factor` times as far as the stat typically moves a week.
  | { kind: 'jump' | 'drop'; factor: number }
  // This week is the latest of `weeks` rises (falls) in a row.
  | { kind: 'rising' | 'falling'; weeks: number }

export const signalDirection = (signal: StatSignal) =>
  signal.kind === 'high' || signal.kind === 'jump' || signal.kind === 'rising'
    ? 'up'
    : 'down'

const median = (xs: number[]) => {
  const sorted = [...xs].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// The one thing most worth saying about the latest week, if anything: an
// extreme first, then an unusual move, then a streak. A stat with too little
// history to know what's usual gets none.
export const getStatSignal = (weeks: WeekMean[]): StatSignal | undefined => {
  if (weeks.length < 2) return undefined
  const [current, ...prior] = weeks
  const recent = prior.slice(0, TYPICAL_MOVE_WEEKS + 1)
  const moves = recent.flatMap((w, i) =>
    i + 1 < recent.length ? [w.mean - recent[i + 1].mean] : []
  )
  if (moves.length < TYPICAL_MOVE_WEEKS / 2) return undefined
  const typical = median(moves.map(Math.abs))

  const distance = Math.abs(current.mean - median(recent.map((w) => w.mean)))
  if (distance > 0 && distance >= EXTREME_DISTANCE * typical) {
    for (const kind of ['high', 'low'] as const) {
      const beaten = (w: WeekMean) =>
        kind === 'high' ? w.mean < current.mean : w.mean > current.mean
      const index = prior.findIndex((w) => !beaten(w))
      const run = index === -1 ? prior.length : index
      if (run >= MIN_EXTREME_WEEKS)
        return {
          kind,
          weeks: run,
          since:
            index === -1 ? prior[prior.length - 1].start : prior[index].end,
          sinceStart: index === -1,
        }
    }
  }

  const move = current.mean - prior[0].mean
  if (typical > 0 && Math.abs(move) >= UNUSUAL_MOVE_FACTOR * typical)
    return {
      kind: move > 0 ? 'jump' : 'drop',
      factor: Math.abs(move) / typical,
    }

  for (const kind of ['rising', 'falling'] as const) {
    let run = 0
    while (
      run + 1 < weeks.length &&
      (kind === 'rising'
        ? weeks[run].mean > weeks[run + 1].mean
        : weeks[run].mean < weeks[run + 1].mean)
    )
      run++
    if (run >= MIN_STREAK_WEEKS) return { kind, weeks: run }
  }
  return undefined
}
