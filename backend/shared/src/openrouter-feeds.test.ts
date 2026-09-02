import { getOracleAttribution } from 'common/perps/oracle-attribution'
import { ORACLE_TICK_DECORATIONS } from 'common/perps/oracle-display'

import {
  OPENROUTER_ANTHROPIC_SHARE_FEED_ID,
  OPENROUTER_CHINESE_LAB_SHARE_FEED_ID,
  OPENROUTER_OPEN_WEIGHT_FEED_ID,
} from './oracle'
import { getOracleFeed } from './oracle-feeds'
import {
  PERP_LAUNCH_MARKETS,
  getPerpLaunchManifestErrors,
} from './perps/launch-manifest'

// Presence checks for the two lab-share feeds computed from the OpenRouter
// payload: registry, attribution (with the as-of requirement the dataset
// terms impose), chart decoration, launch manifest.
describe('OpenRouter lab-share feed wiring', () => {
  const ids = [
    OPENROUTER_ANTHROPIC_SHARE_FEED_ID,
    OPENROUTER_CHINESE_LAB_SHARE_FEED_ID,
  ]
  const openWeight = getOracleFeed(OPENROUTER_OPEN_WEIGHT_FEED_ID)

  it('registers both on the open-weight feed cadence', () => {
    for (const id of ids) {
      const feed = getOracleFeed(id)
      expect([id, feed?.cadence]).toEqual([id, 'daily'])
      expect([id, feed?.marketCreationEnabled]).toEqual([id, true])
      expect([id, feed?.staleAfterMs]).toEqual([id, openWeight?.staleAfterMs])
      expect([id, feed?.updatePeriodMs]).toEqual([
        id,
        openWeight?.updatePeriodMs,
      ])
      expect([id, feed?.minPrice]).toEqual([id, 1])
    }
    expect(getOracleFeed(OPENROUTER_ANTHROPIC_SHARE_FEED_ID)?.maxPrice).toBe(90)
    expect(getOracleFeed(OPENROUTER_CHINESE_LAB_SHARE_FEED_ID)?.maxPrice).toBe(
      95
    )
  })

  it('carries the OpenRouter credit with the as-of stamp on both', () => {
    const reference = getOracleAttribution(OPENROUTER_OPEN_WEIGHT_FEED_ID)
    for (const id of ids) {
      expect([id, getOracleAttribution(id)]).toEqual([id, reference])
      expect([id, getOracleAttribution(id)?.showAsOf]).toEqual([id, true])
    }
  })

  it('renders as a percentage', () => {
    for (const id of ids)
      expect([id, ORACLE_TICK_DECORATIONS[id]]).toEqual([id, { suffix: '%' }])
  })

  it('has launch-manifest entries that require the source as-of', () => {
    for (const id of ids) {
      const market = PERP_LAUNCH_MARKETS.find((m) => m.feedId === id)
      expect([id, market?.requiresSourceAsOf]).toEqual([id, true])
      expect([id, market?.oracleBehavior]).toEqual([id, 'scheduled-step'])
      expect([id, market?.requiredTopics.map((t) => t.name)]).toEqual([
        id,
        ['AI'],
      ])
    }
    expect(
      PERP_LAUNCH_MARKETS.find(
        (m) => m.feedId === OPENROUTER_ANTHROPIC_SHARE_FEED_ID
      )?.gameDesign
    ).toContain('THROUGH OpenRouter')
    expect(getPerpLaunchManifestErrors()).toEqual([])
  })
})
