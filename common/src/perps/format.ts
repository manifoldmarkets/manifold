import {
  getPerpEffectiveTakerFeeBps,
  getPerpTakerFeeBps,
  getPerpTakerFeeImpact,
  perpFreshPositionFeeBps,
} from './fees'

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
//
// A positive rate NEVER renders as "0%". Two decimals bottom out at 0.5 bps,
// and a fee schedule is exactly the place a reader must not be told that
// something costing money is free — sub-0.01% reads as "<0.01%" instead.
// (Reachable: takerFeeBps is z.number().min(0).max(100) with no .int(), and
// a base of 0 with a small impact term prices a pool-sized entry at 0.33 bps.)
//
// The 1%/10% cutovers are taken on the ROUNDED value, so 9.99% cannot print
// as "10.0%" while 10.05% prints as "10%".
export const formatFeePct = (bps: number) => {
  if (!Number.isFinite(bps) || bps <= 0) return '0%'
  const pct = bps / 100
  if (pct < 0.005) return '<0.01%'
  if (Number(pct.toFixed(2)) < 1) return `${pct.toFixed(2)}%`
  if (Number(pct.toFixed(1)) < 10) return `${pct.toFixed(1)}%`
  return `${Math.round(pct)}%`
}

/**
 * formatFeePct for a slot that wants to mark the figure as approximate.
 * formatFeePct already returns an INEQUALITY below display precision
 * ("<0.01%"), which states its own imprecision — prefixing "~" there produced
 * the malformed "~<0.01%". Callers use this instead of writing the tilde (or
 * the word "about") themselves, so no surface has to remember the case.
 */
export const formatFeePctApprox = (bps: number) => {
  const pct = formatFeePct(bps)
  return pct.startsWith('<') ? pct : `~${pct}`
}

/** Pool shares the reader-facing fee examples are worked at. A pool-sized
 * entry is the intuitive unit ("as big as the market backing it"); 4x is the
 * calibration reference the impact default was chosen against (see
 * PERP_TAKER_FEE_IMPACT_DEFAULT). Named so the explainer, the info dialog and
 * that comment cannot drift to different examples. */
export const PERP_FEE_EXAMPLE_POOL_SHARES = [1, 4] as const

export type PerpFeeScheduleSummary = {
  baseBps: number // web open rate
  apiBps: number // API-key open rate (>= base; equals base when unset)
  /** Whether the API channel is worth a sentence of its own — true only when
   * it costs more AND that difference SURVIVES formatting. Comparing raw bps
   * is not enough: base 10 vs API 10.1 is a real difference the engine
   * charges, but every figure it produces renders identically at display
   * precision, so saying it twice reads as a bug rather than as information.
   * Gated here, not at each call site, so all surfaces agree on when to
   * speak. */
  apiDiffers: boolean
  impact: number
  hasSizeTerm: boolean
  /** Effective rates for a FRESH position at each example pool share, per
   * channel. The size term stacks on whichever base the CHANNEL selected —
   * the engine picks the base first and then scales — so the web figures are
   * simply wrong for an API open and both must be available to render. */
  poolSizedBps: number
  fourTimesPoolBps: number
  apiPoolSizedBps: number
  apiFourTimesPoolBps: number
}

/**
 * A market's fee schedule reduced to the numbers a reader needs, derived in
 * ONE place so the perp explainer and the market info dialog cannot quote the
 * same market two different ways. Every figure routes through
 * perpFreshPositionFeeBps -> perpSizeFeeDetails, i.e. the math the engine
 * charges from.
 *
 * Lives here rather than in fees.ts because it is a DISPLAY reduction — it
 * has to know how its numbers will be rendered (see apiDiffers) — and fees.ts
 * is on the engine's import path, which should not pull in a formatter.
 *
 * Total, like the getters it composes: corrupt legacy config reads as the
 * defaults rather than throwing inside a React render.
 */
export const perpFeeScheduleSummary = (contract: {
  takerFeeBps?: number
  takerFeeApiBps?: number
  takerFeeImpact?: number
}): PerpFeeScheduleSummary => {
  const baseBps = getPerpTakerFeeBps(contract)
  const apiBps = getPerpEffectiveTakerFeeBps(contract, true)
  const impact = getPerpTakerFeeImpact(contract)
  const [poolShare, bigShare] = PERP_FEE_EXAMPLE_POOL_SHARES
  const at = (b: number, share: number) =>
    perpFreshPositionFeeBps({ baseBps: b, impact, poolShare: share })
  const poolSizedBps = at(baseBps, poolShare)
  const fourTimesPoolBps = at(baseBps, bigShare)
  const apiPoolSizedBps = at(apiBps, poolShare)
  const apiFourTimesPoolBps = at(apiBps, bigShare)
  const rendersIdentically =
    formatFeePct(baseBps) === formatFeePct(apiBps) &&
    formatFeePct(poolSizedBps) === formatFeePct(apiPoolSizedBps) &&
    formatFeePct(fourTimesPoolBps) === formatFeePct(apiFourTimesPoolBps)
  return {
    baseBps,
    apiBps,
    apiDiffers: apiBps > baseBps && !rendersIdentically,
    impact,
    hasSizeTerm: impact > 0,
    poolSizedBps,
    fourTimesPoolBps,
    apiPoolSizedBps,
    apiFourTimesPoolBps,
  }
}
