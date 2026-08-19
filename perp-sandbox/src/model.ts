/**
 * The funding-rate model under test.
 *
 * Two knobs the real contract does not have:
 *   - `imbalanceInput`: which quantity feeds the ratio r. Prod on `main` (and
 *     everything deployed today) uses the POOLS; PR #3985 switches it to OPEN
 *     INTEREST. Both are the SAME imported `computeFundingRate` — only the two
 *     numbers handed to it differ. That is the whole point: no second
 *     implementation exists to drift.
 *   - `exponent` p: shapes the imbalance curve to I^p. p=1 is exactly prod and
 *     short-circuits to the imported result untouched.
 */

import {
  computeFundingRate,
  getPerpOpenInterest,
  imbalance,
  PerpState,
} from './common'

export type ImbalanceInput = 'pool' | 'openInterest'

export type FundingParams = {
  /** k — fundingSensitivity. */
  k: number
  /** f_max — maxFundingRate, per funding period. */
  fMax: number
  /** Which quantity's ratio drives the imbalance. */
  imbalanceInput: ImbalanceInput
  /** Convexity exponent on I. 1 = current model, exactly. */
  exponent: number
}

/** The two numbers fed to `computeFundingRate` under a given model. */
export const fundingInputs = (state: PerpState, input: ImbalanceInput) => {
  if (input === 'openInterest') {
    const oi = getPerpOpenInterest(state.positions)
    return { long: oi.long, short: oi.short }
  }
  return { long: state.pool.L, short: state.pool.S }
}

/**
 * Funding rate for one period.
 *
 * p = 1: returns prod's `computeFundingRate` verbatim — bit-identical to what
 * the engine would charge, including its zero-guards and its overflow-safe
 * normalisation of the ratio.
 *
 * p != 1: the base imbalance fraction I is RECOVERED from prod's own output
 * (|rate| / fMax === I by construction, since rate = ±I·fMax) and re-shaped as
 * I^p. Nothing is re-derived from r, so the deadband/convexity experiment
 * inherits prod's exact curve rather than a lookalike of it.
 */
export const fundingRateFor = (
  state: PerpState,
  params: FundingParams
): number => {
  const { long, short } = fundingInputs(state, params.imbalanceInput)
  const base = computeFundingRate(long, short, params.k, params.fMax)
  if (params.exponent === 1 || base === 0) return base
  if (!(params.fMax > 0) || !Number.isFinite(base)) return 0

  const fraction = Math.abs(base) / params.fMax
  const shaped = Math.pow(fraction, params.exponent) * params.fMax
  if (!Number.isFinite(shaped) || shaped === 0) return 0
  return base < 0 ? -shaped : shaped
}

/**
 * The imbalance ratio r = high/low for reporting. Reported, never used to
 * compute the rate — `fundingRateFor` goes through the imported function so
 * that the ratio's numerical edge cases stay prod's problem, not ours.
 */
export const imbalanceRatio = (state: PerpState, input: ImbalanceInput) => {
  const { long, short } = fundingInputs(state, input)
  const high = Math.max(long, short)
  const low = Math.min(long, short)
  if (!(low > 0) || !Number.isFinite(high)) return Infinity
  return high / low
}

/** I(r) at an arbitrary ratio, straight from common/. For sweep tables. */
export const imbalanceAt = (r: number, k: number, exponent = 1) => {
  const base = imbalance(r, k)
  return exponent === 1 ? base : Math.pow(base, exponent)
}

/** Rate a hypothetical ratio r would produce under these params. */
export const rateAtRatio = (r: number, params: FundingParams) =>
  imbalanceAt(r, params.k, params.exponent) * params.fMax

/**
 * Compounded drag over n periods of a constant rate: 1 - (1-f)^n.
 * The paying pool is multiplied by (1-f) each period, so cost compounds
 * geometrically rather than adding up linearly.
 */
export const compoundedDrag = (ratePerPeriod: number, periods: number) =>
  1 - Math.pow(1 - Math.abs(ratePerPeriod), periods)
