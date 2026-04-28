// User-facing PnL helpers. Uses `originalCostBasis` (not the funding-adjusted
// `costBasis`) so the number matches what the user actually put in.

import { getPositionValue, getUnrealizedEquity } from './amm'
import { PerpPosition } from './position'

export { getPositionValue, getUnrealizedEquity }

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
