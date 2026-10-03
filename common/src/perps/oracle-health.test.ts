import { shouldRefreshOracleHealth, OracleFeedHealth } from './oracle-health'
import { MINUTE_MS } from '../util/time'
const now = 1_800_000_000_000
const current: OracleFeedHealth = {
  checkedAt: now,
  status: 'available',
  expiresAt: now + 5 * MINUTE_MS,
}
it('keeps a flat healthy feed at one persisted heartbeat per minute', () => {
  for (let elapsed = 2000; elapsed < MINUTE_MS; elapsed += 2000)
    expect(
      shouldRefreshOracleHealth(
        current,
        {
          ...current,
          checkedAt: now + elapsed,
          expiresAt: current.expiresAt! + elapsed,
        },
        now + elapsed
      )
    ).toBe(false)
  expect(
    shouldRefreshOracleHealth(
      current,
      { ...current, checkedAt: now + MINUTE_MS },
      now + MINUTE_MS
    )
  ).toBe(true)
})
it('applies freeze and recovery immediately but dedupes repeated freezes', () => {
  const frozen: OracleFeedHealth = {
    checkedAt: now + 2000,
    status: 'unavailable',
    reason: 'Frozen',
  }
  expect(shouldRefreshOracleHealth(current, frozen, now + 2000)).toBe(true)
  expect(
    shouldRefreshOracleHealth(
      frozen,
      { ...frozen, checkedAt: now + 4000 },
      now + 4000
    )
  ).toBe(false)
  expect(
    shouldRefreshOracleHealth(
      frozen,
      { ...current, checkedAt: now + 4000 },
      now + 4000
    )
  ).toBe(true)
  expect(shouldRefreshOracleHealth(frozen, current, now + 4000)).toBe(false)
})
it('refreshes a soon-expiring check only when its expiry advances', () => {
  const expiring = { ...current, expiresAt: now + 3000 }
  expect(
    shouldRefreshOracleHealth(
      expiring,
      { ...current, checkedAt: now + 2000 },
      now + 2000
    )
  ).toBe(true)
  expect(
    shouldRefreshOracleHealth(
      expiring,
      { ...expiring, checkedAt: now + 2000 },
      now + 2000
    )
  ).toBe(false)
})
