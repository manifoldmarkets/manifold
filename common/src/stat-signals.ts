import { addDays, toDayNumber } from './stats-window'

// Week-level signals for a daily stat: is this week unusual, compared with the
// stat's own history? Weeks are whole 7-day windows ending at the latest day,
// so day-of-week effects cancel.

export type DayPoint = { x: string; y: number }
export type WeekMean = { start: string; end: string; mean: number }

// A week needs all 7 days to count: a mean of six days against one of seven
// is biased when the missing day is unknown.
const MIN_WEEK_DAYS = 7
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
// Complete weeks a stat needs before anything about its latest week can be
// called unusual: the latest, plus enough before it for 6 weekly moves.
export const MIN_SIGNAL_WEEKS = TYPICAL_MOVE_WEEKS / 2 + 2
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
  // This week is the highest (lowest) of `weeksBeaten` weeks back to `since`,
  // where `basis` says what's there:
  // - 'week': the week ending `since` was at least as high (low);
  // - 'start': the data begins on `since`;
  // - 'earliest': `since` starts the earliest whole week with no gap after
  //   it, and what came before isn't comparable (a gap, or a partial week).
  | {
      kind: 'high' | 'low'
      weeksBeaten: number
      since: string
      basis: 'week' | 'start' | 'earliest'
    }
  // This week moved `factor` times as far as the stat's typical weekly move
  // over the `baselineWeeks` weekly moves before it.
  | { kind: 'jump' | 'drop'; factor: number; baselineWeeks: number }
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
// history to know what's usual gets none. dataStart is the stat's first day
// with data, to tell the start of the data from a gap.
//
// Comparisons allow for float noise (a mean of six 0.73s against one of seven
// is 0.73 vs 0.7299999999999999): values this close count as equal.
export const getStatSignal = (
  weeks: WeekMean[],
  dataStart: string
): StatSignal | undefined => {
  if (weeks.length < MIN_SIGNAL_WEEKS) return undefined
  const [current, ...prior] = weeks
  const tolerance = 1e-9 * Math.max(1, ...weeks.map((w) => Math.abs(w.mean)))
  const recent = prior.slice(0, TYPICAL_MOVE_WEEKS + 1)
  const moves = recent.flatMap((w, i) =>
    i + 1 < recent.length ? [w.mean - recent[i + 1].mean] : []
  )
  const typical = median(moves.map(Math.abs))

  const distance = Math.abs(current.mean - median(recent.map((w) => w.mean)))
  if (distance > tolerance && distance >= EXTREME_DISTANCE * typical) {
    for (const kind of ['high', 'low'] as const) {
      const beaten = (w: WeekMean) =>
        kind === 'high'
          ? w.mean < current.mean - tolerance
          : w.mean > current.mean + tolerance
      const index = prior.findIndex((w) => !beaten(w))
      const run = index === -1 ? prior.length : index
      if (run < MIN_EXTREME_WEEKS) continue
      const oldest = prior[prior.length - 1]
      return index !== -1
        ? { kind, weeksBeaten: run, since: prior[index].end, basis: 'week' }
        : {
            kind,
            weeksBeaten: run,
            since: oldest.start,
            basis: oldest.start === dataStart ? 'start' : 'earliest',
          }
    }
  }

  // Off a stat that hadn't moved at all, any move is unusual (factor
  // Infinity).
  const move = current.mean - prior[0].mean
  if (
    Math.abs(move) > tolerance &&
    (typical <= tolerance || Math.abs(move) >= UNUSUAL_MOVE_FACTOR * typical)
  )
    return {
      kind: move > 0 ? 'jump' : 'drop',
      factor: typical <= tolerance ? Infinity : Math.abs(move) / typical,
      baselineWeeks: moves.length,
    }

  for (const kind of ['rising', 'falling'] as const) {
    let run = 0
    while (
      run + 1 < weeks.length &&
      (kind === 'rising'
        ? weeks[run].mean > weeks[run + 1].mean + tolerance
        : weeks[run].mean < weeks[run + 1].mean - tolerance)
    )
      run++
    if (run >= MIN_STREAK_WEEKS) return { kind, weeks: run }
  }
  return undefined
}
