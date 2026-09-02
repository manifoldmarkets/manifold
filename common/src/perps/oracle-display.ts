import { formatPrice } from './format'

type OracleTickDecoration = {
  prefix?: string
  suffix?: string
}

// Oracle prices are plain numbers in storage. Keep their presentation metadata
// explicit and keyed by the stable feed id: inferring a unit from a market
// question would silently mislabel renamed or user-created markets.
//
// Exported (read-only) so the feed-table tests in backend/shared can assert
// that every feed in a spec table has an entry here; an index-point feed with
// no unit still gets an explicit empty entry so "missing" and "unitless" are
// different states.
export const ORACLE_TICK_DECORATIONS: Readonly<
  Record<string, OracleTickDecoration>
> = {
  'btc-usd': { prefix: '$' },
  'trump-approval-rating': { suffix: '%' },
  'votehub-generic-ballot-2026': { suffix: '%' },
  'vance-favorability': { suffix: '%' },
  // Index points on a 0-100 sentiment scale: a level, not a percentage.
  'crypto-fear-greed': {},
  'openrouter-open-weight-share': { suffix: '%' },
}

// Decimals needed to distinguish axis ticks `step` apart: 0 for steps >= 1,
// otherwise enough to render the step's leading digit. D3's linear ticks use
// 1/2/5 multiples, so this preserves every distinct tick without noisy zeros.
export const inferPriceTickDecimals = (step: number) => {
  if (!Number.isFinite(step) || step <= 0 || step >= 1) return 0
  return Math.min(6, Math.ceil(-Math.log10(step)))
}

export const formatOraclePriceTick = (
  feedId: string | undefined,
  value: number,
  step: number
) => {
  if (!Number.isFinite(value)) return '—'
  const { prefix = '', suffix = '' } =
    (feedId && ORACLE_TICK_DECORATIONS[feedId]) || {}
  return `${prefix}${formatPrice(value, inferPriceTickDecimals(step))}${suffix}`
}
