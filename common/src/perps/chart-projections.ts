// Pure projection math for the perp chart's forward overlays: the
// carry-neutral (funding break-even) path, realized-volatility cone,
// liquidation bands, and per-position break-even lines. NO I/O.
//
// These are display projections, not engine math — nothing here mutates
// market state. The oracle price is external, so we never draw an "expected
// price": the carry line is the funding hurdle a position must beat, and the
// cone is the feed's own historical volatility.

import { sortBy, sumBy } from 'lodash'
import { DAY_MS, HOUR_MS, MINUTE_MS } from '../util/time'
import { FUNDING_PERIOD_MS } from './funding'
import { PerpDirection } from './position'

const samplingIntervalsMs = (points: { ts: number }[]) => {
  const dts: number[] = []
  for (let i = 1; i < points.length; i++) {
    const dt = points[i].ts - points[i - 1].ts
    if (dt > 0) dts.push(dt)
  }
  return dts
}

const medianIntervalMs = (dts: number[]) => {
  if (!dts.length) return Infinity
  return sortBy(dts)[Math.floor(dts.length / 2)]
}

const lowerMedianIntervalMs = (dts: number[]) => {
  if (!dts.length) return Infinity
  return sortBy(dts)[Math.floor((dts.length - 1) / 2)]
}

/**
 * Interval above which a sampling gap is a data outage rather than natural
 * cadence: 12× the median interval, floored at 3 hours. Daily feeds get
 * 12 days, so weekend-ish gaps in slow feeds don't fragment the line.
 *
 * Mixed-cadence series need `getDataGapFlags` below: a single global median
 * cannot represent daily backfill followed by hourly live points.
 */
export const gapThresholdMs = (points: { ts: number }[]): number => {
  const median = medianIntervalMs(samplingIntervalsMs(points))
  if (!Number.isFinite(median)) return Infinity
  return Math.max(12 * median, 3 * HOUR_MS)
}

/**
 * Marks the interval ending at each point when it is a real data outage.
 *
 * Cadence is inferred independently from up to five intervals on either
 * side. An interval is a gap only when it is abnormal relative to every side
 * that has context. This is deliberately transition-aware: at a daily→hourly
 * handoff, the final daily interval is normal relative to the daily side and
 * stays connected. A multi-day hole inside hourly/fast data is abnormal on
 * both sides and still breaks.
 */
export const getDataGapFlags = (points: { ts: number }[]): boolean[] => {
  if (points.length === 0) return []
  const intervals = points
    .slice(1)
    .map((point, index) => point.ts - points[index].ts)
  const flags = Array.from({ length: points.length }, () => false)
  const globalThreshold = gapThresholdMs(points)
  const localSampleSize = 5

  for (
    let intervalIndex = 0;
    intervalIndex < intervals.length;
    intervalIndex++
  ) {
    const dt = intervals[intervalIndex]
    if (!(dt > 0)) continue

    const before = intervals
      .slice(Math.max(0, intervalIndex - localSampleSize), intervalIndex)
      .filter((interval) => interval > 0)
    const after = intervals
      .slice(intervalIndex + 1, intervalIndex + 1 + localSampleSize)
      .filter((interval) => interval > 0)
    const localThresholds = [before, after]
      .filter((sample) => sample.length > 0)
      .map((sample) =>
        Math.max(12 * lowerMedianIntervalMs(sample), 3 * HOUR_MS)
      )

    flags[intervalIndex + 1] =
      localThresholds.length > 0
        ? localThresholds.every((threshold) => dt > threshold)
        : dt > globalThreshold
  }
  return flags
}

export type ProjectionPoint = { ts: number; value: number }

// Funding cadence lives in ./funding (the engine imports the same module, so
// there is no mirror to keep in sync). The default is hourly; contracts on
// slower feeds carry their own fundingPeriodMs — every projection here takes
// it as a trailing parameter so legacy call sites keep the hourly default.
export { FUNDING_PERIOD_MS } from './funding'

/**
 * How far past "now" the projection zone extends: a fixed fraction of the
 * visible history, so the future occupies ~1/5 of the chart regardless of
 * feed cadence. Floored at 30 minutes so the zone stays drawable on short
 * windows, never longer than the visible history itself (a 1-hour
 * timeframe should not be two-thirds empty future), and capped at 60 days:
 * projecting today's funding rate a year out compounds a rate that will
 * certainly have changed into a dramatic slope — on a slow multi-year
 * staircase feed it once drew a "crash" a monotone index cannot have.
 */
export const projectionHorizonMs = (
  historySpanMs: number,
  fundingPeriodMs = FUNDING_PERIOD_MS
) => {
  if (!Number.isFinite(historySpanMs) || historySpanMs <= 0) {
    return 2 * fundingPeriodMs
  }
  return Math.min(
    Math.max(historySpanMs * 0.28, 30 * MINUTE_MS),
    historySpanMs,
    60 * DAY_MS
  )
}

/**
 * Times of the next `count` funding events. The scheduler's update-perps job
 * runs at each top of the hour (wall-clock, timezone-agnostic on epoch ms)
 * and funds a market when one period has elapsed from creation (first event),
 * or one period minus a minute of cron jitter has elapsed since the previous
 * event. Events therefore land on hour boundaries regardless of period
 * length, and a boundary too soon after the relevant anchor is skipped.
 * Works from a stale lastFundingTime too: boundaries after `now` still
 * qualify, so a missed scheduler run self-corrects to the next hour. For
 * periods longer than an hour the engine additionally requires a new oracle
 * price, which this prediction can't see — a late feed pushes the real event
 * to a later boundary than projected here.
 */
export const nextFundingTimes = (
  lastFundingTime: number | undefined,
  now: number,
  count: number,
  fundingPeriodMs = FUNDING_PERIOD_MS,
  fundingStartTime?: number
): number[] => {
  if (!Number.isFinite(now) || count <= 0) return []
  // Gate each boundary against the previous PREDICTED event, not just the
  // last real one — with a 24h period, every hourly boundary after the first
  // prediction would otherwise "qualify" against the day-old anchor.
  let anchor = lastFundingTime || fundingStartTime
  let isFirstFunding = !lastFundingTime && fundingStartTime != null
  const gateOk = (t: number) =>
    !anchor || t - anchor >= fundingPeriodMs - (isFirstFunding ? 0 : MINUTE_MS)
  const times: number[] = []
  let t = Math.floor(now / HOUR_MS) * HOUR_MS + HOUR_MS
  // The gate can skip at most one boundary per period, so events fit within
  // count periods plus a little slack.
  const limit = now + count * fundingPeriodMs + 2 * HOUR_MS
  while (times.length < count && t <= limit) {
    if (gateOk(t)) {
      times.push(t)
      anchor = t
      isFirstFunding = false
    }
    t += HOUR_MS
  }
  return times
}

/**
 * Projection horizon that prefers ending just past upcoming funding events.
 * TWO events only when the window has real headroom (half the span) — on a
 * 1-hour view a two-event horizon would hand most of the chart to empty
 * future. ONE event may run up to 25% past the window: showing WHERE the
 * next funding lands is the point of the line, and hour-boundary events sit
 * up to an hour out. When even one event doesn't fit — or on long windows
 * where the proportional horizon already covers many periods — the
 * proportional rule applies.
 */
export const projectionHorizonWithFunding = (
  historySpanMs: number,
  now: number,
  fundingTimes: number[]
): number => {
  const prop = projectionHorizonMs(historySpanMs)
  if (!Number.isFinite(historySpanMs) || historySpanMs <= 0) return prop
  const pad = 6 * MINUTE_MS
  const candidates: [number | undefined, number][] = [
    [fundingTimes[1], historySpanMs * 0.5],
    [fundingTimes[0], historySpanMs * 1.25],
  ]
  for (const [t, allowance] of candidates) {
    if (t == null) continue
    const h = t - now + pad
    if (h > 0 && h <= allowance) return Math.max(h, prop)
  }
  return prop
}

/**
 * Carry-neutral path: where the price must be at time t for a 1× long opened
 * now to break even on funding alone. Above the line, longs net-win after
 * carry; below it, shorts do. Funding is charged on margin, so a leveraged
 * position's personal hurdle is shallower (see personalBreakEvenPath) — this
 * is the crowd-level hurdle / sentiment line, not a price forecast.
 *
 * Compounds: applyFunding multiplies the payer's size and cost basis by
 * (1 − f) every period, so the hurdle is P·(1 − f)^-n, not the first-order
 * P·(1 + f·n). The two agree only while f·n << 1 — at the 60-day horizon cap
 * with hourly funding the linear form understated the real hurdle by ~40%,
 * and it disagreed with personalBreakEvenPath, which is drawn on the same
 * chart from the same rate and already compounds.
 */
export const carryNeutralPath = (
  price: number,
  fundingRatePerPeriod: number,
  now: number,
  horizonMs: number,
  fundingPeriodMs = FUNDING_PERIOD_MS
): ProjectionPoint[] => {
  if (!Number.isFinite(price) || price <= 0) return []
  if (!Number.isFinite(fundingRatePerPeriod)) return []
  if (!Number.isFinite(horizonMs) || horizonMs <= 0) return []
  if (!Number.isFinite(fundingPeriodMs) || fundingPeriodMs <= 0) return []
  // A rate at or beyond 100% per period would make the compounded hurdle
  // infinite (or flip sign); the registry caps maxFundingRate below 1, so
  // this is a guard against corrupt config rather than an expected path.
  if (fundingRatePerPeriod >= 1 || fundingRatePerPeriod <= -1) return []
  const periods = horizonMs / fundingPeriodMs
  const end = price * Math.pow(1 - fundingRatePerPeriod, -periods)
  if (!Number.isFinite(end) || end <= 0) return []
  return [
    { ts: now, value: price },
    { ts: now + horizonMs, value: end },
  ]
}

/**
 * Realized volatility of the feed as σ per √ms: the square root of total
 * squared log-return per unit of elapsed time. Irregular sampling is fine —
 * each return contributes its own interval to the denominator. Returns
 * spanning inferred data outages are excluded by default: a single multi-day
 * gap would otherwise dominate the elapsed-time denominator with one noisy
 * sample. Passing `maxGapMs` replaces inference with that explicit threshold.
 * Returns null when there aren't enough clean samples to be meaningful.
 */
export const realizedVolPerSqrtMs = (
  points: ProjectionPoint[],
  maxGapMs?: number
): number | null => {
  const inferredGaps =
    maxGapMs === undefined ? getDataGapFlags(points) : undefined
  let sumSq = 0
  let sumDt = 0
  let n = 0
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const dt = curr.ts - prev.ts
    const isGap =
      maxGapMs === undefined ? inferredGaps?.[i] === true : dt > maxGapMs
    if (!(dt > 0) || isGap) continue
    if (!(prev.value > 0) || !(curr.value > 0)) continue
    const r = Math.log(curr.value / prev.value)
    if (!Number.isFinite(r)) continue
    sumSq += r * r
    sumDt += dt
    n++
  }
  if (n < 8 || sumDt <= 0) return null
  const varPerMs = sumSq / sumDt
  if (!Number.isFinite(varPerMs) || varPerMs < 0) return null
  return Math.sqrt(varPerMs)
}

/**
 * ±1σ volatility cone from now: P·exp(±σ·√t). Sampled densely enough that
 * the √t curvature renders smoothly.
 */
export const volConePaths = (
  price: number,
  sigmaPerSqrtMs: number,
  now: number,
  horizonMs: number,
  steps = 32
): { upper: ProjectionPoint[]; lower: ProjectionPoint[] } | null => {
  if (!Number.isFinite(price) || price <= 0) return null
  if (!Number.isFinite(sigmaPerSqrtMs) || sigmaPerSqrtMs < 0) return null
  if (!Number.isFinite(horizonMs) || horizonMs <= 0) return null
  const upper: ProjectionPoint[] = []
  const lower: ProjectionPoint[] = []
  for (let i = 0; i <= steps; i++) {
    const t = (horizonMs * i) / steps
    const w = sigmaPerSqrtMs * Math.sqrt(t)
    if (!Number.isFinite(w)) return null
    upper.push({ ts: now + t, value: price * Math.exp(w) })
    lower.push({ ts: now + t, value: price * Math.exp(-w) })
  }
  return { upper, lower }
}

export type LiquidationBand = {
  /** Notional-weighted center of the band. */
  price: number
  /** Total open notional whose liquidation price falls in the band. */
  notional: number
  /** Band's share of all open notional (0..1), for opacity/width scaling. */
  weight: number
}

/**
 * Cluster open positions' liquidation prices into horizontal bands: sweep
 * ascending and merge a position into the current band while it sits within
 * `mergeWithin` (absolute price units) of the band's weighted center.
 */
export const clusterLiquidationBands = (
  positions: { size: number; liquidationPrice: number }[],
  mergeWithin: number
): LiquidationBand[] => {
  const open = positions.filter(
    (p) =>
      p.size > 0 &&
      Number.isFinite(p.liquidationPrice) &&
      p.liquidationPrice > 0
  )
  if (!open.length) return []
  const total = sumBy(open, (p) => p.size)
  if (!(total > 0)) return []

  const sorted = sortBy(open, (p) => p.liquidationPrice)
  const bands: { weightedSum: number; notional: number }[] = []
  for (const p of sorted) {
    const last = bands[bands.length - 1]
    const center = last ? last.weightedSum / last.notional : NaN
    if (last && p.liquidationPrice - center <= mergeWithin) {
      last.weightedSum += p.liquidationPrice * p.size
      last.notional += p.size
    } else {
      bands.push({
        weightedSum: p.liquidationPrice * p.size,
        notional: p.size,
      })
    }
  }
  return bands.map((b) => ({
    price: b.weightedSum / b.notional,
    notional: b.notional,
    weight: b.notional / total,
  }))
}

/**
 * Your funding break-even: the price path along which a position's
 * user-facing PnL (value − originalCostBasis) stays exactly zero as funding
 * compounds. Matches applyFunding's per-period scaling exactly: the paying
 * side's size and costBasis scale by (1−f) each period; the receiving side
 * scales by (1+g), g = transfer re-based onto the receiving pool. Slope is
 * ≈ Pe·f/ℓ for the paying side — at high leverage the personal hurdle is
 * nearly flat, because funding is charged on margin, not notional.
 */
export const personalBreakEvenPath = (
  position: {
    direction: PerpDirection
    size: number
    costBasis: number
    originalCostBasis: number
    entryPrice: number
  },
  fundingRatePerPeriod: number,
  poolLong: number,
  poolShort: number,
  now: number,
  horizonMs: number,
  steps = 24,
  fundingPeriodMs = FUNDING_PERIOD_MS
): ProjectionPoint[] => {
  const { direction, size, costBasis, originalCostBasis, entryPrice } = position
  if (!(size > 0) || !(entryPrice > 0) || !(originalCostBasis >= 0)) return []
  if (!Number.isFinite(fundingRatePerPeriod)) return []
  if (!Number.isFinite(horizonMs) || horizonMs <= 0) return []

  // Per-period scale factor for this position's side (see applyFunding).
  const f = fundingRatePerPeriod
  let scale = 1
  if (f > 0 && poolLong > 0 && poolShort > 0) {
    // Longs pay f of their pool; shorts receive it re-based on S.
    scale = direction === 'long' ? 1 - f : 1 + (f * poolLong) / poolShort
  } else if (f < 0 && poolLong > 0 && poolShort > 0) {
    // Shorts pay |f| of their pool; longs receive it re-based on L.
    scale = direction === 'short' ? 1 + f : 1 + (-f * poolShort) / poolLong
  }

  const totalPeriods = horizonMs / fundingPeriodMs
  const path: ProjectionPoint[] = []
  for (let i = 0; i <= steps; i++) {
    const n = (totalPeriods * i) / steps
    const factor = Math.pow(scale, n)
    // A paying side asymptotically loses its whole position to funding;
    // past ~98% gone the break-even blows up — stop the line there.
    if (!(factor > 0.02) || !Number.isFinite(factor)) break
    const x = (originalCostBasis - costBasis * factor) / (size * factor)
    const value =
      direction === 'long' ? entryPrice * (1 + x) : entryPrice * (1 - x)
    if (!Number.isFinite(value) || value <= 0) break
    path.push({ ts: now + (horizonMs * i) / steps, value })
  }
  return path.length >= 2 ? path : []
}
