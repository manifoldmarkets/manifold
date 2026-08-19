/**
 * Twelve-month house P&L, as a distribution.
 *
 * ── The decomposition ────────────────────────────────────────────────────
 * Over any period the house's escrow changes by exactly three things:
 *
 *   1. + taker fees          volume x feeBps, paid into the pools
 *   2. - directional PnL     netOI x return  (the house is, in aggregate,
 *                            short whatever the traders are net long)
 *   3. - liquidation gaps    when price jumps past a liquidation price, the
 *                            trader forfeits only their margin while the
 *                            winner's claim keeps growing; the difference is
 *                            bad debt against the pools (ADL socialises some
 *                            of it onto winners, which is why this is scaled)
 *
 * Funding contributes ZERO: it is a transfer between two pools inside the same
 * escrow. That is why no funding parameter appears in the P&L directly — it
 * matters only through its effect on netOI, which is item 2's multiplier.
 *
 * ── What is assumed, and what is not ─────────────────────────────────────
 * Returns are NOT assumed: they are block-bootstrapped from the 368 real daily
 * returns of the live btc-usd oracle feed, so volatility clustering and the
 * observed fat tails survive.
 *
 * Everything about TRADER BEHAVIOUR is assumed, and the result is only as good
 * as those assumptions. The load-bearing one is `traderEdgeBps`: the model
 * defaults to traders having NO edge, i.e. E[netOI x return] = 0. If flow is
 * informed — latency bots, or anyone reading the oracle faster than the market
 * — that term turns negative and can dominate the fees. The BTC perp has
 * already demonstrated this once: roughly M$70k was extracted by tick-snipers
 * in about 30 hours, against fee revenue of order M$800/day.
 */

import { loadDaily } from './history'

export type HouseSimParams = {
  /** House money in the pools at t0. */
  subsidy: number
  /** Open interest as a multiple of house money (capacity utilisation). */
  oiToHouseMoney: number
  /** Net (long - short) OI as a fraction of total OI. */
  netOiFraction: number
  /** Notional traded per day as a multiple of open interest. */
  dailyTurnover: number
  /** Taker fee, bps of notional, charged at open only. */
  feeBps: number
  /** Systematic trader edge in bps of notional per round trip. Negative = the
   *  house wins on flow; positive = adverse selection against the house. */
  traderEdgeBps: number
  /** Share of OI held at leverage high enough to gap on a feed discontinuity. */
  highLeverageShare: number
  /** Leverage of that share — sets how far the liquidation price sits. */
  highLeverage: number
  /** Fraction of gap loss the house eats rather than ADL socialising it. */
  houseGapShare: number
  /**
   * Expected annual price drift, in percent, applied ON TOP of the de-meaned
   * bootstrap. The sample year ran at -47.5%/yr (BTC fell from 115k to 65k);
   * leaving that in would hand the house a huge spurious edge, since it is
   * short whatever traders are net long. Returns are therefore de-meaned and
   * the drift you actually believe in is added back here. 0 = a martingale.
   */
  annualDriftPct: number
  /**
   * Bad debt only arises when price crosses a liquidation price BETWEEN oracle
   * observations. BTC ticks every 15s, so per-tick vol is ~0.03% against a
   * 1.28% buffer at 78x — a 43-sigma move, i.e. never. Ordinary volatility
   * liquidates positions cleanly at zero equity, which costs the house
   * nothing. The real exposure is a feed DISCONTINUITY: a stall or outage
   * after which the price reopens somewhere else. That is what these model.
   */
  outagesPerYear: number
  /** Size of the price jump across such a discontinuity, in percent. */
  outageGapPct: number
  days: number
  paths: number
  /** Block length for the bootstrap, in days. Preserves vol clustering. */
  blockDays: number
  seed: number
}

export const DEFAULT_HOUSE_PARAMS: HouseSimParams = {
  subsidy: 122810,
  oiToHouseMoney: 8.1,
  netOiFraction: 0.346,
  dailyTurnover: 0.85,
  feeBps: 10,
  traderEdgeBps: 0,
  highLeverageShare: 0.637,
  highLeverage: 78,
  houseGapShare: 0.5,
  annualDriftPct: 0,
  outagesPerYear: 2,
  outageGapPct: 3,
  days: 365,
  paths: 2000,
  blockDays: 10,
  seed: 12345,
}

/** Deterministic PRNG so a run is reproducible and reviewable. */
const mulberry32 = (a: number) => () => {
  a |= 0
  a = (a + 0x6d2b79f5) | 0
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export type PathResult = {
  finalEquity: number
  pnl: number
  fees: number
  directional: number
  gaps: number
  minEquity: number
  maxDrawdown: number
  ruined: boolean
}

export type HouseSimResult = {
  params: HouseSimParams
  dailyReturnsUsed: number
  mean: number
  median: number
  p5: number
  p25: number
  p75: number
  p95: number
  probAhead: number
  probRuin: number
  meanFees: number
  meanDirectional: number
  meanGaps: number
  sdPnl: number
  /** mean / sd — the signal-to-noise of the whole enterprise. */
  ratio: number
  meanMaxDrawdown: number
  worstPath: number
  bestPath: number
  /** Equity curve percentiles for charting, sampled to ~120 points. */
  curves: { day: number; p5: number; p50: number; p95: number }[]
  histogram: { bucket: number; count: number }[]
}

export const runHouseSim = (params: HouseSimParams): HouseSimResult => {
  const daily = loadDaily()
  const px = daily.px
  const raw: number[] = []
  for (let i = 1; i < px.length; i++) raw.push(px[i] / px[i - 1] - 1)
  // De-mean: the sample year ran at -47.5%/yr and the house is short the net
  // long book, so leaving that in would manufacture an edge that is really
  // just "BTC happened to fall in 2025-26". Drift is added back explicitly.
  const sampleMean = raw.reduce((s, x) => s + x, 0) / raw.length
  const driftPerDay = params.annualDriftPct / 100 / 365
  const rets = raw.map((r) => r - sampleMean + driftPerDay)

  const rand = mulberry32(params.seed)
  const oi = params.subsidy * params.oiToHouseMoney
  const netOi = oi * params.netOiFraction
  const dailyVolume = oi * params.dailyTurnover
  const feeRevenuePerDay = dailyVolume * (params.feeBps / 10_000)
  // Trader edge is paid on the same notional the fee is charged on.
  const edgeCostPerDay = dailyVolume * (params.traderEdgeBps / 10_000)
  // Bad debt = the part of a discontinuity that lands PAST the liquidation
  // price, on the high-leverage share of the book, minus what ADL socialises.
  const liquidationBuffer = 1 / params.highLeverage
  const highLevOi = oi * params.highLeverageShare
  const gapExcess = Math.max(params.outageGapPct / 100 - liquidationBuffer, 0)
  const lossPerOutage = highLevOi * gapExcess * params.houseGapShare
  const outageProbPerDay = params.outagesPerYear / 365

  const results: PathResult[] = []
  const equityByDay: number[][] = []

  for (let p = 0; p < params.paths; p++) {
    let equity = params.subsidy
    let fees = 0
    let directional = 0
    let gaps = 0
    let peak = equity
    let minEquity = equity
    let maxDrawdown = 0
    const curve: number[] = [equity]

    let d = 0
    while (d < params.days) {
      // Block bootstrap: draw a contiguous run of real days.
      const start = Math.floor(rand() * (rets.length - params.blockDays))
      for (let b = 0; b < params.blockDays && d < params.days; b++, d++) {
        const r = rets[start + b]

        fees += feeRevenuePerDay
        equity += feeRevenuePerDay - edgeCostPerDay

        // The house is short the traders' net position.
        const dir = -netOi * r
        directional += dir
        equity += dir

        // Feed discontinuity, as a Bernoulli draw. Ordinary volatility does
        // NOT go here: a position liquidated at its liquidation price is worth
        // exactly zero there, so it costs the house nothing.
        if (rand() < outageProbPerDay && lossPerOutage > 0) {
          gaps -= lossPerOutage
          equity -= lossPerOutage
        }

        peak = Math.max(peak, equity)
        maxDrawdown = Math.max(maxDrawdown, peak - equity)
        minEquity = Math.min(minEquity, equity)
        curve.push(equity)
      }
    }

    results.push({
      finalEquity: equity,
      pnl: equity - params.subsidy,
      fees,
      directional,
      gaps,
      minEquity,
      maxDrawdown,
      ruined: minEquity <= 0,
    })
    equityByDay.push(curve)
  }

  const pnls = results.map((r) => r.pnl).sort((a, b) => a - b)
  const q = (f: number) =>
    pnls[Math.min(pnls.length - 1, Math.max(0, Math.floor(f * pnls.length)))]
  const mean = pnls.reduce((s, x) => s + x, 0) / pnls.length
  const sd = Math.sqrt(
    pnls.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, pnls.length - 1)
  )

  // Percentile equity curves, sampled.
  const stride = Math.max(1, Math.floor(params.days / 120))
  const curves: HouseSimResult['curves'] = []
  for (let day = 0; day <= params.days; day += stride) {
    const col = equityByDay
      .map((c) => c[Math.min(day, c.length - 1)])
      .sort((a, b) => a - b)
    const pick = (f: number) =>
      col[Math.min(col.length - 1, Math.floor(f * col.length))]
    curves.push({ day, p5: pick(0.05), p50: pick(0.5), p95: pick(0.95) })
  }

  // Histogram of outcomes.
  const lo = pnls[0]
  const hi = pnls[pnls.length - 1]
  const nb = 40
  const width = (hi - lo) / nb || 1
  const histogram = Array.from({ length: nb }, (_, i) => ({
    bucket: lo + (i + 0.5) * width,
    count: 0,
  }))
  for (const v of pnls) {
    const i = Math.min(nb - 1, Math.max(0, Math.floor((v - lo) / width)))
    histogram[i].count++
  }

  const avg = (f: (r: PathResult) => number) =>
    results.reduce((s, r) => s + f(r), 0) / results.length

  return {
    params,
    dailyReturnsUsed: rets.length,
    mean,
    median: q(0.5),
    p5: q(0.05),
    p25: q(0.25),
    p75: q(0.75),
    p95: q(0.95),
    probAhead: results.filter((r) => r.pnl > 0).length / results.length,
    probRuin: results.filter((r) => r.ruined).length / results.length,
    meanFees: avg((r) => r.fees),
    meanDirectional: avg((r) => r.directional),
    meanGaps: avg((r) => r.gaps),
    sdPnl: sd,
    ratio: sd > 0 ? mean / sd : Infinity,
    meanMaxDrawdown: avg((r) => r.maxDrawdown),
    worstPath: pnls[0],
    bestPath: pnls[pnls.length - 1],
    curves,
    histogram,
  }
}

/**
 * The scale-invariance result, worth stating separately because it is the
 * whole answer to "how much liquidity should we add".
 *
 * If OI, volume and netOI all scale with house money, then
 *   E[PnL]  = OI x turnover x fee
 *   SD[PnL] = OI x netFraction x sigma
 * and the ratio between them is INDEPENDENT of size:
 *   E/SD = (turnover x fee) / (netFraction x sigma)
 *
 * Adding liquidity therefore does not improve the odds. It scales both the
 * expected profit and the risk by the same factor. The odds are set entirely
 * by turnover, fee, imbalance and volatility — the four things to actually
 * tune.
 */
export const signalToNoise = (args: {
  dailyTurnover: number
  feeBps: number
  netOiFraction: number
  annualVol: number
}) => {
  const annualFeeYield = args.dailyTurnover * 365 * (args.feeBps / 10_000)
  const annualRisk = args.netOiFraction * args.annualVol
  return {
    annualFeeYield,
    annualRisk,
    ratio: annualRisk > 0 ? annualFeeYield / annualRisk : Infinity,
  }
}
