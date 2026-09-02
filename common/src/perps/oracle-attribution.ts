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
//     including the data's as-of time. Hence `showAsOf`. The Anthropic-share
//     and Chinese-lab-share feeds are computed from the same dataset payload
//     and carry the identical credit; `showAsOf` on them is what makes
//     insertOraclePrices refuse a point without the dataset's `as_of`.
//   - VoteHub — their API documentation states "This API is licensed under
//     Creative Commons Attribution 4.0 International". Read directly, so it
//     carries a licence label and a link to the licence deed. The same
//     documentation page covers every `/averages/<key>/values` endpoint, so
//     the generic-ballot and Vance favorability feeds carry the same credit.
//   - NESO — publishes under an open licence requiring attribution, but the
//     exact current licence text was NOT read directly. So it gets a credit
//     and a link, and no licence label we can't back up.
//   - Alternative.me (Crypto Fear & Greed) — same status as NESO, see the
//     entry: the terms section of their index page could not be fetched
//     from the environment the feed was written in, so it carries a credit
//     and a link and no licence label, and reading that page is an operator
//     gate before a market is created on the feed.
//   - BTC — we compute the median ourselves from three public tickers, so
//     nothing is being republished. Credited for transparency, not obligation.
//   - xStocks (SPYx/QQQx/GLDx/NVDAx) — stronger than BTC's stance: the
//     price is decoded by us from the token's Solana pool accounts, which
//     are public chain state that no one licenses, so nothing is consumed
//     under anyone's terms, let alone republished. (Jupiter, MEXC and Gate
//     were removed as sources on 2026-08-27 precisely because each came with
//     terms.) "xStocks" is named so readers know what instrument the price
//     belongs to; the pool credits are transparency, not obligation.

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
  // Same dataset, same terms, same credit line with the as-of stamp.
  'openrouter-anthropic-share': {
    source: 'OpenRouter (openrouter.ai/rankings)',
    url: 'https://openrouter.ai/rankings',
    showAsOf: true,
  },
  'openrouter-chinese-lab-share': {
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
  // Two more VoteHub published averages, read from the same
  // polling.votehub.com API under the same documentation and therefore the
  // same CC BY 4.0 statement quoted above (verified for the Trump feed; the
  // statement covers the API as a whole, not one endpoint). Identical credit,
  // identical obligation: the credit IS the compliance.
  'votehub-generic-ballot-2026': {
    source: 'VoteHub',
    url: 'https://votehub.com',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
  },
  'vance-favorability': {
    source: 'VoteHub',
    url: 'https://votehub.com',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
  },
  // ⚠️ TERMS NOT YET READ DIRECTLY (2026-09-02). The feed was written in a
  // build environment whose egress policy blocks alternative.me, so the
  // section of https://alternative.me/crypto/fear-and-greed-index/ that
  // states the terms for using the data could not be fetched and is NOT
  // quoted here. Prior research expects it to permit use, including
  // commercial use, provided the index is credited with a link next to the
  // displayed data — which is exactly what this entry renders under the
  // chart on the market page and on the /perps hub. But an expectation is
  // not a licence: before an admin creates a market on `crypto-fear-greed`,
  // someone must read that page, paste the relevant sentence(s) verbatim
  // into this comment with the date, and — only if the page names one — set
  // `licence` / `licenceUrl`. If the page turns out NOT to permit commercial
  // reuse with attribution, do not create the market; the registry entry is
  // harmless without one. Until then: a credit and a link, no licence label
  // we cannot back up (the NESO stance above).
  'crypto-fear-greed': {
    source: 'Alternative.me Crypto Fear & Greed Index',
    url: 'https://alternative.me/crypto/fear-and-greed-index/',
  },
  'btc-usd': {
    source: 'Coinbase, Kraken, Bitstamp & Gemini',
  },
  'spyx-usd': {
    source: 'Raydium & Orca pools on Solana (SPYx by Backed xStocks)',
    url: 'https://xstocks.fi',
  },
  'qqqx-usd': {
    source: 'Raydium pools on Solana (QQQx by Backed xStocks)',
    url: 'https://xstocks.fi',
  },
  'gldx-usd': {
    source: 'Raydium & Orca pools on Solana (GLDx by Backed xStocks)',
    url: 'https://xstocks.fi',
  },
  'nvdax-usd': {
    source: 'Raydium & Orca pools on Solana (NVDAx by Backed xStocks)',
    url: 'https://xstocks.fi',
  },
}

export const getOracleAttribution = (
  feedId: string | undefined
): OracleAttribution | undefined =>
  feedId ? ORACLE_ATTRIBUTION[feedId] : undefined
