import { bdlGameDayBounds, storedGameDayEnd } from './game-day'

const bounds = (day: string, zone?: string) => {
  const b = bdlGameDayBounds(day, zone)
  return (
    b && [
      new Date(b.start).toISOString(),
      new Date(b.latestStart).toISOString(),
    ]
  )
}
it('contains both UTC+14 and UTC−12 venue days when an international venue is unknown', () => {
  expect(bounds('2026-10-24')).toEqual([
    '2026-10-23T10:00:00.000Z',
    '2026-10-25T11:59:59.999Z',
  ])
  expect(bounds('2026-10-24', 'Pacific/Kiritimati')).toEqual([
    '2026-10-23T10:00:00.000Z',
    '2026-10-24T09:59:59.999Z',
  ])
  expect(bounds('2026-10-24', 'Etc/GMT+12')).toEqual([
    '2026-10-24T12:00:00.000Z',
    '2026-10-25T11:59:59.999Z',
  ])
})
it('honors both daylight-saving transitions in a known venue timezone', () => {
  expect(bounds('2026-03-08', 'America/New_York')).toEqual([
    '2026-03-08T05:00:00.000Z',
    '2026-03-09T03:59:59.999Z',
  ])
  expect(bounds('2026-11-01', 'America/New_York')).toEqual([
    '2026-11-01T04:00:00.000Z',
    '2026-11-02T04:59:59.999Z',
  ])
})
it('rejects malformed dates, invalid venue zones and nonexistent local dates', () => {
  expect(bounds('2026-02-30')).toBeNull()
  expect(bounds('2026-11-01', 'PST8/unverified')).toBeNull()
  expect(bounds('2011-12-30', 'Pacific/Apia')).toBeNull()
})
it('honors only a plausible recorded upper bound on a date-only market', () => {
  const s = Date.parse('2026-10-23T10:00:00Z'),
    end = s + 50 * 3600000
  for (const bad of [
    null,
    'not a timestamp',
    new Date(s - 1).toISOString(),
    new Date(end + 1).toISOString(),
  ])
    expect(storedGameDayEnd(s, true, bad)).toBe(end)
  expect(storedGameDayEnd(s, true, new Date(s + 120000).toISOString())).toBe(
    s + 120000
  )
  expect(storedGameDayEnd(s, false, new Date(end).toISOString())).toBe(s)
})
