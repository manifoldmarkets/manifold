// Pure venue-response parsing for the tokenized-equity (xStocks) oracle's
// centralized-exchange source. The fetch adapter lives in
// backend/shared/src/xstocks-price.ts; this module isolates the unit-tested
// decision of WHICH number the venue's response means. The on-chain sources
// are decoded in ./solana-pools.ts.
//
// Units: Gate's book trades the RAW token, the same unit the on-chain pools
// price, so no reconciliation happens here. (The former Jupiter source quoted
// a per-SCALED-unit price that had to be mapped back to raw units; that
// machinery left with it on 2026-08-27.)

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null

// Gate returns numeric fields as JSON strings. Coerce, and reject
// non-finite/non-positive results so a missing field ('undefined' → NaN) or
// an empty book ('0') cannot become a price.
const toPositivePrice = (value: unknown): number => {
  if (typeof value !== 'string' && typeof value !== 'number') return Number.NaN
  const price = Number(value)
  return Number.isFinite(price) && price > 0 ? price : Number.NaN
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
