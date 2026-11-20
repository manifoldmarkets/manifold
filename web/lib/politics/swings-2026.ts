import type { Odds } from 'web/components/usa-map/election-odds'

// "2026's biggest swings" on /election: the midterm races whose odds moved
// most from a week out to the result, with a sparkline each. Built offline by
// web/scripts/election-2026-swings.ts from the /election2026 replay snapshot
// (public data only) into web/public/data/election-2026-swings.json; the
// page only reads that file. Pure functions, no I/O.

export type Swing2026 = {
  contractId: string
  slug: string
  creatorUsername: string
  label: string // "Iowa Senate", "Maine Governor", "NY-17", "California Proposition 50"
  office: 'senate' | 'governor' | 'house' | 'measure' | 'control'
  state?: string // two-letter
  side: 'D' | 'R' | 'YES' | 'NO' // the outcome the numbers describe
  sideLabel: string // "Democrats", "Republicans", "Yes", "No"
  from: number // prob of `side` one week out (snapshot frame 0)
  pollsClose: number // at the polls-close milestone
  to: number // 1 or 0 if resolved, else the last snapshot frame
  resolved: boolean
  // [timeMs, prob of side], ~40-60 points from frame 0 to the last frame,
  // then the resolved value at the end if resolved.
  points: [number, number][]
}

export type Swings2026File = {
  generatedAt: number
  windowStart: number
  windowEnd: number
  swings: Swing2026[]
}

export type SwingOffice = Swing2026['office']
type Side = Swing2026['side']

// One race through the replay window: the input to the ranking. `values`
// holds, per snapshot frame, the chance of the race's reference outcome —
// the Democrats (two-party share) for party races and chamber control, YES
// (approval) for a ballot measure — or undefined where it was unpriced.
export type SwingTimeline = {
  contractId: string
  slug: string
  creatorUsername: string
  label: string
  office: SwingOffice
  state?: string
  values: (number | undefined)[]
  // The settled result as the reference outcome's value (1: the Democrats
  // or YES won; 0: they lost) and when it settled. Absent while unresolved,
  // and for a result that isn't either side (an independent won, N/A).
  result?: { value: 0 | 1; time?: number }
}

// Below this combined share the two major parties aren't the contest (an
// independent front-runner, a one-sided market), so there is no two-party
// share to show.
export const MIN_MAJOR_PARTY_SHARE = 0.5

const finiteOr0 = (p: number | undefined) =>
  p !== undefined && Number.isFinite(p) && p > 0 ? p : 0

// The Democrats' share of the two major parties' odds, so an "Other" answer
// doesn't move it: dem 40%, rep 40%, other 20% reads as an even race.
export function twoPartyDem(odds: Odds | undefined): number | undefined {
  if (!odds) return undefined
  const dem = finiteOr0(odds.dem)
  const rep = finiteOr0(odds.rep)
  const total = Object.values(odds).reduce(
    (s: number, p) => s + finiteOr0(p),
    0
  )
  const major = dem + rep
  if (major <= 0 || major < MIN_MAJOR_PARTY_SHARE * total) return undefined
  return dem / major
}

const REFERENCE: Record<SwingOffice, Side> = {
  senate: 'D',
  governor: 'D',
  house: 'D',
  control: 'D',
  measure: 'YES',
}
const OPPOSITE: Record<Side, Side> = { D: 'R', R: 'D', YES: 'NO', NO: 'YES' }
export const SIDE_LABEL: Record<Side, string> = {
  D: 'Democrats',
  R: 'Republicans',
  YES: 'Yes',
  NO: 'No',
}

const isProb = (p: number | undefined): p is number =>
  p !== undefined && Number.isFinite(p) && p >= 0 && p <= 1

const round = (p: number) => Math.round(p * 10_000) / 10_000

// The last priced value at or before `frame` (a value holds until it changes).
function valueAt(values: (number | undefined)[], frame: number) {
  for (let f = Math.min(frame, values.length - 1); f >= 0; f--)
    if (isProb(values[f])) return values[f]
  return undefined
}

// Largest-triangle-three-buckets: at most `max` points that keep the line's
// shape, always including the first and the last.
export function downsample<T extends { x: number; y: number }>(
  points: T[],
  max: number
): T[] {
  if (points.length <= Math.max(max, 2)) return points.slice()
  if (max < 3) return [points[0], points[points.length - 1]]
  const sampled = [points[0]]
  const every = (points.length - 2) / (max - 2)
  let a = 0
  for (let i = 0; i < max - 2; i++) {
    const start = Math.floor(i * every) + 1
    const end = Math.min(Math.floor((i + 1) * every) + 1, points.length - 1)
    const nextEnd = Math.min(Math.floor((i + 2) * every) + 1, points.length)
    let avgX = 0
    let avgY = 0
    const n = nextEnd - end
    for (let j = end; j < nextEnd; j++) {
      avgX += points[j].x
      avgY += points[j].y
    }
    if (n > 0) {
      avgX /= n
      avgY /= n
    } else {
      avgX = points[points.length - 1].x
      avgY = points[points.length - 1].y
    }
    let best = start
    let bestArea = -1
    for (let j = start; j < Math.max(end, start + 1); j++) {
      const area = Math.abs(
        (points[a].x - avgX) * (points[j].y - points[a].y) -
          (points[a].x - points[j].x) * (avgY - points[a].y)
      )
      if (area > bestArea) {
        bestArea = area
        best = j
      }
    }
    sampled.push(points[best])
    a = best
  }
  sampled.push(points[points.length - 1])
  return sampled
}

export const SPARKLINE_POINTS = 48
const MINUTE_MS = 60_000

// One race's swing plus the side's lowest and highest chance over the window
// (from every priced frame, not the sparkline, and never the resolved point:
// a result isn't a market move).
export type SwingAnalysis = { swing: Swing2026; lo: number; hi: number }

// The side the numbers describe and its chance one week out, at the first
// poll closings and at the end. The side is the winner once resolved; until
// then, whichever side gained over the window (the leader at the end when it
// didn't move). Undefined when the race wasn't priced a week out.
export function analyzeSwing(
  timeline: SwingTimeline,
  times: number[],
  pollsCloseFrame: number,
  maxPoints = SPARKLINE_POINTS
): SwingAnalysis | undefined {
  const { values, result } = timeline
  const first = values[0]
  if (!isProb(first)) return undefined
  const lastFrame = Math.min(values.length, times.length) - 1
  const last = valueAt(values, lastFrame)
  if (!isProb(last)) return undefined
  const reference = REFERENCE[timeline.office]
  const gained = last - first
  const side: Side = result
    ? result.value === 1
      ? reference
      : OPPOSITE[reference]
    : gained > 0 || (gained === 0 && last >= 0.5)
    ? reference
    : OPPOSITE[reference]
  const ofSide = (p: number) => (side === reference ? p : 1 - p)

  const priced = values
    .slice(0, lastFrame + 1)
    .map((p, frame) => (isProb(p) ? { x: frame, y: ofSide(p) } : undefined))
    .filter((p): p is { x: number; y: number } => !!p)
  const points: [number, number][] = downsample(priced, maxPoints).map((p) => [
    times[p.x],
    round(p.y),
  ])
  const windowEnd = times[lastFrame]
  if (result)
    points.push([Math.max(result.time ?? 0, windowEnd + MINUTE_MS), 1])

  const atPolls = valueAt(values, pollsCloseFrame) ?? first
  const swing: Swing2026 = {
    contractId: timeline.contractId,
    slug: timeline.slug,
    creatorUsername: timeline.creatorUsername,
    label: timeline.label,
    office: timeline.office,
    ...(timeline.state && { state: timeline.state }),
    side,
    sideLabel: SIDE_LABEL[side],
    from: round(ofSide(first)),
    pollsClose: round(ofSide(atPolls)),
    to: result ? 1 : round(ofSide(last)),
    resolved: !!result,
    points,
  }
  const ys = priced.map((p) => p.y)
  return { swing, lo: Math.min(...ys), hi: Math.max(...ys) }
}

export const toSwing = (
  timeline: SwingTimeline,
  times: number[],
  pollsCloseFrame: number,
  maxPoints = SPARKLINE_POINTS
) => analyzeSwing(timeline, times, pollsCloseFrame, maxPoints)?.swing

// The side needs at least this chance one week out: anything lower is a
// race the market had written off, or a misread market.
export const MIN_FROM = 0.03
// A race whose side stayed past this band (above 95% or below 5%) the whole
// week never moved enough to be a swing.
export const SAFE_BAND = 0.05

export function isCompetitiveSwing({ swing, lo, hi }: SwingAnalysis) {
  if (swing.from < MIN_FROM) return false
  return !(hi < SAFE_BAND || lo > 1 - SAFE_BAND)
}

export const SWINGS_LIMIT = 12

// How far a swing went, from a week out to the end.
export const swingSize = (s: Pick<Swing2026, 'from' | 'to'>) =>
  Math.abs(s.to - s.from)

// The headline list: Senate and House control first (always, however little
// they moved), then the `limit` races that moved most from a week out to the
// end, biggest first.
export function rankSwings(
  timelines: SwingTimeline[],
  times: number[],
  pollsCloseFrame: number,
  limit = SWINGS_LIMIT
): Swing2026[] {
  const analyses = timelines
    .map((t) => analyzeSwing(t, times, pollsCloseFrame))
    .filter((a): a is SwingAnalysis => !!a)
  const control = analyses
    .filter((a) => a.swing.office === 'control')
    .map((a) => a.swing)
  const races = analyses
    .filter((a) => a.swing.office !== 'control' && isCompetitiveSwing(a))
    .map((a) => a.swing)
    .sort(
      (a, b) => swingSize(b) - swingSize(a) || a.label.localeCompare(b.label)
    )
  return [...control, ...races.slice(0, limit)]
}
