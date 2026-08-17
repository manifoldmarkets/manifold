// Pure venue-response parsing for the tokenized-equity (xStocks) oracle
// sources. The fetch adapter lives in backend/shared/src/xstocks-price.ts;
// this module isolates the unit-tested decision of WHICH number each venue's
// response means, because that is where this feed can go quietly wrong.
//
// Units: the composite is the price of the RAW token as quoted on CEX order
// books. xStocks distribute dividends by scaling holder balances up
// (Token-2022 scaled-ui-amount), so Jupiter's top-level `usdPrice` is the
// per-SCALED-unit price (≈ underlying ETF spot) while Gate/MEXC books trade
// the raw token at spot × accumulated multiplier. Mixing the two injects a
// silent offset equal to the accrued-dividend multiplier (~0.5% on SPYx as of
// Aug 2026) — inside any sane consensus tolerance, so it would pass the
// agreement gate and permanently bias the median rather than fail loudly.
// `scaledUiConfig.usdPricePrescaled` is the raw-unit price.
//
// Which of the two a token is cannot be inferred from a price response, so it
// is declared per token as an `XStockUnitMode` and the reader fails CLOSED on
// a rebasing token whose prescaled price is missing. Falling back to
// `usdPrice` there reintroduces exactly the silent offset described above:
// Jupiter's price API does not guarantee `scaledUiConfig`, so a schema change
// or a partial response would quietly swap the unit, land well inside the 2%
// consensus tolerance, and -- on the two-source feeds, where
// getConsensusMedian averages the pair rather than picking a middle -- go
// straight into the executable mark. Returning NaN drops Jupiter from the
// quote set instead, which the consensus gate already handles: three-source
// feeds carry on, two-source feeds skip the tick and alert.
//
// ⚠️ `static` is an ASSERTION ABOUT THE CURRENT MULTIPLIER, NOT ABOUT THE MINT.
// An earlier version of this note claimed GLDx simply lacks the extension.
// That is false: queried on-chain 2026-08-18, all four mints carry a
// `scaledUiAmountConfig` with a live (non-null) update authority. GLDx's
// multiplier merely happens to be exactly 1, which is why Jupiter omits
// `scaledUiConfig` from its response today and why its `usdPrice` is
// currently also the raw price. That authority can change the multiplier at
// any time without any code change here.
//
// So `static` is defended two ways rather than trusted:
//   1. Both modes prefer `usdPricePrescaled` whenever it is usable. At
//      multiplier 1 the two units coincide, so this is a no-op today and
//      automatically correct the moment a multiplier appears.
//   2. If a `static` token's response carries a multiplier that is NOT 1, the
//      declaration is provably stale and the reader fails closed rather than
//      returning a number in an unknown unit.
// The residual hole is narrow and deliberate: a token that starts rebasing
// while Jupiter reports NO scaled metadata at all is undetectable in-band.
// Flipping GLDx to `rebasing` today would not fix that -- Jupiter omits the
// field, so it would fail closed on every tick and, on a two-source feed,
// take the feed permanently dark. Closing it properly needs an out-of-band
// watch on the mint's multiplier; see the launch runbook.

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

// Venue APIs return numeric fields as JSON strings (Gate, MEXC) or numbers
// (Jupiter). Coerce either, and reject non-finite/non-positive results so a
// missing field ('undefined' → NaN) or an empty book ('0') cannot become a
// price.
const toPositivePrice = (value: unknown): number => {
  if (typeof value !== 'string' && typeof value !== 'number') return Number.NaN
  const price = Number(value)
  return Number.isFinite(price) && price > 0 ? price : Number.NaN
}

/**
 * Whether a token's balance rebases (Token-2022 scaled-ui-amount), which
 * decides whether Jupiter's top-level `usdPrice` is in the same unit that CEX
 * order books trade.
 *
 * - `rebasing` - pays dividends by scaling balances, so `usdPrice` is the
 *   per-scaled-unit price and ONLY `usdPricePrescaled` is comparable to a CEX
 *   quote. Required, not merely preferred.
 * - `static` - the multiplier is currently exactly 1, so `usdPrice` is also
 *   the raw-unit price. This asserts the CURRENT multiplier, not an immutable
 *   property of the mint (every xStocks mint has a live update authority), and
 *   the reader verifies it against the response wherever the data exists.
 */
export type XStockUnitMode = 'rebasing' | 'static'

/** A multiplier this far from 1 means the token is really rebasing. Loose
 * enough to ignore float representation of an exact 1, tight enough that any
 * genuine accrual trips it — the smallest live multiplier at the time of
 * writing was NVDAx at 1.000103. */
const STATIC_MULTIPLIER_EPSILON = 1e-6

/**
 * Raw-unit USD price from a Jupiter lite-api `price/v3` response, keyed by
 * mint address.
 *
 * `unitMode` is deliberately required rather than defaulted: a new call site
 * that has not thought about the unit should fail to compile, because getting
 * it wrong is invisible at runtime (see the module note).
 */
export const readJupiterRawUsdPrice = (
  body: unknown,
  mint: string,
  unitMode: XStockUnitMode
): number => {
  const entry = asRecord(asRecord(body)?.[mint])
  if (!entry) return Number.NaN
  const scaled = asRecord(entry.scaledUiConfig)
  const prescaled = toPositivePrice(scaled?.usdPricePrescaled)
  // Prefer the prescaled price whenever it is usable, for EITHER mode: it is
  // the raw-unit price by definition, and equals `usdPrice` on a token whose
  // multiplier is 1. So a `static` token that ever starts rebasing reads the
  // right number here instead of silently drifting.
  if (Number.isFinite(prescaled)) return prescaled
  // Absent or unusable. A rebasing token has no safe fallback.
  if (unitMode === 'rebasing') return Number.NaN
  // Declared `static`, so `usdPrice` is only the raw price while the
  // multiplier is 1. If the response says otherwise the declaration is stale
  // and `usdPrice` is in an unknown unit — fail closed rather than publish it.
  // Checked on both fields: `multiplier` is in force now, `newMultiplier` is
  // the scheduled next one, and either being off 1 means this is not static.
  if (isRebasingMultiplier(scaled?.multiplier)) return Number.NaN
  if (isRebasingMultiplier(scaled?.newMultiplier)) return Number.NaN
  return toPositivePrice(entry.usdPrice)
}

/** True only when the value is present, numeric, and meaningfully not 1. An
 * absent or unparseable multiplier is NOT evidence of rebasing — that is the
 * ordinary shape of a static token's response, where Jupiter omits the whole
 * `scaledUiConfig` object. */
const isRebasingMultiplier = (value: unknown): boolean => {
  if (typeof value !== 'string' && typeof value !== 'number') return false
  const multiplier = Number(value)
  if (!Number.isFinite(multiplier)) return false
  return Math.abs(multiplier - 1) > STATIC_MULTIPLIER_EPSILON
}

/**
 * Mid price from a Gate spot `tickers?currency_pair=` response (an array with
 * one entry). On these thin books the last trade can be minutes old while the
 * touch is live, so prefer the bid/ask mid; fall back to `last` when the book
 * is one-sided or crossed (a crossed snapshot is transient noise, and the
 * consensus gate — not this reader — is what validates the level).
 */
export const readGateTickerMid = (body: unknown): number => {
  const ticker = asRecord(Array.isArray(body) ? body[0] : null)
  if (!ticker) return Number.NaN
  const bid = toPositivePrice(ticker.highest_bid)
  const ask = toPositivePrice(ticker.lowest_ask)
  if (Number.isFinite(bid) && Number.isFinite(ask) && ask >= bid)
    return (bid + ask) / 2
  return toPositivePrice(ticker.last)
}

/**
 * Mid price from a MEXC `ticker/bookTicker` response. No last-trade fallback:
 * the endpoint doesn't carry one, and a one-sided book on the venue with the
 * least depth is better treated as "no quote" than guessed at.
 */
export const readMexcBookTickerMid = (body: unknown): number => {
  const ticker = asRecord(body)
  if (!ticker) return Number.NaN
  const bid = toPositivePrice(ticker.bidPrice)
  const ask = toPositivePrice(ticker.askPrice)
  if (Number.isFinite(bid) && Number.isFinite(ask) && ask >= bid)
    return (bid + ask) / 2
  return Number.NaN
}
