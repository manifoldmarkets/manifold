import { DAY_MS } from '../util/time'

// The Crypto Fear & Greed index, as published by Alternative.me, mirrored as
// an oracle price.
//
// This file is the published methodology for the feed and the parser for the
// provider payload. It lives in `common` (a leaf package) so the rule the
// oracle is scored against is one auditable artifact a UI can render, and so
// the parser is unit-tested where the repo has a test runner.
//
// WHAT THE PRICE IS
//
// Alternative.me computes a daily sentiment score for the crypto market on a
// 0-100 scale — 0 "Extreme Fear", 100 "Extreme Greed" — from volatility,
// market momentum/volume, social media, surveys, Bitcoin dominance and search
// trends, weighted by their published scheme. We mirror the integer they
// publish; we do not compute, smooth, or rescale it. The number on the market
// is the number on https://alternative.me/crypto/fear-and-greed-index/.
//
// The index updates ONCE A DAY, around 00:00 UTC, and the API serves the
// current value with a `time_until_update` countdown. It is mean-reverting by
// construction (a bounded sentiment gauge) and genuinely two-sided: neither
// direction is structurally favoured, which is what makes it a usable perp.
//
// POSITIVITY
//
// Oracle prices must be strictly positive (validateBasicOraclePoint), and the
// index's range includes 0. The parser below ACCEPTS a 0 print — it is a
// valid reading of the index and the parser's job is fidelity to the source —
// but the feed's registry bounds are [1, 100] and a 0 is refused at
// publication. That is acceptable because the index has never printed 0
// (its historical floor is in the single digits), and if it ever did the
// feed would simply pause: no point published, the market's freshness gate
// trips after maxOraclePriceAgeMs, and trading resumes on the next non-zero
// print. Pausing at the stale gate is strictly better than publishing a
// non-positive price or inventing a floor.
//
// TERMS
//
// The credit line is in oracle-attribution.ts. See the note there: the
// provider's terms page could not be read from the environment this feed was
// written in, so the entry carries a credit and a link and no licence label,
// and confirming those terms is an operator gate before a market is created.

/** The index is an integer on this closed range. */
export const FEAR_GREED_MIN = 0
export const FEAR_GREED_MAX = 100

/**
 * How stale the provider's own latest datapoint may be before we stop
 * publishing.
 *
 * Same reasoning as the VoteHub feeds' maxSourceAgeDays: a source that stops
 * updating must stop the feed, not be relaid every heartbeat under a fresh
 * timestamp. The index posts daily, so three days is slack for a missed
 * update or a short outage without tolerating a genuinely dead source.
 */
export const FEAR_GREED_MAX_SOURCE_AGE_MS = 3 * DAY_MS

export type FearGreedPoint = {
  /** The published integer, FEAR_GREED_MIN..FEAR_GREED_MAX inclusive. */
  value: number
  /** Provider timestamp for the reading, epoch MILLISECONDS. */
  sourceTs: number
  /** `value_classification` verbatim ("Extreme Fear" ... "Extreme Greed"), display only. */
  classification: string | null
}

export type FearGreedParseResult =
  | { ok: true; points: FearGreedPoint[] }
  | { ok: false; reason: string }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object' && !Array.isArray(value)

/**
 * Parse one `data[]` row's `value` — a decimal-integer string in the payload
 * (an actual number is also accepted, in case the provider ever stops
 * stringifying). Anything non-integer or outside the index range is a
 * rejection, never a clamp or a round.
 */
const parseValue = (raw: unknown): number | null => {
  let value: number
  if (typeof raw === 'string') {
    if (!/^\s*\d+\s*$/.test(raw)) return null
    value = Number(raw.trim())
  } else if (typeof raw === 'number') {
    value = raw
  } else return null
  if (!Number.isInteger(value)) return null
  if (value < FEAR_GREED_MIN || value > FEAR_GREED_MAX) return null
  return value
}

/**
 * Parse `timestamp` — unix SECONDS as a decimal string (or number). Returns
 * epoch milliseconds. Rejects anything that is not a positive integer number
 * of seconds, and anything before the index existed (it launched in 2018; a
 * value that parses to the 1970s is a units mistake, not a reading).
 */
const parseTimestamp = (raw: unknown): number | null => {
  let seconds: number
  if (typeof raw === 'string') {
    if (!/^\s*\d+\s*$/.test(raw)) return null
    seconds = Number(raw.trim())
  } else if (typeof raw === 'number') {
    seconds = raw
  } else return null
  if (!Number.isInteger(seconds) || seconds <= 0) return null
  const ms = seconds * 1000
  if (!Number.isFinite(ms) || ms < FEAR_GREED_EPOCH_MS) return null
  return ms
}

/** 2018-01-01T00:00:00Z — the index did not exist before 2018. */
export const FEAR_GREED_EPOCH_MS = Date.UTC(2018, 0, 1)

/**
 * Parse the `/fng/` payload, treating every field as untrusted.
 *
 * Shape (verified against the provider's documentation; a live response
 * could not be fetched from the environment this was written in):
 *
 *   { name: "Fear and Greed Index",
 *     data: [ { value: "<int>", value_classification: "<label>",
 *               timestamp: "<unix seconds>", time_until_update?: "<s>" }, ... ],
 *     metadata: { error: null | "<message>" } }
 *
 * `data` is newest first; the result is OLDEST first. The whole payload is
 * rejected on any malformed row rather than the row dropped: for a
 * single-value fetch the two are the same thing, and for a history fetch a
 * silently dropped day is a hole in published history nobody would notice.
 */
export const parseFearGreedPayload = (body: unknown): FearGreedParseResult => {
  if (!isRecord(body)) return { ok: false, reason: 'payload is not an object' }

  const metadata = body.metadata
  if (isRecord(metadata)) {
    const error = metadata.error
    if (error != null && !(typeof error === 'string' && error.trim() === ''))
      return { ok: false, reason: `provider reported error: ${String(error)}` }
  }

  const data = body.data
  if (!Array.isArray(data))
    return { ok: false, reason: 'payload `data` is not an array' }
  if (data.length === 0) return { ok: false, reason: 'payload `data` is empty' }

  const points: FearGreedPoint[] = []
  const seenTs: Record<number, true> = {}
  for (let index = 0; index < data.length; index++) {
    const row: unknown = data[index]
    if (!isRecord(row))
      return { ok: false, reason: `row ${index} is not an object` }
    const value = parseValue(row.value)
    if (value == null)
      return {
        ok: false,
        reason: `row ${index} has an unusable value ${JSON.stringify(
          row.value
        )} (need an integer in [${FEAR_GREED_MIN}, ${FEAR_GREED_MAX}])`,
      }
    const sourceTs = parseTimestamp(row.timestamp)
    if (sourceTs == null)
      return {
        ok: false,
        reason: `row ${index} has an unusable timestamp ${JSON.stringify(
          row.timestamp
        )}`,
      }
    // Two readings at one instant cannot both be right, and an
    // on-conflict-do-nothing insert would make the published value depend on
    // array order — the same reason normalizeOraclePointBatch rejects it.
    if (seenTs[sourceTs])
      return {
        ok: false,
        reason: `duplicate timestamp ${new Date(sourceTs).toISOString()}`,
      }
    seenTs[sourceTs] = true
    const classification =
      typeof row.value_classification === 'string' &&
      row.value_classification.trim().length > 0
        ? row.value_classification.trim()
        : null
    points.push({ value, sourceTs, classification })
  }

  points.sort((a, b) => a.sourceTs - b.sourceTs)
  return { ok: true, points }
}

/** 00:00 UTC of the day a reading belongs to — the backfill's stamp. */
export const fearGreedDayStartUtc = (sourceTs: number): number =>
  Math.floor(sourceTs / DAY_MS) * DAY_MS
