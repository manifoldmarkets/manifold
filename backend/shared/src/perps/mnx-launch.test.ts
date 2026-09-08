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
  expect(
    MNX_LAUNCH_MARKETS.every((m) => m.recommended.maxLeverage === 10)
  ).toBe(true)
})
