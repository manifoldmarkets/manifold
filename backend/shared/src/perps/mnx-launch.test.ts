import { getOracleFeed, getMinTradingMarkAgeMs } from '../oracle-feeds'
import { getOracleAttribution } from 'common/perps/oracle-attribution'
import { ORACLE_TICK_DECORATIONS } from 'common/perps/oracle-display'
import { ALL_PERP_LAUNCH_MARKETS, PERP_LAUNCH_MARKETS } from './launch-manifest'
import {
  getPerpLaunchManifestErrors,
  MNX_LAUNCH_MARKETS,
  PERP_LAUNCH_RETIRED_MARKETS,
} from './launch-manifest'
import { MNX_INSTRUMENTS, MNX_LIVE_INSTRUMENTS } from 'common/perps/mnx'
import { getPerpFeedTicker } from 'common/perps/ticker'

it('integrates the launch cohort without breaking the existing manifest', () => {
  expect(getPerpLaunchManifestErrors()).toEqual([])
  expect(MNX_LAUNCH_MARKETS.map((m) => m.feedId)).toEqual(
    MNX_LIVE_INSTRUMENTS.map((m) => m.feedId)
  )
  expect(
    MNX_LAUNCH_MARKETS.reduce(
      (sum, m) => sum + m.recommended.subsidyLong + m.recommended.subsidyShort,
      0
    )
  ).toBe(750_000)
  expect(MNX_LAUNCH_MARKETS.every((m) => m.recommended.maxLeverage === 3)).toBe(
    true
  )
})

it('registers every live feed on the shared 2s tick with attribution and launch policy', () => {
  for (const spec of MNX_LIVE_INSTRUMENTS) {
    expect(getOracleFeed(spec.feedId)).toMatchObject({
      cadence: 'fast',
      pollPeriodMs: 2000,
      marketCreationEnabled: true,
      fetchObservation: expect.any(Function),
      minPrice: spec.minPrice,
      maxPrice: spec.maxPrice,
      staleAfterMs: spec.maxAgeMs,
      updatePeriodMs: spec.updatePeriodMs,
    })
    expect(getOracleAttribution(spec.feedId)?.url).toBe(spec.url)
    expect(ORACLE_TICK_DECORATIONS[spec.feedId]).toEqual({
      prefix: '$',
      suffix: spec.category === 'valuation' ? 'B' : '',
    })
    expect(
      MNX_LAUNCH_MARKETS.find((m) => m.feedId === spec.feedId)
    ).toMatchObject({
      question: spec.question,
      oracleBehavior:
        spec.category === 'compute' ? 'scheduled-step' : 'continuous-public',
      requiresSourceAsOf: true,
      recommended: { maxOraclePriceAgeMs: spec.maxAgeMs, maxLeverage: 3 },
      requiredTopics: [{ name: spec.category === 'equity' ? 'Stocks' : 'AI' }],
    })
    expect(
      getMinTradingMarkAgeMs(getOracleFeed(spec.feedId)!)
    ).toBeGreaterThanOrEqual(spec.maxAgeMs / 2 + 2000)
    expect(ALL_PERP_LAUNCH_MARKETS.some((m) => m.feedId === spec.feedId)).toBe(
      true
    )
    expect(PERP_LAUNCH_MARKETS.some((m) => m.feedId === spec.feedId)).toBe(
      false
    )
  }
})

it('retires delisted instruments everywhere a live one is launchable', () => {
  const retired = MNX_INSTRUMENTS.filter((i) => i.retired)
  expect(retired.map((i) => i.feedId)).toEqual([
    'mnx-anthropic-mark',
    'mnx-sndk-mark',
  ])
  const settledTickers: Record<string, string> = {
    'mnx-anthropic-mark': 'ANTH',
    'mnx-sndk-mark': 'SNDK',
  }
  for (const spec of retired) {
    const feed = getOracleFeed(spec.feedId)
    expect(feed?.marketCreationEnabled).toBe(false)
    expect(feed?.lifecycle).toEqual({
      phase: 'retired',
      at: spec.retired?.at,
      reason: spec.retired?.reason,
    })
    // The settled market still renders its ticker, units and credit.
    expect(getPerpFeedTicker(spec.feedId)).toBe(settledTickers[spec.feedId])
    expect(getOracleAttribution(spec.feedId)?.url).toBe(spec.url)
    expect(MNX_LAUNCH_MARKETS.some((m) => m.feedId === spec.feedId)).toBe(false)
    expect(
      PERP_LAUNCH_RETIRED_MARKETS.find((m) => m.feedId === spec.feedId)
    ).toMatchObject({
      question: spec.question,
      retiredReason: spec.retired?.reason,
    })
  }
})

it('lists the Anthropic share perpetual as the live successor', () => {
  const ant = MNX_LIVE_INSTRUMENTS.find((i) => i.symbol === 'ANT')
  expect(ant).toMatchObject({
    marketId: 86,
    slug: 'ant',
    type: 'perpetual',
    priceDisplay: 'usd',
    feedId: 'mnx-ant-mark',
    question: 'Anthropic (MNX)',
    url: 'https://app.mnx.fi/trade/ant',
  })
  expect(getPerpFeedTicker('mnx-ant-mark')).toBe('ANT')
  expect(getOracleFeed('mnx-ant-mark')).toMatchObject({
    marketCreationEnabled: true,
    minPrice: 10,
    maxPrice: 2000,
  })
  expect(getOracleFeed('mnx-ant-mark')?.lifecycle).toBeUndefined()
})
