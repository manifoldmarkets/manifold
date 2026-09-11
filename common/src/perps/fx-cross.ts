// EUR/USD as a crypto-venue price: what the number is, and the arithmetic that
// turns a venue's ticker into one comparable rate.
//
// This file lives in `common` for the same reason the rest of the perp
// methodology does — it decides what the market is priced against, so it
// should be one auditable artifact with unit tests rather than arithmetic
// buried in a fetch adapter. The adapter (backend/shared/src/fx-price.ts) does
// the network calls and the cross-venue consensus; everything here is pure.
//
// WHAT THE PRICE IS
//
// US dollars per euro, the market convention, so 1.16 means "one euro costs
// $1.16". Every source below is asked for that same number, never its
// reciprocal: see MIN/MAX_PLAUSIBLE_EUR_USD for why an inverted source is the
// one corruption mode the registry's sanity bounds cannot catch on their own.
//
// WHY CRYPTO VENUES AT ALL
//
// The interbank rate is licensed data; every free intraday FX API found came
// with terms prohibiting automated or commercial use (the same reason MEXC and
// Gate were dropped from the xStocks feed). Crypto venues quote EUR against
// USD continuously, under terms we have already vetted for BTC, and the rate
// is arbitraged against interbank by anyone who can move fiat. So the feed is
// built out of venues already in btc-price.ts rather than a new vendor.
//
// Two consequences, both accepted and neither hidden:
//   - The fiat FX market closes (Friday ~21:00 UTC to Sunday ~21:00 UTC).
//     These venues do not, so the feed keeps printing over the weekend off
//     thinner books, and can gap against interbank at the Sunday open. For a
//     24/7 perp that is better than a frozen mark, but it is a different
//     instrument from a weekday interbank fix, and the market's description
//     should say so.
//   - A venue quoting EUR against a USD STABLECOIN is quoting two pegs, not
//     one. No such source is used below; if one is ever added as a fourth
//     vote, a USDC/USDT depeg becomes a EUR/USD move on this feed.

/**
 * Hard plausibility band for a single source's quote, applied BEFORE it is
 * allowed to vote in the cross-venue median.
 *
 * The registry's minPrice/maxPrice reject a corrupt published point; this
 * rejects a corrupt SOURCE, which is a different job and has to happen here:
 * cross-source agreement is what separates "moved fast" from "wrong", and a
 * source that is wrong in a way another source could accidentally corroborate
 * must never reach the cluster.
 *
 * The band is deliberately wide — EUR/USD has traded between roughly 0.82 and
 * 1.60 in the euro's lifetime, and a feed that refuses a genuine level is
 * worse than useless — so what it actually catches is unit confusion: a rate
 * published in cents (116), a percent (16), or a zero/negative sentinel. It
 * does NOT catch an INVERTED quote: 1/1.16 = 0.862 is inside any band wide
 * enough to be honest. That case is caught two ways instead — every source
 * here is asked for a directly quoted EUR/USD or computes the cross through
 * one tested helper (eurUsdFromBtcLegs), and an inverted source disagrees
 * with the others by ~30%, far outside the consensus tolerance.
 */
export const MIN_PLAUSIBLE_EUR_USD = 0.5
export const MAX_PLAUSIBLE_EUR_USD = 2

export const isPlausibleEurUsd = (rate: number) =>
  Number.isFinite(rate) &&
  rate >= MIN_PLAUSIBLE_EUR_USD &&
  rate <= MAX_PLAUSIBLE_EUR_USD

/**
 * Widest bid/ask spread, as a fraction of the mid, that still counts as a
 * two-sided market.
 *
 * A mid is only meaningful if both sides are real. On a book whose spread has
 * blown out — a venue mid-outage, a fiat rail halted, a weekend lull on a thin
 * pair — the midpoint is an average of two prices nobody will trade at, and
 * publishing it as an executable mark invents a level. 1% is ~116 pips on
 * EUR/USD: orders of magnitude above any healthy spread on these venues
 * (single-digit pips), so this only ever fires when the book is broken.
 */
export const MAX_QUOTE_SPREAD_FRAC = 0.01

/**
 * Mid of a venue's two-sided quote, or null if the quote cannot be trusted.
 *
 * MID, not last trade, and this is the load-bearing choice in the whole feed.
 * A last trade is as old as the last person who traded — minutes, on a thin
 * fiat book — and a stale last trade is exactly the input that makes a
 * computed cross wrong (see eurUsdFromBtcLegs). Market makers keep quotes
 * live whether or not anyone trades, so a mid is a statement about NOW.
 *
 * Fails closed on: a non-numeric or non-positive side, a crossed book
 * (ask < bid, which is either corrupt data or a venue mid-glitch), and a
 * spread wider than MAX_QUOTE_SPREAD_FRAC. A source that fails here costs a
 * vote, never a wrong price.
 */
export const parseTwoSidedMid = (
  bid: unknown,
  ask: unknown,
  maxSpreadFrac = MAX_QUOTE_SPREAD_FRAC
): number | null => {
  const bidPrice = toPositiveNumber(bid)
  const askPrice = toPositiveNumber(ask)
  if (bidPrice == null || askPrice == null) return null
  if (askPrice < bidPrice) return null
  const mid = (bidPrice + askPrice) / 2
  if (!Number.isFinite(mid) || mid <= 0) return null
  if (askPrice - bidPrice > mid * maxSpreadFrac) return null
  return mid
}

/**
 * EUR/USD implied by one venue's two BTC books: USD per BTC divided by EUR per
 * BTC leaves USD per EUR.
 *
 * Only usable when both legs come from a SINGLE request. Two sequential calls
 * are two different instants, and BTC moving 0.2% between them puts 0.2% —
 * about 23 pips — of pure fetch artefact into the cross. Worse, the error is
 * correlated across venues, because BTC moves globally: two venues fetched in
 * the same skewed order would agree with each other and outvote a correct
 * direct quote. So a venue only gets a cross vote if its API returns both
 * pairs at once (Kraken does), and a venue with a direct EUR/USD quote uses
 * that instead.
 *
 * Both legs must be positive and finite; the result is not range-checked here
 * (isPlausibleEurUsd is the caller's gate) so that a caller can log what an
 * implausible cross actually computed to.
 */
export const eurUsdFromBtcLegs = (
  btcEur: number,
  btcUsd: number
): number | null => {
  if (!Number.isFinite(btcEur) || !Number.isFinite(btcUsd)) return null
  if (btcEur <= 0 || btcUsd <= 0) return null
  const rate = btcUsd / btcEur
  return Number.isFinite(rate) && rate > 0 ? rate : null
}

/**
 * Parse a number that a venue may serve as either a JSON number or a decimal
 * string (Kraken and Bitstamp stringify; Coinbase does too on some routes).
 *
 * Strict on purpose: an empty string, whitespace, "NaN", "null" or a
 * non-numeric body must not become a price. Number('') is 0 and Number(' ')
 * is 0, so the emptiness check has to come first.
 */
const toPositiveNumber = (raw: unknown): number | null => {
  let value: number
  if (typeof raw === 'number') value = raw
  else if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (trimmed === '') return null
    value = Number(trimmed)
  } else return null
  if (!Number.isFinite(value) || value <= 0) return null
  return value
}
