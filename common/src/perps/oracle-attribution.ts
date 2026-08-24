// Who to credit for each oracle feed's data, and under what terms.
//
// This lives in `common` rather than next to the feed registry in
// `backend/shared/src/oracle-feeds.ts` because the market page renders it and
// `web` must never import from backend. Keyed on feed id so the two stay
// associated without a shared type.
//
// The point of it being a component fed by this map, rather than prose in a
// market description, is that attribution then cannot be edited away by
// accident. Several of these feeds are used under licences that REQUIRE
// credit — losing it in a description rewrite is a licence breach, not a
// cosmetic regression.
//
// Verification status of each claim below, because asserting a licence we
// haven't read is its own problem:
//   - OpenRouter — their dataset terms specify the exact credit line,
//     including the data's as-of time. Hence `showAsOf`.
//   - VoteHub — their API documentation states "This API is licensed under
//     Creative Commons Attribution 4.0 International". Read directly, so it
//     carries a licence label and a link to the licence deed.
//   - NESO — publishes under an open licence requiring attribution, but the
//     exact current licence text was NOT read directly. So it gets a credit
//     and a link, and no licence label we can't back up.
//   - BTC — we compute the median ourselves from three public tickers, so
//     nothing is being republished. Credited for transparency, not obligation.
//   - xStocks (SPYx/QQQx/GLDx) — same self-computed stance as BTC: we quote
//     public venue prices for a crypto TOKEN, so no index-provider data is
//     republished. "xStocks" is named so readers know what instrument the
//     price belongs to; the venue credits are transparency, not obligation.

export type OracleAttribution = {
  /** Display name of the data provider. */
  source: string
  /** Human-facing page for the data (not the API endpoint). */
  url?: string
  /** Only set where the licence has actually been verified. */
  licence?: string
  /**
   * Canonical URI for that licence, rendered as a link.
   *
   * CC BY 4.0 s3(a)(1)(C) asks for a URI or hyperlink to the licence itself
   * when sharing licensed material, not merely its name — so a bare "CC BY
   * 4.0" label is an incomplete credit. Set this wherever `licence` is set.
   */
  licenceUrl?: string
  /**
   * Render the data's as-of timestamp in the credit line. Set only where the
   * provider's terms ask for it — elsewhere it is noise, and the oracle
   * point's own timestamp is already on the chart.
   */
  showAsOf?: boolean
}

export const ORACLE_ATTRIBUTION: Record<string, OracleAttribution> = {
  'openrouter-open-weight-share': {
    source: 'OpenRouter (openrouter.ai/rankings)',
    url: 'https://openrouter.ai/rankings',
    showAsOf: true,
  },
  // Retained after the feed itself was removed from the backend registry
  // (market sunset 2026-08-10). The resolved market's page still charts the
  // NESO history we ingested, so the credit is still owed — this entry going
  // away with the feed would have been a silent licence breach, which is the
  // failure mode this whole map exists to prevent.
  'uk-grid-carbon': {
    source: 'NESO Carbon Intensity API',
    url: 'https://carbonintensity.org.uk',
  },
  'trump-approval-rating': {
    source: 'VoteHub',
    url: 'https://votehub.com',
    // Stated on VoteHub's API documentation: "This API is licensed under
    // Creative Commons Attribution 4.0 International." CC BY 4.0 permits
    // reuse and redistribution, including commercially, on the single
    // condition that the source is credited. The oracle mirrors their
    // published average, so this credit IS the compliance, not decoration —
    // which is why the licence link is required rather than ornamental.
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
  },
  'btc-usd': {
    source: 'Coinbase, Kraken, Bitstamp & Gemini',
  },
  'spyx-usd': {
    source: 'Jupiter, Gate & MEXC (SPYx by Backed xStocks)',
    url: 'https://xstocks.fi',
  },
  'qqqx-usd': {
    source: 'Jupiter & Gate (QQQx by Backed xStocks)',
    url: 'https://xstocks.fi',
  },
  'gldx-usd': {
    source: 'Jupiter & Gate (GLDx by Backed xStocks)',
    url: 'https://xstocks.fi',
  },
  'nvdax-usd': {
    source: 'Jupiter, Gate & MEXC (NVDAx by Backed xStocks)',
    url: 'https://xstocks.fi',
  },
}

export const getOracleAttribution = (
  feedId: string | undefined
): OracleAttribution | undefined =>
  feedId ? ORACLE_ATTRIBUTION[feedId] : undefined
