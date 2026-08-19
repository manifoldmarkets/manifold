import { MINUTE_MS } from '../util/time'

export type OraclePoint = {
  /**
   * Feed-defined effective timestamp used to order source observations. The
   * database separately records when Manifold first published the immutable
   * row, because delayed/batched providers can make those times differ.
   */
  ts: number
  price: number
  /**
   * Provider-declared timestamp for the source dataset used to derive this
   * observation. This may equal `ts`; it is separate attribution metadata.
   */
  sourceTs?: number
}

export type NormalizedOraclePointBatch =
  | { ok: true; points: OraclePoint[] }
  | { ok: false; reason: string }

export const MAX_ORACLE_FUTURE_SKEW_MS = 5 * MINUTE_MS

export type OracleFreshness = {
  status: 'fresh' | 'stale' | 'unknown'
  /** Non-negative age for display and diagnostics; null when inputs are invalid. */
  ageMs: number | null
}

/**
 * Classify the executable price cached on a PERP contract.
 *
 * Missing/invalid timestamps and invalid market tolerances are `unknown`, not
 * fresh: callers must pause execution when status is anything but `fresh`.
 * Future timestamps within the ingestion skew allowance have age zero.
 */
export const getOracleFreshness = (
  oraclePriceTime: number | undefined,
  maxAgeMs: number,
  now = Date.now()
): OracleFreshness => {
  if (
    typeof oraclePriceTime !== 'number' ||
    !Number.isFinite(oraclePriceTime) ||
    oraclePriceTime <= 0 ||
    !Number.isFinite(maxAgeMs) ||
    maxAgeMs <= 0 ||
    !Number.isFinite(now) ||
    now <= 0
  ) {
    return { status: 'unknown', ageMs: null }
  }

  const rawAgeMs = now - oraclePriceTime
  if (!Number.isFinite(rawAgeMs) || rawAgeMs < -MAX_ORACLE_FUTURE_SKEW_MS) {
    return { status: 'unknown', ageMs: null }
  }
  const ageMs = Math.max(rawAgeMs, 0)
  return {
    status: rawAgeMs > maxAgeMs ? 'stale' : 'fresh',
    ageMs,
  }
}

/**
 * Scale-independent endpoint movement for ranking numeric oracle markets.
 * Invalid persisted values contribute no movement instead of surfacing NaN.
 */
export const getOracleLogPriceChange = (
  currentPrice: number,
  previousPrice: number
) => {
  if (
    !Number.isFinite(currentPrice) ||
    !Number.isFinite(previousPrice) ||
    currentPrice <= 0 ||
    previousPrice <= 0
  )
    return 0

  // Subtract logs instead of taking current / previous so two extreme but
  // finite values cannot overflow or underflow the ratio first.
  const change = Math.abs(Math.log(currentPrice) - Math.log(previousPrice))
  return Number.isFinite(change) ? change : 0
}

export const validateBasicOraclePoint = (
  point: OraclePoint,
  now = Date.now()
): string | null => {
  if (!Number.isFinite(point.ts) || point.ts <= 0)
    return `invalid timestamp ${point.ts}`
  if (point.ts > now + MAX_ORACLE_FUTURE_SKEW_MS)
    return `timestamp ${point.ts} is more than ${MAX_ORACLE_FUTURE_SKEW_MS}ms in the future`
  if (!Number.isFinite(point.price) || point.price <= 0)
    return `non-positive price ${point.price}`
  if (
    point.sourceTs != null &&
    (!Number.isFinite(point.sourceTs) || point.sourceTs <= 0)
  )
    return `invalid source timestamp ${point.sourceTs}`
  if (
    point.sourceTs != null &&
    point.sourceTs > now + MAX_ORACLE_FUTURE_SKEW_MS
  )
    return `source timestamp ${point.sourceTs} is more than ${MAX_ORACLE_FUTURE_SKEW_MS}ms in the future`
  return null
}

/**
 * Sort and deduplicate a batch before publishing it into immutable history.
 *
 * Exact redelivery is harmless. Two prices for one timestamp are not: an
 * `on conflict do nothing` insert would otherwise make the executable value
 * depend on input order, and the losing value cannot be corrected in place.
 * Reject the whole batch so the source can be investigated instead.
 */
export const normalizeOraclePointBatch = (
  points: readonly OraclePoint[]
): NormalizedOraclePointBatch => {
  const sorted = [...points].sort((a, b) => a.ts - b.ts)
  const normalized: OraclePoint[] = []

  for (const point of sorted) {
    const previous = normalized[normalized.length - 1]
    if (!previous || previous.ts !== point.ts) {
      normalized.push(point)
      continue
    }
    if (previous.price !== point.price) {
      return {
        ok: false,
        reason: `timestamp ${point.ts} has conflicting prices ${previous.price} and ${point.price}`,
      }
    }
    if (
      previous.sourceTs != null &&
      point.sourceTs != null &&
      previous.sourceTs !== point.sourceTs
    ) {
      return {
        ok: false,
        reason: `timestamp ${point.ts} has conflicting source timestamps ${previous.sourceTs} and ${point.sourceTs}`,
      }
    }
    // Make metadata enrichment independent of the input order while retaining
    // an existing source timestamp when an exact redelivery omits it.
    if (previous.sourceTs == null && point.sourceTs != null)
      normalized[normalized.length - 1] = point
  }

  return { ok: true, points: normalized }
}

/**
 * Median of independently sourced positive values, provided at least one
 * adjacent pair agrees within the configured relative spread.
 *
 * A median alone is unsafe with exactly two sources because one bad source
 * can drag their midpoint arbitrarily. The agreement gate makes a two-source
 * fallback usable while retaining the median's one-outlier resistance when
 * three or more values are available.
 */
/**
 * Whether two sorted prices are within a divergence tolerance of each other.
 *
 * Multiplicative rather than the obvious `(b - a) / a <= frac`. The
 * subtractive form performs three rounding steps and gets exact boundaries
 * wrong: `(3.06 - 3) / 3` evaluates to 0.020000000000000018 and rejects a pair
 * that is exactly 2% apart. Worse, it does so unevenly — `[100, 102]` happens
 * to round favourably while `[68365.55, 69732.861]` does not — so whether a
 * legitimate pair is accepted depends on the price level, and on a four-source
 * feed a spurious rejection can split one cluster into two and turn a clear
 * consensus into an "ambiguous" one that publishes nothing.
 *
 * The epsilon absorbs the residual error of the single remaining multiply. At
 * 1e-9 relative it is orders of magnitude below any price difference that
 * could matter — on a $68k mark it widens a 2% band by about a thousandth of a
 * cent — while removing the boundary flapping entirely.
 */
const BOUNDARY_EPSILON = 1e-9

const withinTolerance = (lower: number, upper: number, frac: number) =>
  upper <= lower * (1 + frac) * (1 + BOUNDARY_EPSILON)

export const getConsensusMedian = (
  values: readonly number[],
  maxPairDivergenceFrac: number
): number | null => {
  if (!Number.isFinite(maxPairDivergenceFrac) || maxPairDivergenceFrac <= 0)
    return null

  const sorted = values
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b)
  if (sorted.length < 2) return null

  // Partition into maximal runs whose neighbours are all within tolerance.
  // Taking the median of EVERY quote once any single pair agreed was wrong as
  // soon as more than three venues could answer: [100, 101, 110, 111] has two
  // agreeing pairs and returns 105.5, a price no venue reported and neither
  // cluster supports. It also let an outlier drag the result — [100, 101,
  // 10000] returned 101 rather than the level the two agreeing venues found.
  const clusters: number[][] = []
  let current: number[] = [sorted[0]]
  for (let i = 1; i < sorted.length; i++) {
    if (withinTolerance(sorted[i - 1], sorted[i], maxPairDivergenceFrac))
      current.push(sorted[i])
    else {
      clusters.push(current)
      current = [sorted[i]]
    }
  }
  clusters.push(current)

  // A lone quote is unconfirmed by definition; only a cluster of two or more
  // is corroborated.
  const corroborated = clusters.filter((cluster) => cluster.length >= 2)
  if (corroborated.length === 0) return null

  const largest = Math.max(...corroborated.map((cluster) => cluster.length))
  const winners = corroborated.filter((cluster) => cluster.length === largest)
  // Equal-sized disagreeing clusters mean the venues genuinely split and
  // nothing here can say which side is right. Publishing either — or worse,
  // something between them — would set the price liquidations settle against
  // on a coin flip. Refuse, and let the next tick decide.
  if (winners.length > 1) return null

  const cluster = winners[0]
  const middle = Math.floor(cluster.length / 2)
  const consensus =
    cluster.length % 2 === 1
      ? cluster[middle]
      : (cluster[middle - 1] + cluster[middle]) / 2
  return Number.isFinite(consensus) && consensus > 0 ? consensus : null
}

export type OracleTransitionDecision =
  | { action: 'apply' }
  | { action: 'ignore'; reason: 'stale' | 'duplicate' }
  | { action: 'reject'; reason: string }

/**
 * Decide whether a feed point may become a contract's executable price.
 *
 * Feed rows can be published and applied concurrently. The contract lock
 * serializes state writes, but it does not guarantee callers reach that lock
 * in timestamp order, so chronology must be checked against the locked
 * contract itself.
 */
export const decideOracleTransition = (
  current: OraclePoint | null,
  incoming: OraclePoint,
  now = Date.now()
): OracleTransitionDecision => {
  const incomingRejection = validateBasicOraclePoint(incoming, now)
  if (incomingRejection) return { action: 'reject', reason: incomingRejection }

  if (!current) return { action: 'apply' }

  const currentRejection = validateBasicOraclePoint(current, now)
  if (currentRejection)
    return {
      action: 'reject',
      reason: `current oracle point is invalid: ${currentRejection}`,
    }

  if (incoming.ts < current.ts) return { action: 'ignore', reason: 'stale' }
  if (incoming.ts > current.ts) return { action: 'apply' }
  if (incoming.price === current.price) {
    if (
      current.sourceTs != null &&
      incoming.sourceTs != null &&
      current.sourceTs !== incoming.sourceTs
    )
      return {
        action: 'reject',
        reason: `timestamp ${incoming.ts} conflicts with current source timestamp ${current.sourceTs} (incoming ${incoming.sourceTs})`,
      }
    // A rolling deploy can encounter an existing contract cache without the
    // newly introduced source metadata. Apply the otherwise identical point
    // once to enrich it. A metadata-free retry must never erase metadata.
    if (current.sourceTs == null && incoming.sourceTs != null)
      return { action: 'apply' }
    return { action: 'ignore', reason: 'duplicate' }
  }

  return {
    action: 'reject',
    reason: `timestamp ${incoming.ts} conflicts with current price ${current.price} (incoming ${incoming.price})`,
  }
}
