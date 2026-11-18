import { MNX_INSTRUMENTS } from 'common/perps/mnx'
import { HOUSE_LIQUIDITY_PROVIDER_ID } from 'common/antes'
import { MAX_QUESTION_LENGTH } from 'common/contract'
import { DAY_MS, HOUR_MS, MINUTE_MS, YEAR_MS } from 'common/util/time'
import { getOracleAttribution } from 'common/perps/oracle-attribution'
import {
  PERP_TICKER_MAX_LENGTH,
  getPerpFeedTicker,
  isValidPerpTicker,
} from 'common/perps/ticker'

import {
  ADJACENT_MSRY_FEED_ID,
  BTC_USD_FEED_ID,
  CRYPTO_FEAR_GREED_FEED_ID,
  GLDX_USD_FEED_ID,
  NVDAX_USD_FEED_ID,
  OPENROUTER_ANTHROPIC_SHARE_FEED_ID,
  OPENROUTER_CHINESE_LAB_SHARE_FEED_ID,
  OPENROUTER_OPEN_WEIGHT_FEED_ID,
  QQQX_USD_FEED_ID,
  SPYX_USD_FEED_ID,
  TRUMP_APPROVAL_FEED_ID,
  VANCE_FAVORABILITY_FEED_ID,
  VOTEHUB_GENERIC_BALLOT_2026_FEED_ID,
  VOTEHUB_GENERIC_BALLOT_2028_DEM_FEED_ID,
  VOTEHUB_GENERIC_BALLOT_2028_REP_FEED_ID,
} from '../oracle'
import { ORACLE_FEEDS, getOracleFeed, isOracleFeedLive } from '../oracle-feeds'

export type PerpLaunchMarketDefinition = {
  feedId: string
  question: string
  requiredTopics: readonly {
    name: string
    slugByEnvironment: Readonly<Record<'DEV' | 'PROD', string>>
  }[]
  oracleBehavior: 'continuous-public' | 'batched-public' | 'scheduled-step'
  /** Whether the provider's terms require its dataset-level as-of timestamp. */
  requiresSourceAsOf: boolean
  gameDesign: string
  latencyArbitrageRisk: string
  recommended: {
    maxLeverage: number
    annualMaxFundingRate: number
    fundingSensitivity: number
    maxOraclePriceAgeMs: number
    subsidyLong: number
    subsidyShort: number
  }
  minimumHistory: {
    spanMs: number
    points: number
  }
}

/**
 * The intended public launch dataset. This is deliberately executable config,
 * not a prose-only checklist: the preflight script checks the registry,
 * database, scheduler, and active contracts against it.
 *
 * Recommendations are conservative day-one settings, not automatic creation
 * instructions. The preflight warns when a market exceeds them so a reviewer
 * has to make that risk decision explicitly.
 */
export const MNX_LAUNCH_MARKETS: readonly PerpLaunchMarketDefinition[] =
  MNX_INSTRUMENTS.map((i) => ({
    feedId: i.feedId,
    question: i.question,
    requiredTopics: [
      {
        name: i.category === 'equity' ? 'Stocks' : 'AI',
        slugByEnvironment:
          i.category === 'equity'
            ? { DEV: 'economics-default', PROD: 'stocks' }
            : { DEV: 'ai', PROD: 'ai' },
      },
    ],
    oracleBehavior:
      i.category === 'compute' ? 'scheduled-step' : 'continuous-public',
    requiresSourceAsOf: true,
    gameDesign: i.description,
    latencyArbitrageRisk:
      i.category === 'valuation'
        ? 'MNX internal-book valuation futures have no external valuation anchor. The defined target is the MNX mark; do not clamp it to its eight-hour oracle EMA. Thinness and the public 2s cached-price window justify a 3× recommendation.'
        : i.category === 'compute'
        ? 'H100 references an hourly rental index. Poll at 2s, validate source age separately, and pause on MNX freezes. Scheduled steps and thinness justify 3×.'
        : 'MNX equity marks combine internal-book prices and an external oracle fallback. The defined target is the derivative mark, including outside the underlying session. A public 2s cached-price window and thinness justify 3×.',
    recommended: {
      maxLeverage: 3,
      annualMaxFundingRate: 1,
      fundingSensitivity: 1,
      maxOraclePriceAgeMs: i.maxAgeMs,
      subsidyLong: 25_000,
      subsidyShort: 25_000,
    },
    minimumHistory: { spanMs: 30 * DAY_MS, points: 30 * 24 },
  }))

export const PERP_LAUNCH_MARKETS: readonly PerpLaunchMarketDefinition[] = [
  {
    feedId: BTC_USD_FEED_ID,
    question: 'Bitcoin price (USD)',
    requiredTopics: [
      {
        name: 'Crypto',
        slugByEnvironment: {
          DEV: 'crypto-default',
          PROD: 'crypto-speculation',
        },
      },
    ],
    oracleBehavior: 'continuous-public',
    requiresSourceAsOf: false,
    gameDesign:
      'Genuinely two-sided and continuously moving; the strongest fit in the launch set.',
    latencyArbitrageRisk:
      'Exchange prices are visible before the 5-second poll reaches Manifold, so exact-price zero-fee execution can be picked off. The poll was 15s until 2026-08-17, when measured extraction of ~M$34k against the 10bps taker fee shrank it.',
    recommended: {
      maxLeverage: 5,
      annualMaxFundingRate: 1,
      fundingSensitivity: 1,
      maxOraclePriceAgeMs: 2 * MINUTE_MS,
      subsidyLong: 25_000,
      subsidyShort: 25_000,
    },
    minimumHistory: { spanMs: 30 * DAY_MS, points: 30 * 24 },
  },
  {
    feedId: TRUMP_APPROVAL_FEED_ID,
    question: 'Trump approval rating',
    requiredTopics: [
      {
        name: 'Politics',
        slugByEnvironment: {
          DEV: 'politics-default',
          PROD: 'politics-default',
        },
      },
    ],
    oracleBehavior: 'scheduled-step',
    requiresSourceAsOf: false,
    gameDesign:
      "Two-sided political exposure, but VoteHub's time-weighted average is slow and often unchanged between poll releases.",
    latencyArbitrageRisk:
      "The source value is public, so ingestion latency is the whole exposure: the feed is polled every 5 minutes against VoteHub's own max-age=300 cache, which bounds the window in which a move is visible to a trader but not yet to the market. Recommended leverage assumes that bound holds.",
    recommended: {
      maxLeverage: 3,
      annualMaxFundingRate: 1,
      fundingSensitivity: 1,
      maxOraclePriceAgeMs: 30 * HOUR_MS,
      subsidyLong: 5_000,
      subsidyShort: 5_000,
    },
    minimumHistory: { spanMs: 30 * DAY_MS, points: 30 },
  },
  // The other VoteHub average still running: same publisher, same cadence,
  // same conservative settings as the Trump market. A share, never a margin,
  // so the price is always positive and both directions are tradeable. (The
  // 2026 generic-ballot market that launched beside it is in
  // PERP_LAUNCH_RETIRED_MARKETS; its 2028 successors are pending below.)
  {
    feedId: VANCE_FAVORABILITY_FEED_ID,
    question: 'JD Vance favorability (VoteHub avg, %)',
    requiredTopics: [
      {
        name: 'Politics',
        slugByEnvironment: {
          DEV: 'politics-default',
          PROD: 'politics-default',
        },
      },
    ],
    oracleBehavior: 'scheduled-step',
    requiresSourceAsOf: false,
    gameDesign:
      "Two-sided political exposure on a figure whose standing is contested in both directions, priced as the Favorable share rather than net favorability so the level is always positive. Favorability is polled less often than presidential approval, so expect longer flat stretches between releases than the Trump market shows, and expect the independent cross-check to report 'unchecked' more often.",
    latencyArbitrageRisk:
      "Same as the other VoteHub feeds: the value is public and the feed is polled every 5 minutes against VoteHub's max-age=300 cache, so a trader can see a new average at most a few minutes before the market does. Fewer polls means fewer, larger steps, each of them public before the poll reaches the market.",
    recommended: {
      maxLeverage: 3,
      annualMaxFundingRate: 1,
      fundingSensitivity: 1,
      maxOraclePriceAgeMs: 30 * HOUR_MS,
      subsidyLong: 5_000,
      subsidyShort: 5_000,
    },
    minimumHistory: { spanMs: 30 * DAY_MS, points: 30 },
  },
  {
    feedId: CRYPTO_FEAR_GREED_FEED_ID,
    question: 'Crypto Fear & Greed index (Alternative.me)',
    requiredTopics: [
      {
        name: 'Crypto',
        slugByEnvironment: {
          DEV: 'crypto-default',
          PROD: 'crypto-speculation',
        },
      },
    ],
    oracleBehavior: 'scheduled-step',
    requiresSourceAsOf: false,
    gameDesign:
      'A bounded 0-100 sentiment gauge that is mean-reverting by construction and genuinely two-sided: extreme readings in either direction tend to revert, momentum traders and contrarians both have a thesis, and the index is decorrelated enough from BTC spot to be its own market rather than a proxy for the BTC perp. It steps once a day, so expect long flat stretches between moves.',
    latencyArbitrageRisk:
      'The new daily value is public on alternative.me at roughly 00:00 UTC and the feed is polled every 5 minutes, so the window in which a trader can see the new print before the market marks it is bounded by that poll. The step is predictable in timing but not in direction or size.',
    recommended: {
      maxLeverage: 3,
      annualMaxFundingRate: 1,
      fundingSensitivity: 1,
      maxOraclePriceAgeMs: 30 * HOUR_MS,
      subsidyLong: 5_000,
      subsidyShort: 5_000,
    },
    minimumHistory: { spanMs: 30 * DAY_MS, points: 30 },
  },
  {
    feedId: OPENROUTER_OPEN_WEIGHT_FEED_ID,
    question: 'Open-weight AI token share on OpenRouter (%)',
    requiredTopics: [
      {
        name: 'AI',
        slugByEnvironment: {
          DEV: 'ai',
          PROD: 'ai',
        },
      },
    ],
    oracleBehavior: 'scheduled-step',
    requiresSourceAsOf: true,
    gameDesign:
      'The trailing share can rise or fall and has coherent AI-adoption theses in both directions.',
    latencyArbitrageRisk:
      'OpenRouter currently exposes complete UTC days, so hourly Manifold points usually repeat one daily value. Re-stamping a flat value does not remove the predictable next-step arbitrage window.',
    recommended: {
      maxLeverage: 3,
      annualMaxFundingRate: 1,
      fundingSensitivity: 1,
      maxOraclePriceAgeMs: 6 * HOUR_MS,
      subsidyLong: 10_000,
      subsidyShort: 10_000,
    },
    minimumHistory: { spanMs: 30 * DAY_MS, points: 30 },
  },
  // Two more indexes over the same OpenRouter payload (lab-share.ts), with
  // the open-weight entry's settings: same source, same cadence, same
  // dataset terms (hence requiresSourceAsOf).
  {
    feedId: OPENROUTER_ANTHROPIC_SHARE_FEED_ID,
    question: 'Anthropic share of OpenRouter tokens (%)',
    requiredTopics: [
      {
        name: 'AI',
        slugByEnvironment: {
          DEV: 'ai',
          PROD: 'ai',
        },
      },
    ],
    oracleBehavior: 'scheduled-step',
    requiresSourceAsOf: true,
    gameDesign:
      "Measures tokens routed THROUGH OpenRouter to Anthropic models, not Anthropic's total usage: most Anthropic traffic goes direct to Anthropic and the cloud providers and never touches OpenRouter, so this is a proxy for third-party-routed demand, not for Anthropic's market share. Read that way it is genuinely two-sided — a new Claude release, a pricing change, a competitor launch, or a shift in what OpenRouter's own user base builds all move it in either direction — and the trailing 7-day window keeps any single day's step small.",
    latencyArbitrageRisk:
      'OpenRouter currently exposes complete UTC days, so hourly Manifold points usually repeat one daily value. Re-stamping a flat value does not remove the predictable next-step arbitrage window.',
    recommended: {
      maxLeverage: 3,
      annualMaxFundingRate: 1,
      fundingSensitivity: 1,
      maxOraclePriceAgeMs: 6 * HOUR_MS,
      subsidyLong: 10_000,
      subsidyShort: 10_000,
    },
    minimumHistory: { spanMs: 30 * DAY_MS, points: 30 },
  },
  {
    feedId: OPENROUTER_CHINESE_LAB_SHARE_FEED_ID,
    question: 'Chinese-lab share of OpenRouter tokens (%)',
    requiredTopics: [
      {
        name: 'AI',
        slugByEnvironment: {
          DEV: 'ai',
          PROD: 'ai',
        },
      },
    ],
    oracleBehavior: 'scheduled-step',
    requiresSourceAsOf: true,
    gameDesign:
      'The share of OpenRouter-routed tokens attributed to labs headquartered in China. Two-sided with coherent theses both ways: open-weight Chinese releases and their price advantage push it up, frontier closed releases and enterprise routing patterns push it down. New authors enter a database-backed review queue; an unresolved author is excluded from both sides and, past 1% of tokens, pauses the feed until an operator classifies it.',
    latencyArbitrageRisk:
      'OpenRouter currently exposes complete UTC days, so hourly Manifold points usually repeat one daily value. Re-stamping a flat value does not remove the predictable next-step arbitrage window.',
    recommended: {
      maxLeverage: 3,
      annualMaxFundingRate: 1,
      fundingSensitivity: 1,
      maxOraclePriceAgeMs: 6 * HOUR_MS,
      subsidyLong: 10_000,
      subsidyShort: 10_000,
    },
    minimumHistory: { spanMs: 30 * DAY_MS, points: 30 },
  },
  // Tokenized-equity trio (xStocks by Backed). These deliberately track the
  // TOKEN's venue price, not the underlying index: that is what makes the
  // feed free and licence-clean (we composite public crypto-venue quotes,
  // like BTC) and what gives it genuine 24/7 price discovery — mint/redeem
  // arbitrage pins the token to the ETF during US market hours and it trades
  // like a futures proxy overnight and on weekends. The questions name the
  // index for discovery but state the tracked instrument.
  //
  // Leverage is capped below BTC's because total venue turnover is ~3 orders
  // of magnitude thinner (~$3-6M/day SPYx, less for the others): the
  // consensus gate rejects single-venue wicks, but a thin-book move that two
  // venues echo executes here at zero fees.
  {
    feedId: SPYX_USD_FEED_ID,
    question: 'S&P 500 — tokenized SPY price (SPYx, USD)',
    requiredTopics: [
      {
        // DEV has no Stocks topic; economics-default exists in both
        // environments (same pattern as BTC's crypto-default).
        name: 'Stocks',
        slugByEnvironment: {
          DEV: 'economics-default',
          PROD: 'stocks',
        },
      },
    ],
    oracleBehavior: 'continuous-public',
    requiresSourceAsOf: false,
    gameDesign:
      'Two-sided macro exposure with real 24/7 price discovery: pinned to SPY intraday by issuer arbitrage, a futures-like proxy on nights and weekends. Dividend reinvestment (balance rebasing) makes the raw token drift above SPY spot by roughly 1%/yr; the feed quotes the raw token consistently.',
    latencyArbitrageRisk:
      'Venue prices are public before the 15-second poll reaches Manifold, so exact-price zero-fee execution can be picked off, and books are far thinner than BTC. Weekend liquidity is the worst case: consensus can wobble and a genuine fast move executes against the stale cache for up to a tick.',
    recommended: {
      maxLeverage: 3,
      annualMaxFundingRate: 1,
      fundingSensitivity: 1,
      maxOraclePriceAgeMs: 5 * MINUTE_MS,
      subsidyLong: 10_000,
      subsidyShort: 10_000,
    },
    minimumHistory: { spanMs: 30 * DAY_MS, points: 30 * 24 },
  },
  {
    feedId: QQQX_USD_FEED_ID,
    question: 'Nasdaq-100 — tokenized QQQ price (QQQx, USD)',
    requiredTopics: [
      {
        name: 'Stocks',
        slugByEnvironment: {
          DEV: 'economics-default',
          PROD: 'stocks',
        },
      },
    ],
    oracleBehavior: 'continuous-public',
    requiresSourceAsOf: false,
    gameDesign:
      'Higher-beta sibling of the SPYx market with the same 24/7 discovery mechanics; correlated with both SPYx and BTC, which traders can spread against.',
    latencyArbitrageRisk:
      'Same pick-off surface as SPYx, plus a two-source consensus (MEXC does not list QQQx): one venue outage stalls the feed until it recovers, pausing trading at maxOraclePriceAgeMs rather than executing one-venue prices.',
    recommended: {
      maxLeverage: 3,
      annualMaxFundingRate: 1,
      fundingSensitivity: 1,
      maxOraclePriceAgeMs: 5 * MINUTE_MS,
      subsidyLong: 10_000,
      subsidyShort: 10_000,
    },
    minimumHistory: { spanMs: 30 * DAY_MS, points: 30 * 24 },
  },
  {
    feedId: GLDX_USD_FEED_ID,
    question: 'Gold — tokenized GLD price (GLDx, USD)',
    requiredTopics: [
      {
        name: 'Economics',
        slugByEnvironment: {
          DEV: 'economics-default',
          PROD: 'economics-default',
        },
      },
    ],
    oracleBehavior: 'continuous-public',
    requiresSourceAsOf: false,
    gameDesign:
      'Macro/safe-haven exposure that diversifies the equity pair; no dividends, so no rebase drift. Thinnest venue set in the trio (Gate turned over ~$56K/day at probe time), hence the same conservative caps despite the calmer underlying.',
    latencyArbitrageRisk:
      'Same pick-off surface and two-source consensus caveat as QQQx, on the thinnest books of the three markets.',
    recommended: {
      maxLeverage: 3,
      annualMaxFundingRate: 1,
      fundingSensitivity: 1,
      maxOraclePriceAgeMs: 5 * MINUTE_MS,
      subsidyLong: 10_000,
      subsidyShort: 10_000,
    },
    minimumHistory: { spanMs: 30 * DAY_MS, points: 30 * 24 },
  },
  {
    feedId: NVDAX_USD_FEED_ID,
    question: 'Nvidia — tokenized NVDA price (NVDAx, USD)',
    requiredTopics: [
      {
        name: 'Stocks',
        slugByEnvironment: {
          DEV: 'economics-default',
          PROD: 'stocks',
        },
      },
    ],
    oracleBehavior: 'continuous-public',
    requiresSourceAsOf: false,
    gameDesign:
      'The only single-name equity in the set: higher volatility and coherent theses on both sides, but earnings and headline gaps land harder than on the index pairs — leverage should stay at the conservative recommendation until post-earnings behavior is observed. Pays a negligible dividend, so rebase drift is immaterial.',
    latencyArbitrageRisk:
      'Same pick-off surface as SPYx (all three venues listed), with larger single-name jumps: an earnings gap can exceed the consensus tolerance venue-by-venue for a few ticks while books reprice.',
    recommended: {
      maxLeverage: 3,
      annualMaxFundingRate: 1,
      fundingSensitivity: 1,
      maxOraclePriceAgeMs: 5 * MINUTE_MS,
      subsidyLong: 10_000,
      subsidyShort: 10_000,
    },
    minimumHistory: { spanMs: 30 * DAY_MS, points: 30 * 24 },
  },
  {
    feedId: ADJACENT_MSRY_FEED_ID,
    question: 'Misery Index — market-implied unemployment + inflation (%)',
    requiredTopics: [
      {
        name: 'Economics',
        slugByEnvironment: {
          DEV: 'economics-default',
          PROD: 'economics-default',
        },
      },
    ],
    oracleBehavior: 'continuous-public',
    requiresSourceAsOf: false,
    gameDesign:
      "Adjacent's Misery Implied Index: implied U-3 unemployment plus implied CPI-U year-over-year, read off event-contract ladders on the next BLS prints and recalculated every minute. Two-sided, with macro theses both ways, and not monotone. It is also quiet: about 8.0 to 8.25 over its first weeks, daily moves of a few hundredths, while a single strike crossing 50 cents moves it by up to a tenth. Two moves are predictable. Each sleeve rolls to its next reference month in five weekday steps at 5:30 p.m. Eastern, ending the day before the BLS release, so a step's direction and rough size are visible beforehand from the two months' implied levels. A sleeve with no valid bracket holds its last level until one exists, then moves at once. The roll schedule is published, so a trader can pre-position each step, and funding does not price it.",
    latencyArbitrageRisk:
      "Orders fill only at a value Adjacent recalculated after the order (provider-stamped eligibility, as for MNX), so a value already visible at Adjacent, or a cached response we receive late, cannot fill one. What remains is predictability: roll steps and held-sleeve releases are knowable in advance, and the event-contract ladders underneath trade continuously, so anyone replicating Adjacent's rate methodology sees the next print coming. Low leverage keeps a 0.02-0.1 point step from being a large payoff against the 10 bps taker fee.",
    recommended: {
      maxLeverage: 3,
      annualMaxFundingRate: 1,
      fundingSensitivity: 1,
      maxOraclePriceAgeMs: 5 * MINUTE_MS,
      subsidyLong: 5_000,
      subsidyShort: 5_000,
    },
    // Adjacent's history starts 2026-10-09, and the public tier serves 30
    // days of it hourly, so two weeks of hourly points is what a backfill
    // can actually produce on any launch date.
    minimumHistory: { spanMs: 14 * DAY_MS, points: 14 * 24 },
  },
]

// MNX is a separately selectable rollout cohort in BOTH environments. Existing
// release gates keep their scope until operators explicitly select --cohort=mnx.
// Creation/title/topic policy and manifest validation include every cohort.
export const ALL_PERP_LAUNCH_MARKETS = [
  ...PERP_LAUNCH_MARKETS,
  ...MNX_LAUNCH_MARKETS,
]

// Feeds that exist in the oracle registry but must never have a launch
// market. Currently empty: the one prior member (the monotone ECI frontier)
// was removed from the codebase entirely rather than retained as a
// non-market feed. The mechanism stays because the preflight enforces it,
// and any future ingest-only feed must be listed here explicitly.
export const PERP_LAUNCH_EXCLUDED_FEED_IDS: readonly string[] = []

export type PerpPendingLaunchMarketDefinition = PerpLaunchMarketDefinition & {
  /** What blocks the launch, and what promotes the entry. */
  pendingReason: string
}

// Reviewed definitions that are NOT yet launchable. The feed stays in the
// registry with marketCreationEnabled: false — the admin form refuses to
// create a market and the preflight fails any market that appears on it.
// Ingestion, backfill scripts and health checks run for a pending feed whose
// source exists; a feed registered ahead of its provider carries
// `lifecycle: awaiting-source` as well, and then nothing polls or probes it
// (see OracleFeedDef.lifecycle). The reviewed settings live here so promotion
// is a move, not a rewrite: resolve the reason, clear the lifecycle and
// enable creation in the registry, move the entry into PERP_LAUNCH_MARKETS.
// The manifest check enforces that a pending feed is creation-disabled, so
// the two lists cannot silently disagree.
const GENERIC_BALLOT_2028_LAUNCH = {
  requiredTopics: [
    {
      name: 'Politics',
      slugByEnvironment: {
        DEV: 'politics-default',
        PROD: 'politics-default',
      },
    },
  ],
  oracleBehavior: 'scheduled-step',
  requiresSourceAsOf: false,
  latencyArbitrageRisk:
    "The source value is public, so ingestion latency is the whole exposure: the feed is polled every 5 minutes against VoteHub's own max-age=300 cache, which bounds the window in which a move is visible to a trader but not yet to the market. Recommended leverage assumes that bound holds.",
  // The 2026 market's reviewed settings, unchanged. (That market was created
  // at 10x against this 3x recommendation and ran two months without
  // incident; the recommendation stays conservative for a thin early-cycle
  // series.)
  recommended: {
    maxLeverage: 3,
    annualMaxFundingRate: 1,
    fundingSensitivity: 1,
    maxOraclePriceAgeMs: 30 * HOUR_MS,
    subsidyLong: 5_000,
    subsidyShort: 5_000,
  },
  minimumHistory: { spanMs: 30 * DAY_MS, points: 30 },
  pendingReason:
    'VoteHub had not published a `generic_ballot_2028` average as of 2026-11-09 (HTTP 404) and listed no 2028 generic-ballot polls. Promote when backend/scripts/list-votehub-averages.ts shows the key with `dem` and `rep` answer objects: clear the registry lifecycle, enable creation, move both entries into PERP_LAUNCH_MARKETS, deploy API + scheduler-perps, backfill both feeds (backfill-votehub-oracle.ts), then create the markets with create-votehub-perps.ts.',
} as const satisfies Omit<
  PerpPendingLaunchMarketDefinition,
  'feedId' | 'question' | 'gameDesign'
>

export const PERP_LAUNCH_PENDING_MARKETS: readonly PerpPendingLaunchMarketDefinition[] =
  [
    // The 2028 generic ballot as a PAIR — one market per major party's share
    // of VoteHub's single `generic_ballot_2028` series — rather than the 2026
    // design's Democratic share alone, so a trader with a view on either
    // party's number has a level to trade. The two are not mirror images:
    // undecided/other moves them independently.
    {
      ...GENERIC_BALLOT_2028_LAUNCH,
      feedId: VOTEHUB_GENERIC_BALLOT_2028_DEM_FEED_ID,
      question: 'Democratic share of 2028 generic ballot (VoteHub avg, %)',
      gameDesign:
        "Two-sided: the Democratic share of the generic ballot moves with the national environment and has coherent theses on both sides, but VoteHub's time-weighted average is slow and often unchanged between poll releases — and early in a cycle the polling is thin, so expect long flat stretches. The series is cycle-bound: election day is 2028-11-07 and the published average stops there, so the market description must carry the 2026 market's settlement rule (settled by hand at the last accepted value after election day; never on the result), and the feed is retired in the registry once that settlement is done.",
    },
    {
      ...GENERIC_BALLOT_2028_LAUNCH,
      feedId: VOTEHUB_GENERIC_BALLOT_2028_REP_FEED_ID,
      question: 'Republican share of 2028 generic ballot (VoteHub avg, %)',
      gameDesign:
        'The Republican share of the same series, as its own level rather than 100 minus the Democratic one: undecided and third-party respondents mean the two shares move independently (the 2026 series closed at D 52.1 / R 43.3). Same slow, thin-early source, same cycle-bound settlement rule and retirement as the Democratic market.',
    },
  ]

export type PerpRetiredLaunchMarketDefinition = PerpLaunchMarketDefinition & {
  /** What ended it: the series' end, the settlement, where the record is. */
  retiredReason: string
}

// Launch markets whose feed has been RETIRED in the registry: the series
// ended (or every market settled), nothing publishes or probes it any more,
// and create-perp refuses it. The definition is kept for the record and as
// the template for the next cycle. The manifest check enforces that a retired
// feed is lifecycle-retired and creation-disabled, and appears on no other
// list.
export const PERP_LAUNCH_RETIRED_MARKETS: readonly PerpRetiredLaunchMarketDefinition[] =
  [
    {
      feedId: VOTEHUB_GENERIC_BALLOT_2026_FEED_ID,
      question: 'Democratic share of 2026 generic ballot (VoteHub avg, %)',
      requiredTopics: [
        {
          name: 'Politics',
          slugByEnvironment: {
            DEV: 'politics-default',
            PROD: 'politics-default',
          },
        },
      ],
      oracleBehavior: 'scheduled-step',
      requiresSourceAsOf: false,
      gameDesign:
        "Two-sided: the Democratic share of the generic ballot moves with the national environment and has coherent theses on both sides, but VoteHub's time-weighted average is slow and often unchanged between poll releases. The series was cycle-bound (election day 2026-11-03), which is why the market carried a manual-settlement rule rather than a close date.",
      latencyArbitrageRisk:
        "The source value is public, so ingestion latency is the whole exposure: the feed is polled every 5 minutes against VoteHub's own max-age=300 cache, which bounds the window in which a move is visible to a trader but not yet to the market. Recommended leverage assumes that bound holds.",
      recommended: {
        maxLeverage: 3,
        annualMaxFundingRate: 1,
        fundingSensitivity: 1,
        maxOraclePriceAgeMs: 30 * HOUR_MS,
        subsidyLong: 5_000,
        subsidyShort: 5_000,
      },
      minimumHistory: { spanMs: 30 * DAY_MS, points: 30 },
      retiredReason:
        "VoteHub's generic_ballot_2026 series ended 2026-11-03 (final value posted 11/04); prod market nScRu5uy6yCu was settled on 2026-11-05 at that value (52.1), per its description. Successors: the 2028 pair in PERP_LAUNCH_PENDING_MARKETS.",
    },
  ]

// Residual pool value returns to the market creator at settlement. Restrict
// the launch set to the environment's official Manifold account so a personal
// admin account cannot accidentally own those economics.
export const PERP_LAUNCH_CREATOR_IDS = {
  DEV: 'MxyCh2xvsFMFywwjg3Az0w4xP5B3',
  PROD: HOUSE_LIQUIDITY_PROVIDER_ID,
} as const

export const getPerpLaunchCreatorId = (environment: 'DEV' | 'PROD') =>
  PERP_LAUNCH_CREATOR_IDS[environment]

export const getPerpLaunchTopicSlug = (
  topic: PerpLaunchMarketDefinition['requiredTopics'][number],
  environment: 'DEV' | 'PROD'
) => topic.slugByEnvironment[environment]

export const PERP_LAUNCH_SCHEDULER_EXPECTATIONS = [
  {
    jobName: 'update-oracle-feeds',
    maxEndAgeMs: 2 * MINUTE_MS,
    maxRunMs: MINUTE_MS,
  },
  {
    jobName: 'update-perps',
    maxEndAgeMs: 2 * HOUR_MS,
    maxRunMs: 30 * MINUTE_MS,
  },
  {
    jobName: 'update-openrouter-share',
    maxEndAgeMs: 3 * HOUR_MS,
    maxRunMs: 30 * MINUTE_MS,
  },
  {
    jobName: 'update-trump-approval',
    // Polls every 5 minutes, so a 26h last-success age would have described
    // a job that had been dead for over 300 consecutive runs.
    maxEndAgeMs: 30 * MINUTE_MS,
    maxRunMs: 2 * MINUTE_MS,
  },
  {
    jobName: 'update-votehub-averages',
    // The other VoteHub averages, on the Trump job's cadence and bounds.
    maxEndAgeMs: 30 * MINUTE_MS,
    maxRunMs: 2 * MINUTE_MS,
  },
  {
    jobName: 'update-fear-greed',
    // Every 5 minutes, one small fetch.
    maxEndAgeMs: 30 * MINUTE_MS,
    maxRunMs: 2 * MINUTE_MS,
  },
] as const

export const getNominalAnnualFundingRate = (
  fundingRatePerPeriod: number,
  fundingPeriodMs: number
) => {
  if (
    !Number.isFinite(fundingRatePerPeriod) ||
    fundingRatePerPeriod <= 0 ||
    !Number.isFinite(fundingPeriodMs) ||
    fundingPeriodMs <= 0
  )
    return Number.NaN
  const annualRate = fundingRatePerPeriod * (YEAR_MS / fundingPeriodMs)
  return Number.isFinite(annualRate) ? annualRate : Number.NaN
}

/** Field checks every reviewed definition must pass, launchable or pending. */
const collectDefinitionErrors = (
  market: PerpLaunchMarketDefinition,
  feed: ReturnType<typeof getOracleFeed>,
  errors: string[]
) => {
  if (!market.question.trim())
    errors.push(`${market.feedId} has no launch question`)
  if (market.question !== market.question.trim())
    errors.push(`${market.feedId} launch question has surrounding whitespace`)
  if (market.question.length > MAX_QUESTION_LENGTH)
    errors.push(
      `${market.feedId} launch question exceeds ${MAX_QUESTION_LENGTH} characters`
    )
  if (/\bperpetual\b/i.test(market.question))
    errors.push(
      `${market.feedId} repeats "perpetual" in its title; the ticker and market type are rendered separately`
    )
  // The ticker is what the title badge shows in place of the market type,
  // what the /perps hub labels the row with, and what search matches, so a
  // launch feed without one would launch unlabelled. It lives in `common`
  // (the web renders it), not in this definition — see common/perps/ticker.
  const ticker = getPerpFeedTicker(market.feedId)
  if (!ticker)
    errors.push(
      `${market.feedId} has no canonical ticker in PERP_FEED_TICKERS (common/perps/ticker.ts)`
    )
  else if (!isValidPerpTicker(ticker))
    errors.push(
      `${market.feedId} ticker "${ticker}" is not one alphanumeric token of at most ${PERP_TICKER_MAX_LENGTH} characters starting with a letter`
    )
  if (
    market.requiresSourceAsOf !==
    (getOracleAttribution(market.feedId)?.showAsOf === true)
  )
    errors.push(
      `${market.feedId} source-as-of requirement disagrees with its attribution metadata`
    )
  if (
    !Number.isFinite(market.recommended.maxLeverage) ||
    market.recommended.maxLeverage <= 1 ||
    market.recommended.maxLeverage > 100
  )
    errors.push(`${market.feedId} has an invalid recommended leverage`)
  if (
    !Number.isFinite(market.recommended.annualMaxFundingRate) ||
    market.recommended.annualMaxFundingRate <= 0 ||
    !Number.isFinite(market.recommended.fundingSensitivity) ||
    market.recommended.fundingSensitivity <= 0
  )
    errors.push(`${market.feedId} has an invalid funding recommendation`)
  if (
    !Number.isFinite(market.recommended.subsidyLong) ||
    market.recommended.subsidyLong <= 0 ||
    !Number.isFinite(market.recommended.subsidyShort) ||
    market.recommended.subsidyShort <= 0
  )
    errors.push(`${market.feedId} has an invalid backing recommendation`)
  if (market.requiredTopics.length === 0)
    errors.push(`${market.feedId} has no required discovery topic`)
  for (const environment of ['DEV', 'PROD'] as const) {
    const requiredTopicSlugs = market.requiredTopics.map((topic) =>
      getPerpLaunchTopicSlug(topic, environment)
    )
    if (new Set(requiredTopicSlugs).size !== requiredTopicSlugs.length)
      errors.push(
        `${market.feedId} has duplicate ${environment} discovery topics`
      )
  }
  for (const topic of market.requiredTopics) {
    if (
      !topic.name ||
      !getPerpLaunchTopicSlug(topic, 'DEV') ||
      !getPerpLaunchTopicSlug(topic, 'PROD')
    )
      errors.push(`${market.feedId} has an invalid required discovery topic`)
  }
  if (
    feed &&
    (market.recommended.maxOraclePriceAgeMs < feed.staleAfterMs ||
      !Number.isFinite(market.recommended.maxOraclePriceAgeMs))
  )
    errors.push(
      `${market.feedId} recommended max oracle age is below its health threshold`
    )
}

export const getPerpLaunchManifestErrors = () => {
  const errors: string[] = []
  const feedIds = ALL_PERP_LAUNCH_MARKETS.map((market) => market.feedId)
  const pendingIds = PERP_LAUNCH_PENDING_MARKETS.map((market) => market.feedId)
  const retiredIds = PERP_LAUNCH_RETIRED_MARKETS.map((market) => market.feedId)
  if (new Set(feedIds).size !== feedIds.length)
    errors.push('launch manifest has duplicate feed ids')
  if (
    new Set([...feedIds, ...pendingIds, ...retiredIds]).size !==
    feedIds.length + pendingIds.length + retiredIds.length
  )
    errors.push(
      'a feed appears in more than one of the launch, pending and retired manifests'
    )
  for (const environment of ['DEV', 'PROD'] as const) {
    if (!getPerpLaunchCreatorId(environment))
      errors.push(`${environment} has no official launch creator`)
  }

  for (const market of ALL_PERP_LAUNCH_MARKETS) {
    const feed = getOracleFeed(market.feedId)
    collectDefinitionErrors(market, feed, errors)
    if (!feed) {
      errors.push(`${market.feedId} is absent from the oracle registry`)
      continue
    }
    if (!feed.marketCreationEnabled)
      errors.push(`${market.feedId} is disabled for market creation`)
    if (!isOracleFeedLive(feed))
      errors.push(
        `${market.feedId} is launchable but its feed is ${feed.lifecycle?.phase}; move it to the pending or retired manifest`
      )
  }

  for (const market of PERP_LAUNCH_PENDING_MARKETS) {
    const feed = getOracleFeed(market.feedId)
    collectDefinitionErrors(market, feed, errors)
    if (!market.pendingReason.trim())
      errors.push(`${market.feedId} is pending without a stated reason`)
    if (!feed) {
      errors.push(
        `${market.feedId} (pending) is absent from the oracle registry`
      )
      continue
    }
    if (feed.marketCreationEnabled)
      errors.push(
        `${market.feedId} is pending but enabled for creation; promote it into ALL_PERP_LAUNCH_MARKETS or disable creation`
      )
    if (feed.lifecycle?.phase === 'retired')
      errors.push(
        `${market.feedId} is pending but its feed is retired; a retired feed never launches`
      )
    if (PERP_LAUNCH_EXCLUDED_FEED_IDS.includes(market.feedId))
      errors.push(`${market.feedId} is both pending and explicitly excluded`)
  }

  for (const market of PERP_LAUNCH_RETIRED_MARKETS) {
    const feed = getOracleFeed(market.feedId)
    collectDefinitionErrors(market, feed, errors)
    if (!market.retiredReason.trim())
      errors.push(`${market.feedId} is retired without a stated reason`)
    if (!feed) {
      // The registry entry stays so the settled market's chart, ticker and
      // credit keep resolving (and so this check can see the lifecycle).
      errors.push(
        `${market.feedId} (retired) is absent from the oracle registry`
      )
      continue
    }
    if (feed.lifecycle?.phase !== 'retired')
      errors.push(
        `${market.feedId} is in the retired manifest but its feed is not lifecycle-retired`
      )
    if (feed.marketCreationEnabled)
      errors.push(`${market.feedId} is retired but still enabled for creation`)
    if (PERP_LAUNCH_EXCLUDED_FEED_IDS.includes(market.feedId))
      errors.push(`${market.feedId} is both retired and explicitly excluded`)
  }

  // The converse: a lifecycle in the registry must be reflected in the
  // manifest, so a feed cannot be quietly retired or parked with its launch
  // definition still claiming it is live.
  for (const feed of ORACLE_FEEDS) {
    if (feed.lifecycle?.phase === 'retired' && !retiredIds.includes(feed.id))
      errors.push(
        `${feed.id} is lifecycle-retired in the registry but not in PERP_LAUNCH_RETIRED_MARKETS`
      )
    if (
      feed.lifecycle?.phase === 'awaiting-source' &&
      !pendingIds.includes(feed.id)
    )
      errors.push(
        `${feed.id} is awaiting its source in the registry but not in PERP_LAUNCH_PENDING_MARKETS`
      )
  }

  for (const feedId of PERP_LAUNCH_EXCLUDED_FEED_IDS) {
    if (feedIds.includes(feedId))
      errors.push(`${feedId} is both launched and explicitly excluded`)
    const feed = getOracleFeed(feedId)
    if (!feed) errors.push(`${feedId} exclusion has no registry entry`)
    else if (feed.marketCreationEnabled)
      errors.push(`${feedId} is excluded but still enabled for creation`)
  }
  return errors
}
