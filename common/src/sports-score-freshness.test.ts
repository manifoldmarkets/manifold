import { scoreAgeLabel, scoreUpdatedTime } from './sports-score-freshness'

const now = Date.parse('2026-10-22T12:00:00Z')
it('ages the provider observation even when polling repeatedly succeeds', () => {
  const source = '2026-10-22T11:55:00Z'
  expect(scoreUpdatedTime(source, now)).toBe(now - 300_000)
  expect(scoreUpdatedTime(source, now + 300_000)).toBe(now - 300_000)
  expect(scoreAgeLabel(scoreUpdatedTime(source, now), now)).toBe(
    'Score as of 5m ago'
  )
  expect(
    scoreAgeLabel(scoreUpdatedTime(source, now + 300_000), now + 300_000)
  ).toBe('Score as of 10m ago')
})
it('does not invent a fresh timestamp for absent, invalid or future observations', () => {
  for (const time of [null, '', 'bad', '2027-01-01T00:00:00Z'])
    expect(scoreUpdatedTime(time, now)).toBeNull()
  for (const time of [undefined, null, NaN, Infinity, 0, now + 120_000])
    expect(scoreAgeLabel(time, now)).toBe('Score update time unavailable')
  expect(scoreAgeLabel(now + 5_000, now)).toBe('Score as of <1m ago')
  expect(scoreAgeLabel(now - 3_660_000, now)).toBe('Score as of 1h 1m ago')
})
