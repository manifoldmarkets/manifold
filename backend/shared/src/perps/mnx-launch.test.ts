import { getOracleFeed } from '../oracle-feeds'
import { getOracleAttribution } from 'common/perps/oracle-attribution'
import { ORACLE_TICK_DECORATIONS } from 'common/perps/oracle-display'
import { ALL_PERP_LAUNCH_MARKETS, PERP_LAUNCH_MARKETS } from './launch-manifest'
import {
  getPerpLaunchManifestErrors,
  MNX_LAUNCH_MARKETS,
} from './launch-manifest'
import { MNX_INSTRUMENTS } from 'common/perps/mnx'

it('integrates the launch cohort without breaking the existing manifest', () => {
  expect(getPerpLaunchManifestErrors()).toEqual([])
  expect(MNX_LAUNCH_MARKETS.map((m) => m.feedId)).toEqual(
    MNX_INSTRUMENTS.map((m) => m.feedId)
  )
  expect(
    MNX_LAUNCH_MARKETS.reduce(
      (sum, m) => sum + m.recommended.subsidyLong + m.recommended.subsidyShort,
      0
    )
  ).toBe(800_000)
  expect(MNX_LAUNCH_MARKETS.every((m) => m.recommended.maxLeverage === 3)).toBe(
    true
  )
})

it('registers all sixteen feeds on the shared 2s tick with attribution and launch policy', () => {
  for (const spec of MNX_INSTRUMENTS) {
    expect(getOracleFeed(spec.feedId)).toMatchObject({
      cadence: 'fast',
      pollPeriodMs: 2000,
      marketCreationEnabled: true,
      fetchObservation: expect.any(Function),
    })
    expect(getOracleAttribution(spec.feedId)?.url).toBe(spec.url)
    expect(ORACLE_TICK_DECORATIONS[spec.feedId].prefix).toBe('$')
    expect(ALL_PERP_LAUNCH_MARKETS.some((m) => m.feedId === spec.feedId)).toBe(
      true
    )
    expect(PERP_LAUNCH_MARKETS.some((m) => m.feedId === spec.feedId)).toBe(
      false
    )
  }
})
