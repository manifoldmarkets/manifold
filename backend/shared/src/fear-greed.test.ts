import { getOracleAttribution } from 'common/perps/oracle-attribution'
import { ORACLE_TICK_DECORATIONS } from 'common/perps/oracle-display'
import { FEAR_GREED_MAX } from 'common/perps/fear-greed'

import { FEAR_GREED_API_URL } from './fear-greed'
import { CRYPTO_FEAR_GREED_FEED_ID } from './oracle'
import { getOracleFeed } from './oracle-feeds'
import {
  PERP_LAUNCH_MARKETS,
  PERP_LAUNCH_SCHEDULER_EXPECTATIONS,
  getPerpLaunchManifestErrors,
} from './perps/launch-manifest'

// Presence checks for the `crypto-fear-greed` feed: registry, attribution,
// chart decoration, launch manifest, scheduler expectation. A missing entry
// is a red build rather than a runtime surprise.
describe('crypto-fear-greed feed wiring', () => {
  const id = CRYPTO_FEAR_GREED_FEED_ID

  it('uses the documented API endpoint, not the website', () => {
    expect(FEAR_GREED_API_URL).toBe('https://api.alternative.me/fng/')
  })

  it('is registered as a daily feed with positive bounds', () => {
    const feed = getOracleFeed(id)
    expect(feed?.cadence).toBe('daily')
    expect(feed?.marketCreationEnabled).toBe(true)
    // 1, not 0: a literal 0 print is refused by the positivity rule and the
    // feed pauses at the stale gate rather than publishing it.
    expect(feed?.minPrice).toBe(1)
    expect(feed?.maxPrice).toBe(FEAR_GREED_MAX)
    expect(feed?.staleAfterMs).toBe(26 * 60 * 60 * 1000)
    expect(feed?.updatePeriodMs).toBe(24 * 60 * 60 * 1000)
  })

  it('credits Alternative.me with a link and no unverified licence label', () => {
    const attribution = getOracleAttribution(id)
    expect(attribution?.source).toBe('Alternative.me Crypto Fear & Greed Index')
    expect(attribution?.url).toBe(
      'https://alternative.me/crypto/fear-and-greed-index/'
    )
    expect(attribution?.licence).toBeUndefined()
    expect(attribution?.licenceUrl).toBeUndefined()
    expect(attribution?.showAsOf).toBeUndefined()
  })

  it('renders as unitless index points', () => {
    expect(ORACLE_TICK_DECORATIONS[id]).toEqual({})
  })

  it('has a launch-manifest entry and a scheduler expectation', () => {
    const market = PERP_LAUNCH_MARKETS.find((m) => m.feedId === id)
    expect(market?.question).toBe('Crypto Fear & Greed index (Alternative.me)')
    expect(market?.oracleBehavior).toBe('scheduled-step')
    expect(market?.requiresSourceAsOf).toBe(false)
    expect(market?.requiredTopics.map((t) => t.name)).toEqual(['Crypto'])
    expect(PERP_LAUNCH_SCHEDULER_EXPECTATIONS.map((e) => e.jobName)).toContain(
      'update-fear-greed'
    )
    expect(getPerpLaunchManifestErrors()).toEqual([])
  })
})
