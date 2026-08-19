/**
 * Market-pathway and drift analysis.
 *
 * Two questions the scenario runner could not answer:
 *
 *  1. "If the price does X over time T, what happens to the pools?" — needs the
 *     escrow/liability split, not just pool balances. Pool balances barely move
 *     when nobody closes; what moves is what the pools OWE.
 *
 *  2. "Can funding offset an asset that drifts up?" — needs the EV of holding,
 *     which is drift on NOTIONAL against funding on MARGIN.
 *
 * As everywhere else, no formula is typed here: position values come from
 * `getPositionValue`, rates from `fundingRateFor`, and the inverse of the
 * imbalance curve is found by bisecting the imported `imbalance` rather than
 * by writing its algebraic inverse.
 */

import {
  getPerpOpenInterest,
  getPositionValue,
  imbalance,
  PerpState,
} from './common'
import { cloneState } from './book'
import { FundingParams, rateAtRatio } from './model'
import { escrowView, rampPath, runSim, TradeFlow } from './sim'
import type { EscrowView } from './sim'

export { escrowView } from './sim'
export type { EscrowView } from './sim'

// ───────────────────────── pathway grid ─────────────────────────

export type PathwayCell = {
  movePct: number
  periods: number
  days: number
  endPrice: number
  poolLong: number
  poolShort: number
  escrow: number
  liability: number
  buffer: number
  bufferDelta: number
  fundingMoved: number
  fundingPayer: 'long' | 'short' | 'none'
  liquidations: number
  adlPeriods: number
  worstAdl: number
  blocked: number
  longUtil: number | null
  shortUtil: number | null
  oiLong: number
  oiShort: number
}

export type PathwayGrid = {
  base: EscrowView & { price: number; oiLong: number; oiShort: number }
  moves: number[]
  horizons: { periods: number; days: number; label: string }[]
  cells: PathwayCell[][]
}

/**
 * Run the book down every (price move × horizon) combination and report where
 * the market ends up. The move is ramped over `rampPeriods` then held, so a
 * long horizon means "moved and then sat there", which is the case that lets
 * funding accumulate.
 */
export const pathwayGrid = (args: {
  state: PerpState
  price: number
  funding: FundingParams
  moves: number[]
  horizons: { periods: number; days: number; label: string }[]
  rampPeriods: number
  takerFeeBps: number
  flow: TradeFlow
  contractId: string
}): PathwayGrid => {
  const { state, price, funding } = args
  const base = escrowView(state, price)
  const baseOi = getPerpOpenInterest(state.positions)

  const cells = args.moves.map((movePct) => {
    const endPrice = price * (1 + movePct / 100)
    return args.horizons.map((h) => {
      const res = runSim(cloneState(state), {
        funding,
        periods: h.periods,
        price: rampPath(
          price,
          endPrice,
          Math.max(1, Math.min(args.rampPeriods, h.periods))
        ),
        takerFeeBps: args.takerFeeBps,
        flow: args.flow,
        contractId: args.contractId,
      })
      const last = res.records[res.records.length - 1]
      const view = escrowView(res.finalState, endPrice)
      const oi = getPerpOpenInterest(res.finalState.positions)
      const moved = Math.max(res.totalLongPays, res.totalShortPays)
      return {
        movePct,
        periods: h.periods,
        days: h.days,
        endPrice,
        poolLong: res.finalState.pool.L,
        poolShort: res.finalState.pool.S,
        escrow: view.escrow,
        liability: view.liability,
        buffer: view.buffer,
        bufferDelta: view.buffer - base.buffer,
        fundingMoved: moved,
        fundingPayer:
          res.totalLongPays > res.totalShortPays
            ? ('long' as const)
            : res.totalShortPays > 0
            ? ('short' as const)
            : ('none' as const),
        liquidations: res.totalLiquidated,
        adlPeriods: res.totalAdlPeriods,
        worstAdl: Math.min(
          ...res.records.map((r) => Math.min(r.adlFactorLong, r.adlFactorShort))
        ),
        blocked: res.blockedPeriods,
        longUtil: Number.isFinite(last.long.utilization)
          ? last.long.utilization
          : null,
        shortUtil: Number.isFinite(last.short.utilization)
          ? last.short.utilization
          : null,
        oiLong: oi.long,
        oiShort: oi.short,
      }
    })
  })

  return {
    base: { ...base, price, oiLong: baseOi.long, oiShort: baseOi.short },
    moves: args.moves,
    horizons: args.horizons,
    cells,
  }
}

// ───────────────────────── drift / EV ─────────────────────────

/**
 * Smallest imbalance ratio whose funding rate reaches `targetRate`.
 *
 * Bisects the IMPORTED `imbalance` rather than writing its algebraic inverse,
 * so the curve being inverted is always the one prod uses. Returns null when
 * the target is unreachable at any ratio (i.e. it exceeds f_max, since
 * I(r) -> 1 as r -> infinity).
 */
export const ratioForRate = (
  targetRate: number,
  params: FundingParams,
  maxRatio = 1e6
): number | null => {
  if (!(targetRate > 0)) return 1
  const target = targetRate / params.fMax
  if (!(target < 1)) return null
  const shaped = (r: number) =>
    Math.pow(imbalance(r, params.k), params.exponent)
  if (shaped(maxRatio) < target) return null
  let lo = 1
  let hi = maxRatio
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (shaped(mid) < target) lo = mid
    else hi = mid
  }
  return hi
}

export type DriftRow = {
  leverage: number
  /** Expected PnL per period as a fraction of MARGIN: drift x leverage. */
  driftOnMargin: number
  /** Funding actually charged per period as a fraction of margin, at f_max. */
  fundingAtCap: number
  /** Funding rate needed to make holding EV-neutral. */
  requiredRate: number
  /** f_max multiple that would be needed. */
  requiredFMaxMultiple: number
  /** Imbalance ratio needed at the CURRENT f_max, or null if unreachable. */
  requiredRatio: number | null
  coveredAtCap: boolean
}

export type DriftAnalysis = {
  annualDriftPct: number
  periodHours: number
  driftPerPeriod: number
  fMax: number
  rows: DriftRow[]
  /** Aggregate leak: drift on NET open interest, which funding cannot offset. */
  netOi: number
  netLeakPerDay: number
  netLeakPerYear: number
  escrow: number
  leakAsShareOfEscrowPerYear: number
  /** Cap-bounded worst case: max long OI the current cover permits. */
  maxLongOi: number
  maxNetLeakPerYear: number
}

export const driftAnalysis = (args: {
  state: PerpState
  price: number
  params: FundingParams
  annualDriftPct: number
  periodHours: number
  leverages: number[]
  maxLongOi: number
}): DriftAnalysis => {
  const periodsPerYear = (365 * 24) / args.periodHours
  const driftPerPeriod = args.annualDriftPct / 100 / periodsPerYear
  const oi = getPerpOpenInterest(args.state.positions)
  const netOi = oi.long - oi.short
  const escrow = args.state.pool.L + args.state.pool.S

  const rows = args.leverages.map((leverage) => {
    // Drift accrues on notional; funding is charged on margin. Per unit of
    // margin that is drift x leverage against funding x 1.
    const driftOnMargin = driftPerPeriod * leverage
    const requiredRate = driftOnMargin
    const requiredRatio = ratioForRate(requiredRate, args.params)
    return {
      leverage,
      driftOnMargin,
      fundingAtCap: args.params.fMax,
      requiredRate,
      requiredFMaxMultiple: requiredRate / args.params.fMax,
      requiredRatio,
      coveredAtCap: requiredRate <= args.params.fMax,
    }
  })

  const netLeakPerYear = (args.annualDriftPct / 100) * netOi
  return {
    annualDriftPct: args.annualDriftPct,
    periodHours: args.periodHours,
    driftPerPeriod,
    fMax: args.params.fMax,
    rows,
    netOi,
    netLeakPerDay: netLeakPerYear / 365,
    netLeakPerYear,
    escrow,
    leakAsShareOfEscrowPerYear: escrow > 0 ? netLeakPerYear / escrow : Infinity,
    maxLongOi: args.maxLongOi,
    maxNetLeakPerYear: (args.annualDriftPct / 100) * args.maxLongOi,
  }
}

// ───────────────────────── crowding equilibrium ─────────────────────────

/**
 * Where does a one-sided market settle, and is being the unpopular side paid
 * enough to be worth it?
 *
 * This is modelling ON TOP of prod's math, not prod behaviour: prod has no
 * notion of trader EV. Only f(r) comes from common/ (via `rateAtRatio`, which
 * bottoms out in the imported `imbalance`). The EV algebra is ours.
 *
 * Setup: longs at leverage L_long, shorts at L_short, open-interest ratio
 * r = OI_long / OI_short > 1, drift mu per period.
 *
 *   funding rate            f = f(r)                       [from common/]
 *   transfer                delta = f * poolLong           [applyFunding]
 *   short's gain rate       g = delta / poolShort = f * (poolLong / poolShort)
 *   pools from margins      poolLong/poolShort = r * L_short / L_long
 *   short EV per margin     g - mu * L_short
 *                         = L_short * (f * r / L_long - mu)
 *   long  EV per margin     mu * L_long - f
 *
 * Two things fall out. Short leverage CANCELS from the short's break-even, so
 * the equilibrium ratio doesn't depend on it. And the short's reward is
 * AMPLIFIED by the pool ratio: the scarcer the short side, the more each unit
 * of short margin collects — which is what makes the ratio self-correcting.
 */
export type EquilibriumRow = {
  ratio: number
  shortSharePct: number
  fundingRate: number
  /** Short's funding yield per period per unit of margin, after amplification. */
  shortYield: number
  shortDriftCost: number
  shortEv: number
  longDriftGain: number
  longFundingCost: number
  longEv: number
  shortAttractive: boolean
}

export type EquilibriumAnalysis = {
  driftPerPeriod: number
  longLeverage: number
  shortLeverage: number
  /** Ratio where the short side is exactly EV-neutral: the settling point. */
  equilibriumRatio: number | null
  equilibriumShortSharePct: number | null
  /** Is the long side still +EV there? (It usually is — see the note.) */
  longEvAtEquilibrium: number | null
  rows: EquilibriumRow[]
  /** f_max needed to hold a given short share, at this drift and leverage. */
  required: { shortSharePct: number; ratio: number; fMaxNeeded: number; multipleOfCurrent: number }[]
}

const evAt = (
  r: number,
  params: FundingParams,
  driftPerPeriod: number,
  longLeverage: number,
  shortLeverage: number
): EquilibriumRow => {
  const f = rateAtRatio(r, params)
  const poolRatio = (r * shortLeverage) / longLeverage
  const shortYield = f * poolRatio
  const shortDriftCost = driftPerPeriod * shortLeverage
  const longDriftGain = driftPerPeriod * longLeverage
  return {
    ratio: r,
    shortSharePct: (1 / (1 + r)) * 100,
    fundingRate: f,
    shortYield,
    shortDriftCost,
    shortEv: shortYield - shortDriftCost,
    longDriftGain,
    longFundingCost: f,
    longEv: longDriftGain - f,
    shortAttractive: shortYield > shortDriftCost,
  }
}

export const equilibriumAnalysis = (args: {
  params: FundingParams
  annualDriftPct: number
  periodHours: number
  longLeverage: number
  shortLeverage: number
  ratios: number[]
  targetShortShares: number[]
}): EquilibriumAnalysis => {
  const periodsPerYear = (365 * 24) / args.periodHours
  const driftPerPeriod = args.annualDriftPct / 100 / periodsPerYear
  const row = (r: number) =>
    evAt(r, args.params, driftPerPeriod, args.longLeverage, args.shortLeverage)

  // Settling point: shorts stop entering when their EV hits zero. shortEv is
  // decreasing in r's inverse — bisect on the sign change.
  let equilibriumRatio: number | null = null
  const lo0 = 1.0000001
  const hi0 = 1e6
  if (row(lo0).shortEv < 0 && row(hi0).shortEv > 0) {
    let lo = lo0
    let hi = hi0
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2
      if (row(mid).shortEv < 0) lo = mid
      else hi = mid
    }
    equilibriumRatio = hi
  } else if (row(lo0).shortEv >= 0) {
    equilibriumRatio = 1 // shorts paid even at balance
  }

  // What f_max would hold a chosen short share? Short EV = 0 requires
  // f(r)*r = mu*L_long, and f scales linearly in f_max, so solve directly.
  const required = args.targetShortShares.map((sharePct) => {
    const r = (100 - sharePct) / sharePct
    const unit = rateAtRatio(r, { ...args.params, fMax: 1 })
    const fMaxNeeded =
      unit * r > 0
        ? (driftPerPeriod * args.longLeverage) / (unit * r)
        : Infinity
    return {
      shortSharePct: sharePct,
      ratio: r,
      fMaxNeeded,
      multipleOfCurrent: fMaxNeeded / args.params.fMax,
    }
  })

  return {
    driftPerPeriod,
    longLeverage: args.longLeverage,
    shortLeverage: args.shortLeverage,
    equilibriumRatio,
    equilibriumShortSharePct:
      equilibriumRatio === null ? null : (1 / (1 + equilibriumRatio)) * 100,
    longEvAtEquilibrium:
      equilibriumRatio === null ? null : row(equilibriumRatio).longEv,
    rows: args.ratios.map(row),
    required,
  }
}

// ───────────────────────── shock response ─────────────────────────

/**
 * What actually protects the buffer against a sharp move?
 *
 * Runs the same shock under a grid of funding settings and, separately, under
 * added subsidy, so the two can be compared on one number: the buffer left
 * after the move.
 */
export type ShockRow = {
  label: string
  k: number
  fMaxMultiple: number
  subsidy: number
  buffer: number
  bufferDelta: number
  liquidations: number
  adlPeriods: number
  fundingMoved: number
}

export const shockResponse = (args: {
  state: PerpState
  price: number
  movePct: number
  periods: number
  rampPeriods: number
  base: FundingParams
  ks: number[]
  fMaxMultiples: number[]
  subsidies: number[]
  takerFeeBps: number
  flow: TradeFlow
  contractId: string
}): { baseline: number; funding: ShockRow[]; subsidy: ShockRow[] } => {
  const endPrice = args.price * (1 + args.movePct / 100)
  const baseline = escrowView(args.state, args.price).buffer

  const run = (state: PerpState, params: FundingParams) => {
    const res = runSim(cloneState(state), {
      funding: params,
      periods: args.periods,
      price: rampPath(args.price, endPrice, args.rampPeriods),
      takerFeeBps: args.takerFeeBps,
      flow: args.flow,
      contractId: args.contractId,
    })
    return {
      view: escrowView(res.finalState, endPrice),
      res,
    }
  }

  const funding: ShockRow[] = []
  for (const k of args.ks) {
    for (const mult of args.fMaxMultiples) {
      const params = { ...args.base, k, fMax: args.base.fMax * mult }
      const { view, res } = run(args.state, params)
      funding.push({
        label: `k=${k}, f_max=${mult}x`,
        k,
        fMaxMultiple: mult,
        subsidy: 0,
        buffer: view.buffer,
        bufferDelta: view.buffer - baseline,
        liquidations: res.totalLiquidated,
        adlPeriods: res.totalAdlPeriods,
        fundingMoved: Math.max(res.totalLongPays, res.totalShortPays),
      })
    }
  }

  const subsidy: ShockRow[] = args.subsidies.map((added) => {
    const seeded: PerpState = {
      pool: { L: args.state.pool.L + added / 2, S: args.state.pool.S + added / 2 },
      positions: args.state.positions.map((p) => ({ ...p })),
    }
    const { view, res } = run(seeded, args.base)
    return {
      label: added === 0 ? 'no subsidy' : `+${added}`,
      k: args.base.k,
      fMaxMultiple: 1,
      subsidy: added,
      buffer: view.buffer,
      bufferDelta: view.buffer - baseline,
      liquidations: res.totalLiquidated,
      adlPeriods: res.totalAdlPeriods,
      fundingMoved: Math.max(res.totalLongPays, res.totalShortPays),
    }
  })

  return { baseline, funding, subsidy }
}

// ───────────────────────── subsidy ─────────────────────────

export type SubsidyRow = {
  added: number
  poolLong: number
  poolShort: number
  escrow: number
  longLimit: number
  shortLimit: number
  longHeadroom: number
  maxNetLeakPerYear: number
}

/**
 * What a subsidy buys. Added mana is split between the pools, which raises each
 * side's cover and therefore the open-interest cap it can back — and the cap is
 * what bounds how much net exposure the drift can act on.
 */
export const subsidyLadder = (args: {
  state: PerpState
  price: number
  amounts: number[]
  splitToLong: number
  annualDriftPct: number
  coverMultiple: number
}): SubsidyRow[] => {
  const reserved = (side: 'long' | 'short') =>
    args.state.positions
      .filter((p) => p.direction === side && p.size > 0)
      .reduce(
        (s, p) => s + Math.min(p.costBasis, getPositionValue(p, args.price)),
        0
      )
  const resLong = reserved('long')
  const resShort = reserved('short')

  return args.amounts.map((added) => {
    const toLong = added * args.splitToLong
    const toShort = added - toLong
    const L = args.state.pool.L + toLong
    const S = args.state.pool.S + toShort
    const longLimit = Math.max(S - resShort, 0) * args.coverMultiple
    const shortLimit = Math.max(L - resLong, 0) * args.coverMultiple
    const oi = getPerpOpenInterest(args.state.positions)
    return {
      added,
      poolLong: L,
      poolShort: S,
      escrow: L + S,
      longLimit,
      shortLimit,
      longHeadroom: Math.max(longLimit - oi.long, 0),
      maxNetLeakPerYear: (args.annualDriftPct / 100) * longLimit,
    }
  })
}
