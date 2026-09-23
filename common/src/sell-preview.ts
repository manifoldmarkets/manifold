import { floatingGreater } from './util/math'

/** Quantities for the sell panel, including an empty or fully sold position. */
export const getSellPreviewAmounts = (
  shares: number,
  amount: number | undefined
) => {
  const hasSale =
    Number.isFinite(shares) &&
    floatingGreater(shares, 0) &&
    amount !== undefined &&
    Number.isFinite(amount) &&
    floatingGreater(amount, 0)
  // Preserve selling the fractional remainder when the displayed integer is sold.
  const isSellingAllShares = hasSale && amount === Math.floor(shares)
  const sellQuantity = hasSale ? (isSellingAllShares ? shares : amount) : 0
  const saleFrac =
    sellQuantity > 0 ? Math.min(sellQuantity, shares) / shares : 0
  return { isSellingAllShares, sellQuantity, saleFrac }
}
