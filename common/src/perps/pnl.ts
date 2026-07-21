// User-facing PnL helpers. Uses `originalCostBasis` (not the funding-adjusted
// `costBasis`) so the number matches what the user actually put in.

import { getPositionValue, getUnrealizedEquity } from './amm'
import { PerpDirection, PerpPosition } from './position'

export { getPositionValue, getUnrealizedEquity }

/**
 * Signed mana a position's value moves at the next funding event, at the
 * given price: positive = the position receives funding, negative = it
 * pays. Mirrors applyFunding exactly: the crowded side's size AND cost
 * basis scale by (1−f) — so a payer in profit also forfeits f of its
 * unrealized gains, not just f of margin — and the thin side scales up by
 * the transfer re-based on its own pool (f·L/S, resp. |f|·S/L), so with
 * imbalanced pools receivers earn more per mana of margin than payers pay.
 */
export const fundingPerPeriod = (
  position: Pick<
    PerpPosition,
    'direction' | 'size' | 'costBasis' | 'entryPrice'
  > & { direction: PerpDirection },
  price: number,
  fundingRate: number,
  poolLong: number,
  poolShort: number
): number => {
  const f = fundingRate
  if (!Number.isFinite(f) || f === 0) return 0
  if (!(poolLong > 0) || !(poolShort > 0)) return 0
  const value = getPositionValue(position as PerpPosition, price)
  if (!(value > 0)) return 0
  const scale =
    f > 0
      ? position.direction === 'long'
        ? 1 - f
        : 1 + (f * poolLong) / poolShort
      : position.direction === 'short'
      ? 1 + f
      : 1 + (-f * poolShort) / poolLong
  return (scale - 1) * value
}

/** Paper π: (P - Pe)/Pe · q (signed by direction). */
export const getUnrealizedPnl = (position: PerpPosition, price: number) =>
  getUnrealizedEquity(position, price)

/**
 * Profit as the user perceives it:
 *   currentValue - originalMargin
 * Funding haircut/bonus is absorbed into `currentValue`; user just sees the
 * delta against what they put in.
 */
export const getUserFacingPnl = (position: PerpPosition, price: number) =>
  getPositionValue(position, price) - position.originalCostBasis

/** Percentage form, using originalCostBasis as the denominator. */
export const getUserFacingPnlPercent = (
  position: PerpPosition,
  price: number
) => {
  if (position.originalCostBasis <= 0) return 0
  return getUserFacingPnl(position, price) / position.originalCostBasis
}
