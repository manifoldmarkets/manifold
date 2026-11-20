import { sortBy } from 'lodash'

// Probability history for the face-ended race charts on /election. The server
// samples each answer's bets (the bet-points API returns an even random
// sample across the market's whole life), thins them to adaptive buckets —
// fine for the last month, coarser further back — and ships them compactly;
// the chart decodes them on the client.

export type TimePoint = [time: number, prob: number]

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

// Bucket width by how long ago a point is: recent moves stay sharp (hourly
// for the last day, so the 1D range draws a real line), years-old history
// costs a few points a month.
export function bucketWidth(age: number): number {
  if (age <= DAY) return HOUR
  if (age <= 7 * DAY) return 3 * HOUR
  if (age <= 45 * DAY) return DAY
  if (age <= 200 * DAY) return 3 * DAY
  if (age <= 800 * DAY) return 7 * DAY
  return 21 * DAY
}

const median = (values: number[]) => {
  const s = [...values].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

// One point per bucket: the median price of the sampled trades in it, at the
// bucket's last trade. Single trades bounce the price back and forth; the
// median shows where it sat. The first point is kept as is so the line starts
// where trading did, and the last as is so it ends on the latest price. Input
// in any order; output sorted by time; non-finite points are dropped.
export function thinHistory(points: TimePoint[], now: number): TimePoint[] {
  const valid = points.filter(
    ([t, p]) => Number.isFinite(t) && Number.isFinite(p) && t <= now
  )
  const sorted = sortBy(valid, ([t]) => t)
  if (sorted.length <= 2) return sorted
  const out: TimePoint[] = [sorted[0]]
  let bucket: TimePoint[] = []
  let bucketEnd = -Infinity
  const flush = () => {
    if (bucket.length === 0) return
    out.push([bucket[bucket.length - 1][0], median(bucket.map(([, p]) => p))])
    bucket = []
  }
  for (let i = 1; i < sorted.length - 1; i++) {
    const [t] = sorted[i]
    if (t >= bucketEnd) {
      flush()
      const width = bucketWidth(now - t)
      bucketEnd = Math.floor(t / width) * width + width
    }
    bucket.push(sorted[i])
  }
  flush()
  out.push(sorted[sorted.length - 1])
  return out
}

// Compact wire format: seconds since `base` and basis points, as one flat
// array of integers. About a third the size of [ms, float] pairs.
export type EncodedHistory = { base: number; data: number[] }

export function encodeHistory(points: TimePoint[]): EncodedHistory {
  if (points.length === 0) return { base: 0, data: [] }
  const base = Math.floor(points[0][0] / 1000)
  const data: number[] = []
  for (const [t, p] of points) {
    data.push(Math.round(t / 1000) - base, Math.round(clamp01(p) * 10000))
  }
  return { base, data }
}

export function decodeHistory(encoded: EncodedHistory): TimePoint[] {
  const { base, data } = encoded
  const out: TimePoint[] = []
  for (let i = 0; i + 1 < data.length; i += 2) {
    out.push([(base + data[i]) * 1000, data[i + 1] / 10000])
  }
  return out
}

const clamp01 = (p: number) => Math.min(1, Math.max(0, p))

// The probability at time `t`: the last point at or before it, else the first
// point (a series that starts later reads as its opening price).
export function probAt(points: TimePoint[], t: number): number | undefined {
  if (points.length === 0) return undefined
  let lo = 0
  let hi = points.length - 1
  if (t < points[0][0]) return points[0][1]
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (points[mid][0] <= t) lo = mid
    else hi = mid - 1
  }
  return points[lo][1]
}

// Points from `start` on, with the value at `start` prepended so a line
// clipped to a time range still begins at the left edge.
export function sliceFrom(points: TimePoint[], start: number): TimePoint[] {
  if (points.length === 0 || start <= points[0][0]) return points
  const at = probAt(points, start)
  const rest = points.filter(([t]) => t > start)
  return at === undefined ? rest : [[start, at], ...rest]
}
