// Pure projection math for the perp chart's forward overlays: the
// carry-neutral (funding break-even) path, realized-volatility cone,
// liquidation bands, and per-position break-even lines. NO I/O.
//
// These are display projections, not engine math — nothing here mutates
// market state. The oracle price is external, so we never draw an "expected
// price": the carry line is the funding hurdle a position must beat, and the
// cone is the feed's own historical volatility.

import { sortBy, sumBy } from 'lodash'
import { HOUR_MS, DAY_MS } from '../util/time'
import { PerpDirection } from './position'

export type ProjectionPoint = { ts: number; value: number }

// Mirrors FUNDING_PERIOD_MS in backend/shared/src/perps/engine.ts (web and
// common cannot import backend). Funding cadence is hourly for every feed.
export const FUNDING_PERIOD_MS = HOUR_MS

/**
 * How far past "now" the projection zone extends: a fixed fraction of the
 * visible history, so the future occupies ~1/5 of the chart regardless of
 * feed cadence. Floored at two funding periods so fast feeds (BTC: a few
 * hours of 15s ticks) still show a carry slope; capped at a year for long
 * daily series.
 */
export const projectionHorizonMs = (historySpanMs: number) => {
  if (!Number.isFinite(historySpanMs) || historySpanMs <= 0) {
    return 2 * FUNDING_PERIOD_MS
  }
  return Math.min(
    Math.max(historySpanMs * 0.28, 2 * FUNDING_PERIOD_MS),
    365 * DAY_MS
  )
}

/**
 * Carry-neutral path: where the price must be at time t for a 1× long opened
 * now to break even on funding alone — P·(1 + f·periods), f signed (+ve =
 * longs pay, so the hurdle rises). Above the line, longs net-win after carry;
 * below it, shorts do. Funding is charged on margin, so a leveraged position's
 * personal hurdle is shallower (see personalBreakEvenPath) — this is the
 * crowd-level hurdle / sentiment line, not a price forecast.
 */
export const carryNeutralPath = (
  price: number,
  fundingRatePerPeriod: number,
  now: number,
  horizonMs: number
): ProjectionPoint[] => {
  if (!Number.isFinite(price) || price <= 0) return []
  if (!Number.isFinite(fundingRatePerPeriod)) return []
  if (!Number.isFinite(horizonMs) || horizonMs <= 0) return []
  const periods = horizonMs / FUNDING_PERIOD_MS
  const end = price * (1 + fundingRatePerPeriod * periods)
  if (!Number.isFinite(end)) return []
  return [
    { ts: now, value: price },
    { ts: now + horizonMs, value: end },
  ]
}

/**
 * Realized volatility of the feed as σ per √ms: the square root of total
 * squared log-return per unit of elapsed time. Irregular sampling is fine —
 * each return contributes its own interval to the denominator. Returns null
 * when there aren't enough clean samples to be meaningful.
 */
export const realizedVolPerSqrtMs = (
  points: ProjectionPoint[]
): number | null => {
  let sumSq = 0
  let sumDt = 0
  let n = 0
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]
    const curr = points[i]
    const dt = curr.ts - prev.ts
    if (!(dt > 0) || !(prev.value > 0) || !(curr.value > 0)) continue
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
  steps = 24
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

  const totalPeriods = horizonMs / FUNDING_PERIOD_MS
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
