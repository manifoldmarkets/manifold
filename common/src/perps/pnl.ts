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
 *   currentValue - originalMargin - openingFees
 * Funding haircut/bonus is absorbed into `currentValue`; user just sees the
 * delta against what they put in.
 */
export const getUserFacingPnl = (position: PerpPosition, price: number) => {
  const totalCost = getValidatedPerpPositionTotalCost(position)
  return totalCost === undefined
    ? 0
    : getPositionValue(position, price) - totalCost
}

/** Total cash committed to a live position: margin plus opening/add fees. */
const getValidatedPerpPositionTotalCost = (
  position: Pick<PerpPosition, 'originalCostBasis' | 'takerFeeCostBasis'>
) => {
  const { originalCostBasis, takerFeeCostBasis = 0 } = position
  if (
    !Number.isFinite(originalCostBasis) ||
    originalCostBasis < 0 ||
    !Number.isFinite(takerFeeCostBasis) ||
    takerFeeCostBasis < 0
  )
    return undefined
  const total = originalCostBasis + takerFeeCostBasis
  return Number.isFinite(total) ? total : undefined
}

export const getPerpPositionTotalCost = (
  position: Pick<PerpPosition, 'originalCostBasis' | 'takerFeeCostBasis'>
) => getValidatedPerpPositionTotalCost(position) ?? 0

/**
 * Oracle/close price required to reach a user-facing PnL target. The target
 * is net of all opening/add fees already paid; future funding is necessarily
 * excluded. Returns undefined when the inputs cannot describe a valid target.
 */
export const getPerpPriceForUserFacingPnl = (
  position: Pick<
    PerpPosition,
    | 'direction'
    | 'size'
    | 'costBasis'
    | 'originalCostBasis'
    | 'takerFeeCostBasis'
    | 'entryPrice'
  >,
  targetPnl: number
): number | undefined => {
  const { direction, size, costBasis, entryPrice } = position
  const totalCost = getValidatedPerpPositionTotalCost(position)
  if (
    (direction !== 'long' && direction !== 'short') ||
    !Number.isFinite(size) ||
    size <= 0 ||
    !Number.isFinite(costBasis) ||
    costBasis < 0 ||
    !Number.isFinite(entryPrice) ||
    entryPrice <= 0 ||
    totalCost === undefined ||
    totalCost <= 0 ||
    !Number.isFinite(targetPnl) ||
    targetPnl < 0
  )
    return undefined

  const targetValue = totalCost + targetPnl
  const pricePnlNeeded = targetValue - costBasis
  const relativeMove = pricePnlNeeded / size
  const directionSign = direction === 'long' ? 1 : -1
  const targetPrice = entryPrice * (1 + directionSign * relativeMove)
  return Number.isFinite(targetPrice) && targetPrice > 0
    ? targetPrice
    : undefined
}

/**
 * Realized PnL shown on close receipts, history, and ledger rows. Settlement
 * payout already contains every funding transfer, so compare it with the
 * margin the user actually deposited rather than the funding-scaled basis.
 */
export const getUserFacingPnlFromPayout = (
  payout: number,
  originalCostBasis: number,
  takerFeeCostBasis = 0
) => {
  if (
    !Number.isFinite(payout) ||
    payout < 0 ||
    !Number.isFinite(originalCostBasis) ||
    originalCostBasis < 0 ||
    !Number.isFinite(takerFeeCostBasis) ||
    takerFeeCostBasis < 0
  )
    return 0
  const pnl = payout - originalCostBasis - takerFeeCostBasis
  return Number.isFinite(pnl) ? pnl : 0
}

/** Percentage form, using total cash committed as the denominator. */
export const getUserFacingPnlPercent = (
  position: PerpPosition,
  price: number
) => {
  const totalCost = getPerpPositionTotalCost(position)
  if (totalCost <= 0) return 0
  return getUserFacingPnl(position, price) / totalCost
}
