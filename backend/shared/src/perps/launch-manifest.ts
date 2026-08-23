import { HOUSE_LIQUIDITY_PROVIDER_ID } from 'common/antes'
import { MAX_QUESTION_LENGTH } from 'common/contract'
import { DAY_MS, HOUR_MS, MINUTE_MS, YEAR_MS } from 'common/util/time'
import { getOracleAttribution } from 'common/perps/oracle-attribution'

import {
  BTC_USD_FEED_ID,
  OPENROUTER_OPEN_WEIGHT_FEED_ID,
  TRUMP_APPROVAL_FEED_ID,
  UK_GRID_CARBON_FEED_ID,
} from '../oracle'
import { getOracleFeed } from '../oracle-feeds'

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
      'Exchange prices are visible before the 15-second poll reaches Manifold, so exact-price zero-fee execution can be picked off.',
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
    feedId: UK_GRID_CARBON_FEED_ID,
    question: 'UK grid carbon intensity (gCO₂/kWh)',
    requiredTopics: [
      {
        // Science exists under one stable slug in both environments. PROD can
        // additionally attach Climate, but launch readiness must be testable
        // in DEV without inventing an environment-only topic.
        name: 'Science',
        slugByEnvironment: {
          DEV: 'science-default',
          PROD: 'science-default',
        },
      },
    ],
    oracleBehavior: 'batched-public',
    requiresSourceAsOf: false,
    gameDesign:
      'Oscillating and mean-reverting with coherent long and short theses; public forecasts reward informed trading.',
    latencyArbitrageRisk:
      'Finalized 30-minute actuals can be visible at NESO before the next Manifold poll, and the public forecast makes the direction partially anticipatable.',
    recommended: {
      maxLeverage: 3,
      annualMaxFundingRate: 1,
      fundingSensitivity: 1,
      maxOraclePriceAgeMs: 3 * HOUR_MS,
      subsidyLong: 10_000,
      subsidyShort: 10_000,
    },
    minimumHistory: { spanMs: 30 * DAY_MS, points: 30 * 24 * 2 },
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
]

// Feeds that exist in the oracle registry but must never have a launch
// market. Currently empty: the one prior member (the monotone ECI frontier)
// was removed from the codebase entirely rather than retained as a
// non-market feed. The mechanism stays because the preflight enforces it,
// and any future ingest-only feed must be listed here explicitly.
export const PERP_LAUNCH_EXCLUDED_FEED_IDS: readonly string[] = []

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

export const getPerpLaunchManifestErrors = () => {
  const errors: string[] = []
  const feedIds = PERP_LAUNCH_MARKETS.map((market) => market.feedId)
  if (new Set(feedIds).size !== feedIds.length)
    errors.push('launch manifest has duplicate feed ids')
  for (const environment of ['DEV', 'PROD'] as const) {
    if (!getPerpLaunchCreatorId(environment))
      errors.push(`${environment} has no official launch creator`)
  }

  for (const market of PERP_LAUNCH_MARKETS) {
    const feed = getOracleFeed(market.feedId)
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
        `${market.feedId} repeats "perpetual" in its title; the market type is rendered separately`
      )
    if (!feed) {
      errors.push(`${market.feedId} is absent from the oracle registry`)
      continue
    }
    if (!feed.marketCreationEnabled)
      errors.push(`${market.feedId} is disabled for market creation`)
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
      market.recommended.maxOraclePriceAgeMs < feed.staleAfterMs ||
      !Number.isFinite(market.recommended.maxOraclePriceAgeMs)
    )
      errors.push(
        `${market.feedId} recommended max oracle age is below its health threshold`
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
