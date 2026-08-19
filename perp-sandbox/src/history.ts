/**
 * Real BTC price history: volatility bands, and replaying actual past paths
 * over the live book.
 *
 * "Mirror a recent period" means taking that window's RETURNS and applying
 * them starting from today's oracle price — not replaying its absolute prices,
 * which would teleport the book to a different price level and liquidate
 * everything on period 1.
 */

import * as fs from 'fs'
import * as path from 'path'
import { getPerpOpenInterest, PerpState } from './common'
import { cloneState } from './book'
import { escrowView } from './pathways'
import { FundingParams } from './model'
import { PricePath, runSim, TradeFlow } from './sim'

export type DailySeries = {
  feedId: string
  first: string
  last: string
  n: number
  realizedVol: {
    sdHourly: number
    sdDailyFromHourly: number
    sdDaily: number
    sdAnnual: number
    driftAnnualLog: number
    worstHour: number
    bestHour: number
    worstDay: number
    bestDay: number
    nHourlyReturns: number
    minPx: number
    maxPx: number
  }
  px: number[]
}

const DATA_DIR = path.join(__dirname, '..', 'data')

export const loadDaily = (file = 'btc-daily.json'): DailySeries =>
  JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'))

/**
 * Sigma bands. Volatility scales with the square root of time, so the 1SD move
 * over H hours is sdHourly * sqrt(H). Reported as a multiplicative move, since
 * returns are lognormal-ish and a -2SD move is not the negative of a +2SD one.
 */
export type SigmaBand = {
  label: string
  hours: number
  sd: number
  up1: number
  down1: number
  up2: number
  down2: number
}

export const sigmaBands = (
  sdHourly: number,
  horizons: { label: string; hours: number }[]
): SigmaBand[] =>
  horizons.map((h) => {
    const sd = sdHourly * Math.sqrt(h.hours)
    return {
      label: h.label,
      hours: h.hours,
      sd,
      up1: Math.exp(sd) - 1,
      down1: Math.exp(-sd) - 1,
      up2: Math.exp(2 * sd) - 1,
      down2: Math.exp(-2 * sd) - 1,
    }
  })

/**
 * Hourly price path from a window of daily closes, rebased so period 0 sits at
 * `startPrice`. Interpolates geometrically within each day, which keeps the
 * daily closes exact and the intraday steps smooth.
 *
 * LIMITATION, stated because it changes results: daily closes cannot contain
 * an intraday wick. A day that dipped 6% and recovered reads here as its close.
 * Since many live positions sit 1-2% from liquidation, this UNDERSTATES
 * liquidations. Treat replay liquidation counts as a floor.
 */
export const historicalPath = (
  dailyWindow: number[],
  startPrice: number
): PricePath => {
  const base = dailyWindow[0]
  return (period: number) => {
    const t = (period - 1) / 24
    const i = Math.floor(t)
    const frac = t - i
    if (i >= dailyWindow.length - 1) {
      return startPrice * (dailyWindow[dailyWindow.length - 1] / base)
    }
    const a = dailyWindow[i]
    const b = dailyWindow[i + 1]
    const px = a * Math.pow(b / a, frac)
    return startPrice * (px / base)
  }
}

export type ReplayResult = {
  label: string
  startIndex: number
  days: number
  startDate: string
  totalReturnPct: number
  maxDrawdownPct: number
  maxRunupPct: number
  realisedSdDaily: number
  endBuffer: number
  minBuffer: number
  bufferDelta: number
  liquidations: number
  adlPeriods: number
  worstAdl: number
  blocked: number
  fundingMoved: number
  fundingPayer: 'long' | 'short' | 'none'
  endOiLong: number
  endOiShort: number
  /** Sampled for charting. */
  series: {
    p: number
    price: number
    buffer: number
    escrow: number
    liability: number
  }[]
  /** Escrow is conserved unless a factor-zero ADL settles someone out. */
  escrowStart: number
  escrowEnd: number
  escrowSwing: number
  maxLiability: number
  adlSettledPayout: number
}

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Flip a window's log returns. Same volatility, same path shape, opposite
 * direction — the only honest way to get up-paths out of a year in which BTC
 * only fell. Not a forecast; a symmetry test.
 */
export const invertWindow = (window: number[]): number[] => {
  const out = [window[0]]
  for (let i = 1; i < window.length; i++) {
    out.push(out[i - 1] * (window[i - 1] / window[i]))
  }
  return out
}

export const replayWindow = (args: {
  state: PerpState
  startPrice: number
  daily: DailySeries
  startIndex: number
  days: number
  label: string
  funding: FundingParams
  takerFeeBps: number
  flow: TradeFlow
  contractId: string
  sampleTo?: number
  /** Mirror the window's returns, turning a fall into an equivalent rise. */
  invert?: boolean
}): ReplayResult => {
  const raw = args.daily.px.slice(
    args.startIndex,
    args.startIndex + args.days + 1
  )
  const window = args.invert ? invertWindow(raw) : raw
  const periods = args.days * 24
  const pricePath = historicalPath(window, args.startPrice)

  const res = runSim(cloneState(args.state), {
    funding: args.funding,
    periods,
    price: pricePath,
    takerFeeBps: args.takerFeeBps,
    flow: args.flow,
    contractId: args.contractId,
  })

  const base = escrowView(args.state, args.startPrice)
  let minBuffer = Infinity
  let peak = -Infinity
  let maxDrawdown = 0
  let maxRunup = 0
  const series: ReplayResult['series'] = []
  const sampleTo = args.sampleTo ?? 240
  const stride = Math.max(1, Math.floor(res.records.length / sampleTo))

  res.records.forEach((r, i) => {
    // `buffer` is recorded by the sim from the live state at that period's
    // price, so it reflects liquidations and ADL as they happen.
    minBuffer = Math.min(minBuffer, r.buffer)
    peak = Math.max(peak, r.price)
    maxDrawdown = Math.min(maxDrawdown, r.price / peak - 1)
    maxRunup = Math.max(maxRunup, r.price / args.startPrice - 1)
    if (i % stride === 0 || i === res.records.length - 1) {
      series.push({
        p: r.period,
        price: r.price,
        buffer: r.buffer,
        escrow: r.escrow,
        liability: r.liability,
      })
    }
  })
  if (!Number.isFinite(minBuffer)) minBuffer = base.buffer

  const escrows = res.records.map((r) => r.escrow)
  const escrowStart = escrows.length ? escrows[0] : base.escrow
  const escrowEnd = escrows.length ? escrows[escrows.length - 1] : base.escrow
  const escrowSwing = escrows.length
    ? Math.max(...escrows) - Math.min(...escrows)
    : 0
  const maxLiability = res.records.length
    ? Math.max(...res.records.map((r) => r.liability))
    : base.liability

  const endPrice = pricePath(periods)
  const endView = escrowView(res.finalState, endPrice)
  const oi = getPerpOpenInterest(res.finalState.positions)

  // Realised daily sd of this window, for regime labelling.
  const rets: number[] = []
  for (let i = 1; i < window.length; i++)
    rets.push(Math.log(window[i] / window[i - 1]))
  const mean = rets.reduce((s, x) => s + x, 0) / Math.max(1, rets.length)
  const sd = Math.sqrt(
    rets.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, rets.length - 1)
  )

  return {
    label: args.label,
    startIndex: args.startIndex,
    days: args.days,
    startDate: addDays(args.daily.first, args.startIndex),
    totalReturnPct: (window[window.length - 1] / window[0] - 1) * 100,
    maxDrawdownPct: maxDrawdown * 100,
    maxRunupPct: maxRunup * 100,
    realisedSdDaily: sd,
    endBuffer: endView.buffer,
    minBuffer,
    bufferDelta: endView.buffer - base.buffer,
    liquidations: res.totalLiquidated,
    adlPeriods: res.totalAdlPeriods,
    worstAdl: Math.min(
      ...res.records.map((r) => Math.min(r.adlFactorLong, r.adlFactorShort))
    ),
    blocked: res.blockedPeriods,
    fundingMoved: Math.max(res.totalLongPays, res.totalShortPays),
    fundingPayer:
      res.totalLongPays > res.totalShortPays
        ? 'long'
        : res.totalShortPays > 0
        ? 'short'
        : 'none',
    endOiLong: oi.long,
    endOiShort: oi.short,
    series,
    escrowStart,
    escrowEnd,
    escrowSwing,
    maxLiability,
    adlSettledPayout: res.totalAdlSettledPayout,
  }
}
