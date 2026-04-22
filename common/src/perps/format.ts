// Infer how many decimal places to show for an oracle-price-style value.
// Heuristic: if every sample is integer-valued, show 0 decimals; otherwise
// scale decimals to the value's magnitude so big prices don't look like
// "43210.5200" and small rates don't collapse to "0.00".
//
// Pass all the values you plan to render (chart series, or [currentPrice])
// so a single integer sample (e.g. 39) picks 0 decimals but mixed series
// like [39, 39.5, 40] correctly pick 1+.

export const inferPriceDecimals = (values: number[]): number => {
  const finite = values.filter((v) => Number.isFinite(v))
  if (finite.length === 0) return 2
  if (finite.every((v) => v === Math.round(v))) return 0
  const maxAbs = Math.max(...finite.map((v) => Math.abs(v)))
  if (maxAbs >= 1000) return 2
  if (maxAbs >= 1) return 3
  if (maxAbs >= 0.01) return 5
  return 6
}

export const formatPrice = (value: number, decimals: number) => {
  if (!Number.isFinite(value)) return '—'
  // Use toLocaleString so big numbers get thousands separators; keep the
  // exact decimal count from `decimals`.
  return value.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}
