/**
 * One period of the sandbox = one pass of what the scheduler does, in the
 * order backend/shared/src/perps/engine.ts does it:
 *
 *   1. oracle price applied   -> processLiquidations -> applyADL
 *      (engine: `applyOracleUpdate`, lines ~1403-1413)
 *   2. [optional] trade flow  -> openPosition + taker fee into own-side pool
 *   3. funding                -> computeFundingRate -> applyFundingWithSolvency
 *      (engine: `runFunding`, lines ~1676-1694; that helper re-runs ADL and
 *      asserts solvency on both sides of the transfer, exactly as prod does)
 *
 * Every transition is the imported function. This file only sequences them
 * and records what came out.
 */

import {
  accruePerpPositionTakerFee,
  applyADL,
  applyFundingWithSolvency,
  calcPerpTakerFee,
  creditPerpPoolFee,
  getPerpOpenInterest,
  getPerpOpenInterestCapacity,
  getPositionValue,
  openPosition,
  PerpDirection,
  PerpState,
  processLiquidations,
  solvencyFactor,
} from './common'

export type EscrowView = {
  escrow: number
  liabilityLong: number
  liabilityShort: number
  liability: number
  /** escrow − liability: what the market keeps if everyone closes here. */
  buffer: number
}

/**
 * What the pools would owe if every open position closed at `price`.
 *
 * `getPositionValue` is margin + unrealized floored at zero — exactly what the
 * close path pays out — so summing it is the market's mark-to-market liability.
 * Escrow minus that is the cushion the market is actually running on, and it is
 * the thing that moves when the price does. Pool BALANCES barely move while
 * nobody closes; what changes is what they owe.
 *
 * Lives here rather than in pathways.ts so the period loop can record it
 * without a circular import.
 */
export const escrowView = (state: PerpState, price: number): EscrowView => {
  const live = state.positions.filter((p) => p.size > 0)
  let liabilityLong = 0
  let liabilityShort = 0
  for (const p of live) {
    const v = getPositionValue(p, price)
    if (p.direction === 'long') liabilityLong += v
    else liabilityShort += v
  }
  const escrow = state.pool.L + state.pool.S
  const liability = liabilityLong + liabilityShort
  return {
    escrow,
    liabilityLong,
    liabilityShort,
    liability,
    buffer: escrow - liability,
  }
}
import { cloneState } from './book'
import { FundingParams, fundingRateFor, imbalanceRatio } from './model'

export type PricePath = (period: number) => number

export type TradeFlow = {
  /** Margin opened on each side per period (0 = no new trading). */
  marginLong: number
  marginShort: number
  leverageLong: number
  leverageShort: number
}

export const NO_FLOW: TradeFlow = {
  marginLong: 0,
  marginShort: 0,
  leverageLong: 1,
  leverageShort: 1,
}

export type SimParams = {
  funding: FundingParams
  periods: number
  price: PricePath
  takerFeeBps: number
  flow: TradeFlow
  contractId: string
}

export type SideSnapshot = {
  openInterest: number
  availableCover: number
  limit: number
  headroom: number
  utilization: number
  isWithinLimit: boolean
  solvency: number
}

export type PeriodRecord = {
  period: number
  price: number
  poolLong: number
  poolShort: number
  /** Ratio the model saw, and the rate it produced. */
  ratio: number
  rate: number
  /** Mana moved this period (always >= 0); `payer` says which way. */
  transfer: number
  payer: PerpDirection | 'none'
  cumulativeTransferLongPays: number
  cumulativeTransferShortPays: number
  long: SideSnapshot
  short: SideSnapshot
  numLiquidated: number
  liquidatedNotional: number
  adlFactorLong: number
  adlFactorShort: number
  adlSettledCount: number
  adlSettledPayout: number
  /** Flow opens refused by the capacity gate this period. */
  rejectedOpens: number
  /** Escrow, what it owes, and the difference — all at this period's price. */
  escrow: number
  liability: number
  buffer: number
  /** Set when a transition threw — prod would have aborted the tick too. */
  blocked?: string
}

export type SimResult = {
  records: PeriodRecord[]
  finalState: PerpState
  totalLongPays: number
  totalShortPays: number
  totalLiquidated: number
  totalAdlPeriods: number
  totalAdlSettledPayout: number
  blockedPeriods: number
  totalRejectedOpens: number
}

const sideSnapshot = (
  side: PerpDirection,
  state: PerpState,
  price: number
): SideSnapshot => {
  try {
    const cap = getPerpOpenInterestCapacity(side, state, price)
    return {
      openInterest: cap.openInterest,
      availableCover: cap.availableCover,
      limit: cap.limit,
      headroom: cap.headroom,
      utilization: cap.limit > 0 ? cap.openInterest / cap.limit : Infinity,
      isWithinLimit: cap.isWithinLimit,
      solvency: solvencyFactor(side, state, price),
    }
  } catch {
    return {
      openInterest: NaN,
      availableCover: NaN,
      limit: NaN,
      headroom: NaN,
      utilization: NaN,
      isWithinLimit: false,
      solvency: NaN,
    }
  }
}

/**
 * Open one position per side, charging the taker fee into that side's pool.
 *
 * Mirrors the trade endpoint's gate: an open that would push the side's open
 * interest past `getPerpOpenInterestCapacity(...).limit` is REJECTED, not
 * clamped. Without this the sandbox happily runs a book at 170% of its cap and
 * every capacity number downstream becomes fiction.
 */
const applyFlow = (
  state: PerpState,
  params: SimParams,
  period: number,
  price: number
): { state: PerpState; rejected: number } => {
  const { flow, takerFeeBps, contractId } = params
  let next = state
  let rejected = 0
  const sides: { dir: PerpDirection; margin: number; lev: number }[] = [
    { dir: 'long', margin: flow.marginLong, lev: flow.leverageLong },
    { dir: 'short', margin: flow.marginShort, lev: flow.leverageShort },
  ]
  for (const { dir, margin, lev } of sides) {
    if (!(margin > 0)) continue
    const userId = `flow-${dir}-${period}`
    const opened = openPosition(
      next,
      userId,
      contractId,
      dir,
      margin,
      lev,
      price,
      undefined,
      period
    )
    let candidate = opened.state
    const fee = calcPerpTakerFee(opened.deltaSize, takerFeeBps)
    if (fee > 0) {
      candidate = creditPerpPoolFee(candidate, dir, fee)
      candidate = accruePerpPositionTakerFee(
        candidate,
        opened.position,
        fee
      ).state
    }
    // Post-trade capacity check, exactly as the open path evaluates it.
    const cap = getPerpOpenInterestCapacity(dir, candidate, price)
    if (!cap.isWithinLimit) {
      rejected++
      continue
    }
    next = candidate
  }
  return { state: next, rejected }
}

export const runSim = (start: PerpState, params: SimParams): SimResult => {
  let state = cloneState(start)
  const records: PeriodRecord[] = []
  let cumLongPays = 0
  let cumShortPays = 0
  let totalLiquidated = 0
  let totalAdlPeriods = 0
  let totalAdlSettledPayout = 0
  let blockedPeriods = 0

  for (let period = 1; period <= params.periods; period++) {
    const price = params.price(period)
    let blocked: string | undefined

    // --- 1. oracle: liquidations then ADL ---
    let numLiquidated = 0
    let liquidatedNotional = 0
    let adlFactorLong = 1
    let adlFactorShort = 1
    let adlSettledCount = 0
    let adlSettledPayout = 0
    try {
      const liq = processLiquidations(state, price)
      numLiquidated = liq.liquidated.length
      liquidatedNotional = liq.liquidated.reduce((s, p) => s + p.size, 0)
      const adl = applyADL(liq.state, price)
      state = adl.state
      adlFactorLong = adl.adlFactorLong
      adlFactorShort = adl.adlFactorShort
      adlSettledCount = adl.settled.length
      adlSettledPayout = adl.settled.reduce((s, x) => s + x.payout, 0)
    } catch (error) {
      blocked = `oracle: ${
        error instanceof Error ? error.message : String(error)
      }`
    }

    // --- 2. optional new trading ---
    let rejectedOpens = 0
    if (!blocked) {
      try {
        const flowed = applyFlow(state, params, period, price)
        state = flowed.state
        rejectedOpens = flowed.rejected
      } catch (error) {
        blocked = `flow: ${
          error instanceof Error ? error.message : String(error)
        }`
      }
    }

    // --- 3. funding ---
    const ratio = imbalanceRatio(state, params.funding.imbalanceInput)
    const rate = blocked ? 0 : fundingRateFor(state, params.funding)
    const poolLongBefore = state.pool.L
    const poolShortBefore = state.pool.S
    let transfer = 0
    let payer: PerpDirection | 'none' = 'none'

    if (!blocked && rate !== 0) {
      try {
        const res = applyFundingWithSolvency(state, rate, price)
        // Measure the transfer off the funded (pre-ADL) pools rather than
        // recomputing f * pool: whatever applyFunding actually moved is the
        // number, including any clamping it applied.
        transfer = Math.abs(res.fundedState.pool.L - poolLongBefore)
        payer = rate > 0 ? 'long' : 'short'
        if (rate > 0) cumLongPays += transfer
        else cumShortPays += transfer
        state = res.state
        adlFactorLong = Math.min(adlFactorLong, res.adlFactorLong)
        adlFactorShort = Math.min(adlFactorShort, res.adlFactorShort)
        adlSettledCount += res.settled.length
        adlSettledPayout += res.settled.reduce((s, x) => s + x.payout, 0)
      } catch (error) {
        blocked = `funding: ${
          error instanceof Error ? error.message : String(error)
        }`
        transfer = 0
        payer = 'none'
      }
    }

    if (blocked) blockedPeriods++
    if (adlFactorLong < 1 || adlFactorShort < 1) totalAdlPeriods++
    totalLiquidated += numLiquidated
    totalAdlSettledPayout += adlSettledPayout

    records.push({
      period,
      price,
      poolLong: state.pool.L,
      poolShort: state.pool.S,
      ratio,
      rate,
      transfer,
      payer,
      cumulativeTransferLongPays: cumLongPays,
      cumulativeTransferShortPays: cumShortPays,
      long: sideSnapshot('long', state, price),
      short: sideSnapshot('short', state, price),
      numLiquidated,
      liquidatedNotional,
      adlFactorLong,
      adlFactorShort,
      adlSettledCount,
      adlSettledPayout,
      rejectedOpens,
      ...escrowView(state, price),
      blocked,
    })
  }

  return {
    records,
    finalState: state,
    totalLongPays: cumLongPays,
    totalShortPays: cumShortPays,
    totalLiquidated,
    totalAdlPeriods,
    totalAdlSettledPayout,
    blockedPeriods,
    totalRejectedOpens: records.reduce((s, r) => s + r.rejectedOpens, 0),
  }
}

/** Constant price. */
export const flatPath = (price: number): PricePath => () => price

/**
 * Linear drift to `endPrice` over `overPeriods`, flat thereafter.
 * Period 1 is the first post-move step, so a 48-period drop lands exactly on
 * `endPrice` at period 48.
 */
export const rampPath = (
  startPrice: number,
  endPrice: number,
  overPeriods: number
): PricePath => (period) => {
  if (period >= overPeriods) return endPrice
  return startPrice + ((endPrice - startPrice) * period) / overPeriods
}

/** Current open interest of a state, for reporting. */
export const stateOpenInterest = (state: PerpState) =>
  getPerpOpenInterest(state.positions)
