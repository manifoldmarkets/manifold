import { MINUTE_MS } from '../util/time'
import { MAX_ORACLE_FUTURE_SKEW_MS, OraclePoint } from './oracle'
import { OracleFeedHealth, ORACLE_HEALTH_MAX_AGE_MS } from './oracle-health'

// Adjacent's Misery Implied Index (MSRY), mirrored as an oracle price.
//
// This file is the published rule for the feed and the parser for the
// provider payload. It lives in `common` (a leaf package) so the rule the
// oracle is scored against is one auditable artifact, and so the parser and
// the observation rule are unit-tested where the repo has a test runner.
//
// WHAT THE PRICE IS
//
// MSRY is Adjacent Markets' market-implied reading of the Misery Index:
// implied U-3 unemployment plus implied headline CPI-U year-over-year, in
// percentage points, each read off event-contract ladders on the NEXT BLS
// print (https://adjacent.markets/static/msry-methodology/methodology).
// Adjacent recalculates an indicative value every 60 seconds and stamps an
// official daily value at 5:30 p.m. Eastern. We mirror the indicative value
// they publish; we do not compute, smooth, or rescale it. The number on the
// market is the number on https://adjacent.markets/indices/msry.
//
// THE SOURCE
//
// Adjacent's realtime one-minute price series for the index, which needs an
// API key on a paid plan (see shared/adjacent-msry.ts). The keyless public
// tier is 15 minutes delayed by design and never prices the live feed: anyone
// with Adjacent's realtime data, or the event-contract prices it is built
// from, would see every move a quarter of an hour before the market did.
//
// Each row is {timestamp, price}: `timestamp` is the START of a one-minute
// bucket and `price` the last value recorded within it. The bucket start is
// therefore a lower bound on when the value was computed, which is what lets
// it serve as a production stamp for next-price eligibility (see
// isProviderStampedFeed in orders.ts): an order fills only at a value whose
// minute began after the order was placed, never at one a trader could
// already read off Adjacent, or that a cached response handed us late.
//
// IS IT A USABLE PERP
//
// Two-sided: inflation and unemployment expectations both move either way
// and the index is not monotone. Two structural moves are predictable, and
// the launch manifest records them as risks rather than this file hiding
// them: each sleeve ROLLS from its current reference month to the next in
// five weekday steps at 5:30 p.m. Eastern ending the day before the BLS
// release, so each step's size is visible in advance from the two months'
// implied levels; and a sleeve with no valid bracket HOLDS its last level
// until one exists, then moves at once.
//
// POSITIVITY
//
// Oracle prices must be strictly positive (validateBasicOraclePoint), and the
// methodology floors MSRY at 0.00, not above it. The parser ACCEPTS a 0 print
// (its job is fidelity to the source); the registry bounds refuse it at
// publication, so the feed pauses at its stale gate instead of publishing a
// non-positive price. Unemployment plus inflation has never been near zero.
//
// TERMS
//
// Adjacent's methodology bars using the index "as the basis for a financial
// product" except as Adjacent permits in writing, and its Pro and Premium
// plans grant no such use. The feed therefore ships with market creation
// disabled and a pending launch entry; see oracle-attribution.ts.

export const ADJACENT_MSRY_FEED_ID = 'adjacent-msry'

/** Adjacent's id for the index: the `{id}` in /api/v1/indices/{id}/prices. */
export const ADJACENT_MSRY_INDEX_ID = 'msry'

/** Adjacent recalculates the indicative value once a minute. */
export const MSRY_UPDATE_PERIOD_MS = MINUTE_MS

/**
 * How often the oracle tick polls Adjacent. A minute-cadence index gains
 * nothing from a faster poll; 20s keeps the lag after each recalculation
 * short. One request per poll is three a minute per scheduler process,
 * against an organization-wide Pro budget of 30 a minute and 20,000 a day
 * that dev, prod and any deploy overlap all share.
 */
export const MSRY_POLL_MS = 20_000

/**
 * How old Adjacent's newest value may be before the feed stops counting as
 * available. Five missed recalculations: a source that has stopped updating
 * must pause the market, not be relaid under fresh timestamps.
 */
export const MSRY_MAX_SOURCE_AGE_MS = 5 * MINUTE_MS

/**
 * Hard plausibility bounds, percentage points. They reject unit-confused
 * garbage (a 0-1 fraction, one of Adjacent's 50-150 political levels, a
 * 1000-based NAV) and the non-positive prints described above, never a fast
 * move. The official index peaked at 21.98 in June 1980.
 */
export const MSRY_MIN_PRICE = 0.5
export const MSRY_MAX_PRICE = 40

/** Adjacent did not exist before 2020; an earlier stamp is a units mistake. */
const ADJACENT_EPOCH_MS = Date.UTC(2020, 0, 1)
/** ECMAScript's maximum Date value, ±8.64e15 ms from the epoch. */
const MAX_DATE_MS = 8.64e15

export type AdjacentIndexPrice = {
  /** Start of the provider's bucket, epoch milliseconds. */
  sourceTs: number
  /** Index level, percentage points. */
  price: number
}

export type AdjacentIndexPricesParseResult =
  | { ok: true; rows: AdjacentIndexPrice[] }
  | { ok: false; reason: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object' && !Array.isArray(value)

// An ISO-8601 instant with an explicit zone. Date.parse alone also accepts
// zone-less strings and reads them as LOCAL time, which would shift every
// stamp by the scheduler's UTC offset.
const ISO_INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/

const parseTimestamp = (raw: unknown): number | null => {
  if (typeof raw !== 'string' || !ISO_INSTANT.test(raw)) return null
  const ms = Date.parse(raw)
  if (!Number.isFinite(ms) || ms < ADJACENT_EPOCH_MS || ms > MAX_DATE_MS)
    return null
  return ms
}

/**
 * Parse an index price-history page (`/indices/{id}/prices`, realtime or
 * public tier — same shape), treating every field as untrusted:
 *
 *   { data: [ { timestamp: "<ISO instant>", price: <number> }, ... ],
 *     meta: { total, page, per_page, ... } }
 *
 * Rows come back NEWEST first. The whole page is rejected on any malformed
 * row rather than the row dropped: for the live poll a dropped newest row
 * would silently publish an older value, and for a backfill a dropped row is
 * a hole in published history nobody would notice.
 */
export const parseAdjacentIndexPrices = (
  body: unknown
): AdjacentIndexPricesParseResult => {
  if (!isRecord(body)) return { ok: false, reason: 'payload is not an object' }
  const data = body.data
  if (!Array.isArray(data))
    return { ok: false, reason: 'payload `data` is not an array' }

  const rows: AdjacentIndexPrice[] = []
  const seen = new Set<number>()
  for (let index = 0; index < data.length; index++) {
    const row: unknown = data[index]
    if (!isRecord(row))
      return { ok: false, reason: `row ${index} is not an object` }
    const sourceTs = parseTimestamp(row.timestamp)
    if (sourceTs == null)
      return {
        ok: false,
        reason: `row ${index} has an unusable timestamp ${JSON.stringify(
          row.timestamp
        )}`,
      }
    const price = row.price
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0)
      return {
        ok: false,
        reason: `row ${index} has an unusable price ${JSON.stringify(price)}`,
      }
    // Two values for one bucket cannot both be right, and which one won
    // would depend on array order.
    if (seen.has(sourceTs))
      return {
        ok: false,
        reason: `duplicate timestamp ${new Date(sourceTs).toISOString()}`,
      }
    seen.add(sourceTs)
    rows.push({ sourceTs, price })
  }
  rows.sort((a, b) => b.sourceTs - a.sourceTs)
  return { ok: true, rows }
}

export type MsryObservation = {
  point?: OraclePoint
  health: OracleFeedHealth
  /** Adjacent re-recorded a minute we already published, at another value.
   * The published value stands; this is for the adapter's log line. */
  revision?: { sourceTs: number; published: number; latest: number }
}

/**
 * Turn one poll's rows into an oracle observation.
 *
 * `previous` is the point this process last observed, so the rule can tell a
 * new minute from one it has already seen. The cases, in order:
 *
 * - no rows, a stamp from the future, or a newest value older than
 *   MSRY_MAX_SOURCE_AGE_MS: unavailable, with no point. That pauses trading
 *   without touching the last price.
 * - a stamp OLDER than `previous`: a lagging cache or load-balanced node,
 *   not a fault. Re-observe `previous` unchanged, as the MNX adapter does.
 * - the SAME stamp at a different price: Adjacent's bucket holds "the last
 *   price recorded within it", so a minute can be re-recorded. Published
 *   history is immutable and the next minute's value supersedes it within a
 *   minute, so the published value stands. Treating this as corruption (as
 *   MNX does) would withdraw availability and page on a healthy feed. This
 *   only covers what this process saw; a restarted or overlapping scheduler
 *   that sees the revision first is covered by the publisher, which keeps
 *   the published value for this feed (`sourceRevision: 'keep-published'`).
 * - otherwise a point stamped now (`fetchedAt`, the tick's database clock)
 *   with the bucket start as its source stamp. The same stamp at the same
 *   price also gets a fresh `ts`: that is what lets a value first received
 *   stamped ahead of our clock become eligible when it is received again.
 */
export const buildMsryObservation = (
  rows: readonly AdjacentIndexPrice[],
  fetchedAt: number,
  previous?: OraclePoint
): MsryObservation => {
  const unavailable = (reason: string): MsryObservation => ({
    health: { checkedAt: fetchedAt, status: 'unavailable', reason },
  })
  if (!Number.isFinite(fetchedAt) || fetchedAt <= 0)
    throw new Error(`Invalid fetch time ${fetchedAt}`)

  let newest: AdjacentIndexPrice | undefined
  for (const row of rows)
    if (!newest || row.sourceTs > newest.sourceTs) newest = row
  if (!newest) return unavailable('Adjacent returned no MSRY values')
  if (newest.sourceTs > fetchedAt + MAX_ORACLE_FUTURE_SKEW_MS)
    return unavailable(
      `Adjacent stamped its newest MSRY value in the future (${new Date(
        newest.sourceTs
      ).toISOString()})`
    )
  const age = fetchedAt - newest.sourceTs
  if (age > MSRY_MAX_SOURCE_AGE_MS)
    return unavailable(
      `Adjacent's newest MSRY value is ${Math.round(
        age / 1000
      )}s old (${new Date(newest.sourceTs).toISOString()})`
    )

  const health = (sourceTs: number): OracleFeedHealth => ({
    checkedAt: fetchedAt,
    status: 'available',
    expiresAt: Math.min(
      fetchedAt + ORACLE_HEALTH_MAX_AGE_MS,
      sourceTs + MSRY_MAX_SOURCE_AGE_MS
    ),
  })

  const previousSourceTs = previous?.sourceTs
  if (previous && previousSourceTs != null) {
    if (newest.sourceTs < previousSourceTs)
      return { point: previous, health: health(previousSourceTs) }
    if (newest.sourceTs === previousSourceTs && newest.price !== previous.price)
      return {
        point: previous,
        health: health(previousSourceTs),
        revision: {
          sourceTs: newest.sourceTs,
          published: previous.price,
          latest: newest.price,
        },
      }
  }

  return {
    point: { ts: fetchedAt, sourceTs: newest.sourceTs, price: newest.price },
    health: health(newest.sourceTs),
  }
}
