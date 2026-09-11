// The ticker: the short on-site identifier a perp market goes by ("BTC",
// "TRUMP", "SPYx"). It is what the /perps hub labels rows with, what the
// badge in front of a perp's title shows in place of its market type, and
// what search matches on (contracts.data->>'ticker'), so it must be STORED
// on the contract, not only computed here: a label that exists only in
// client code is invisible to search and to API consumers.
//
// PERP_FEED_TICKERS is the canonical assignment, keyed by the stable oracle
// feed id (never inferred from a renameable question). It lives in `common`
// rather than beside the launch manifest because the web renders it: a
// contract that predates the stored field still gets the right label from
// this map until backfill-perp-tickers.ts stamps it. create-perp refuses a
// different ticker for a feed named here, the launch manifest requires an
// entry for every launch feed, and the preflight fails a launch market whose
// stored ticker disagrees.

export const PERP_TICKER_MAX_LENGTH = 8

// One alphanumeric token, starting with a letter. A single token is what
// makes it usable as a search term and as a label that never wraps; the
// leading letter keeps a bare number from ever reading as a ticker. Case is
// the admin's choice ("SPYx" follows the xStocks naming); matching is
// case-insensitive everywhere.
export const PERP_TICKER_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,7}$/

export const isValidPerpTicker = (ticker: string) =>
  ticker.length <= PERP_TICKER_MAX_LENGTH && PERP_TICKER_PATTERN.test(ticker)

export const PERP_FEED_TICKERS: Readonly<Record<string, string>> = {
  'btc-usd': 'BTC',
  'trump-approval-rating': 'TRUMP',
  'votehub-generic-ballot-2026': 'BALLOT',
  'vance-favorability': 'VANCE',
  'crypto-fear-greed': 'FEAR',
  'eur-usd': 'EURUSD',
  // The instrument, not the currency: this market is the price OF a bond, in
  // gp. GP is reserved for a market on the gold price itself, if one is ever
  // built from the other direction.
  'osrs-bond-gp': 'BOND',
  'openrouter-open-weight-share': 'OPENW',
  // The product, not the company: this is the share of OpenRouter tokens
  // going to Claude models. ANTH is reserved for the Anthropic pre-IPO price
  // ticker.
  'openrouter-anthropic-share': 'CLAUDE',
  'openrouter-chinese-lab-share': 'CNLAB',
  'spyx-usd': 'SPYx',
  'qqqx-usd': 'QQQx',
  'nvdax-usd': 'NVDAx',
  'gldx-usd': 'GLDx',
  // Retired feed (see the note in backend/shared/src/oracle-feeds.ts). Its
  // settled market page still renders the badge, so it keeps its name.
  'uk-grid-carbon': 'UKCO2',
}

export const getPerpFeedTicker = (feedId: string | undefined) =>
  feedId ? PERP_FEED_TICKERS[feedId] : undefined

// Last resort for a market on a feed nobody has named: the feed id's leading
// segment, so a new perp is merely unglamorous until someone adds a line to
// PERP_FEED_TICKERS, never broken.
export const derivePerpTicker = (feedIdOrSlug: string) => {
  for (const segment of feedIdOrSlug.split('-')) {
    // Drop anything that can't be in a ticker, and a leading run of digits
    // so "2026-midterms" reads MIDTER rather than a bare year.
    const head = segment.replace(/[^A-Za-z0-9]/g, '').replace(/^[0-9]+/, '')
    if (head) return head.toUpperCase().slice(0, 6)
  }
  return 'PERP'
}

// The label to render. Prefers what is stored on the contract (which is what
// search matches), then the canonical map, then the derived fallback — so a
// row from before the field existed and a row whose feed nobody named both
// still get a label.
export const getPerpTicker = (contract: {
  ticker?: string
  oracleFeedId?: string
  slug?: string
}) =>
  contract.ticker ||
  getPerpFeedTicker(contract.oracleFeedId) ||
  derivePerpTicker(contract.oracleFeedId ?? contract.slug ?? '')

// Whether a search term could be (the start of) a ticker. Every prefix of a
// valid ticker is itself a valid ticker, so the same pattern answers both
// "is this a ticker" and "could this be one being typed" — and a multi-word
// query never is, so search skips the ticker lookup for it entirely.
export const isPerpTickerSearchTerm = (term: string) =>
  isValidPerpTicker(term.trim())
