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
// `scaledUiConfig.usdPricePrescaled` is the raw-unit price. Tokens without
// the extension (GLDx pays no dividends) have no `scaledUiConfig`, and their
// top-level price is already the raw price.

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
 * Raw-unit USD price from a Jupiter lite-api `price/v3` response, keyed by
 * mint address. Prefers `scaledUiConfig.usdPricePrescaled` (see module note);
 * falls back to `usdPrice` for tokens without the scaled-ui extension.
 */
export const readJupiterRawUsdPrice = (body: unknown, mint: string): number => {
  const entry = asRecord(asRecord(body)?.[mint])
  if (!entry) return Number.NaN
  const prescaled = toPositivePrice(
    asRecord(entry.scaledUiConfig)?.usdPricePrescaled
  )
  if (Number.isFinite(prescaled)) return prescaled
  return toPositivePrice(entry.usdPrice)
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
