/**
 * Market designer: given an asset's drift and volatility, what settings does
 * it need?
 *
 * This is the layer furthest from prod's code — none of it is Manifold math,
 * and all of it is assumption-driven. It exists to make the trade-offs
 * explicit and adjustable, not to hand back an answer. The only imported
 * quantity is the funding curve itself (via `rateAtRatio` -> `imbalance`).
 *
 * Two INDEPENDENT constraints bind the leverage cap, and the answer is the
 * smaller of them:
 *
 *  1. DRIFT. A long earns drift on notional and pays funding on margin, so
 *     the funding needed to stay EV-neutral is drift x leverage while the cap
 *     is flat. Break-even leverage = f_max_annual / drift_annual. Above it the
 *     long side is +EV at any imbalance.
 *
 *  2. VOLATILITY. Liquidation sits 1/leverage away from entry. If ordinary
 *     noise reaches it, the position is a coin flip and the market is a
 *     liquidation mill. Requiring the liquidation distance to survive an
 *     n-sigma daily move gives leverage <= 1 / (n * sd_daily).
 *
 * These pull in opposite directions across assets, which is why one leverage
 * cap for every market is wrong: BTC is volatility-constrained and driftless;
 * SPY is the reverse.
 */

import { FundingParams, rateAtRatio } from './model'

export type AssetAssumption = {
  name: string
  /** Expected annual price drift, in percent. */
  driftPct: number
  /** Annualised volatility, in percent. */
  volPct: number
  /** Trading-day count used to convert annual vol to daily. */
  tradingDays: number
  /** Optional note on where the number came from. */
  source: string
}

export type DesignResult = {
  asset: AssetAssumption
  sdDaily: number
  sdHourly: number
  /** Leverage at which drift exactly eats the funding cap. */
  driftMaxLeverage: number
  /** Leverage at which an n-sigma day reaches the liquidation price. */
  volMaxLeverage: number
  sigmasRequired: number
  /** The binding one. */
  recommendedLeverage: number
  bindingConstraint: 'drift' | 'volatility'
  /** Where a one-sided book settles at the recommended leverage. */
  equilibriumRatio: number | null
  equilibriumShortSharePct: number | null
  /** Long's residual edge at that settling point, annualised percent. */
  longResidualEvPct: number | null
  /** f_max that would make the long side EV-neutral at the recommended cap. */
  fMaxForNeutral: number
  fMaxForNeutralMultiple: number
  /**
   * Leverage at which the long's residual edge at equilibrium falls to
   * `targetLongEdgePct`. Setting the cap AT the drift break-even is not enough:
   * there the long still clears f_max/2 a year, because the settling ratio
   * only charges it half the cap. This is the number that actually matters.
   */
  targetLongEdgePct: number
  leverageForTargetEdge: number
  /** Daily 1SD and 2SD moves, for sanity. */
  move1SdDailyPct: number
  move2SdDailyPct: number
  move1Sd90dPct: number
}

export const designMarket = (args: {
  asset: AssetAssumption
  params: FundingParams
  periodHours: number
  /** How many daily sigmas the liquidation distance must survive. */
  sigmas: number
  /** Long's acceptable residual edge at equilibrium, annual percent. */
  targetLongEdgePct?: number
}): DesignResult => {
  const { asset, params } = args
  const periodsPerYear = (365 * 24) / args.periodHours
  const driftPerPeriod = asset.driftPct / 100 / periodsPerYear
  const sdDaily = asset.volPct / 100 / Math.sqrt(asset.tradingDays)
  // Perps run 24/7; convert the trading-day sigma to a calendar-hour sigma.
  const sdHourly = sdDaily / Math.sqrt(24)

  // Sign does not matter: a negative drift is exactly as exploitable by the
  // short side as a positive one is by the long side.
  const absDrift = Math.abs(driftPerPeriod)
  const driftMaxLeverage = absDrift > 0 ? params.fMax / absDrift : Infinity
  const volMaxLeverage = sdDaily > 0 ? 1 / (args.sigmas * sdDaily) : Infinity
  const recommendedLeverage = Math.min(driftMaxLeverage, volMaxLeverage)
  const bindingConstraint =
    driftMaxLeverage <= volMaxLeverage ? 'drift' : 'volatility'

  // Settling ratio at the recommended cap: shorts stop entering when their
  // amplified funding yield stops beating their drift cost, i.e. f(r)*r = mu*L.
  const target = absDrift * recommendedLeverage
  const shortEvSign = (r: number) => rateAtRatio(r, params) * r - target
  let equilibriumRatio: number | null = null
  if (shortEvSign(1.0000001) >= 0) equilibriumRatio = 1
  else if (shortEvSign(1e6) > 0) {
    let lo = 1.0000001
    let hi = 1e6
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2
      if (shortEvSign(mid) < 0) lo = mid
      else hi = mid
    }
    equilibriumRatio = hi
  }

  const longResidualEv =
    equilibriumRatio === null
      ? null
      : absDrift * recommendedLeverage - rateAtRatio(equilibriumRatio, params)

  const fMaxForNeutral = absDrift * recommendedLeverage

  // Long's residual edge at the settling ratio, as a function of leverage.
  // Bisect rather than invert: the settling ratio itself is found numerically.
  const edgeAt = (leverage: number) => {
    const t = absDrift * leverage
    if (!(t > 0)) return 0
    const sign = (r: number) => rateAtRatio(r, params) * r - t
    if (sign(1e6) <= 0) return Infinity
    let lo = 1.0000001
    let hi = 1e6
    if (sign(lo) < 0) {
      for (let i = 0; i < 160; i++) {
        const mid = (lo + hi) / 2
        if (sign(mid) < 0) lo = mid
        else hi = mid
      }
    } else hi = 1
    return (t - rateAtRatio(hi, params)) * periodsPerYear * 100
  }
  const targetLongEdgePct = args.targetLongEdgePct ?? 10
  let leverageForTargetEdge = 0
  if (absDrift > 0) {
    let lo = 1e-6
    let hi = Math.max(recommendedLeverage, 1) * 4
    if (edgeAt(hi) > targetLongEdgePct) {
      for (let i = 0; i < 160; i++) {
        const mid = (lo + hi) / 2
        if (edgeAt(mid) < targetLongEdgePct) lo = mid
        else hi = mid
      }
      leverageForTargetEdge = lo
    } else leverageForTargetEdge = hi
  } else {
    leverageForTargetEdge = volMaxLeverage
  }

  return {
    asset,
    sdDaily,
    sdHourly,
    driftMaxLeverage,
    volMaxLeverage,
    sigmasRequired: args.sigmas,
    recommendedLeverage,
    bindingConstraint,
    equilibriumRatio,
    equilibriumShortSharePct:
      equilibriumRatio === null ? null : (1 / (1 + equilibriumRatio)) * 100,
    longResidualEvPct:
      longResidualEv === null ? null : longResidualEv * periodsPerYear * 100,
    fMaxForNeutral,
    fMaxForNeutralMultiple: fMaxForNeutral / params.fMax,
    targetLongEdgePct,
    leverageForTargetEdge,
    move1SdDailyPct: (Math.exp(sdDaily) - 1) * 100,
    move2SdDailyPct: (Math.exp(2 * sdDaily) - 1) * 100,
    move1Sd90dPct: (Math.exp(sdHourly * Math.sqrt(24 * 90)) - 1) * 100,
  }
}

/**
 * Default assumptions. Every one of these is a judgement call, not a
 * measurement — the UI exposes them so they can be argued with. BTC's are the
 * only ones measured from a live feed.
 */
export const DEFAULT_ASSETS: AssetAssumption[] = [
  {
    name: 'BTC',
    driftPct: 0,
    volPct: 43.0,
    tradingDays: 365,
    source: 'vol MEASURED from the live btc-usd oracle (8,831 hourly returns); drift set to 0 (no structural risk premium)',
  },
  {
    name: 'SPY',
    driftPct: 8,
    volPct: 16,
    tradingDays: 252,
    source: 'long-run US equity total return and realised vol - assumption',
  },
  {
    name: 'QQQ',
    driftPct: 11,
    volPct: 22,
    tradingDays: 252,
    source: 'long-run Nasdaq-100 return and vol - assumption',
  },
  {
    name: 'GOLD',
    driftPct: 5,
    volPct: 15,
    tradingDays: 252,
    source: 'long-run gold return and vol - assumption, least stable of the four',
  },
  {
    name: 'NVDA',
    driftPct: 15,
    volPct: 50,
    tradingDays: 252,
    source: 'single name: high vol, high but very uncertain drift, and SCHEDULED earnings gaps - assumption',
  },
  {
    name: 'MANIFOLD DAU',
    driftPct: -35.7,
    volPct: 157.3,
    tradingDays: 365,
    source: 'MEASURED from daily_stats, 390 days: 8.23%/day sigma, -35.7%/yr drift, and severe weekday seasonality',
  },
]
