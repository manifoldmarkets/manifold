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

/**
 * Short countdown for "next funding in …": minutes under two hours (ceil,
 * floored at 1m so it never shows "0m" while still pending), whole hours
 * beyond. Daily-period contracts count down from 24h — "23h", not "1380m".
 */
export const formatCountdown = (ms: number): string => {
  if (!Number.isFinite(ms)) return '—'
  const MINUTE = 60_000
  const HOUR = 60 * MINUTE
  if (ms < 2 * HOUR) return `${Math.max(1, Math.ceil(ms / MINUTE))}m`
  return `${Math.round(ms / HOUR)}h`
}

// Fees display as PERCENTAGES — traders don't think in bps. Two decimals
// below 1% keep the base (0.10%) and a small size term legible; larger fees
// don't need the precision. Shared by the bet panel's quote, the market info
// dialog, and the perp explainer so one fee never reads two ways.
export const formatFeePct = (bps: number) => {
  if (!Number.isFinite(bps) || bps <= 0) return '0%'
  const pct = bps / 100
  return `${
    pct < 1 ? pct.toFixed(2) : pct < 10 ? pct.toFixed(1) : Math.round(pct)
  }%`
}
