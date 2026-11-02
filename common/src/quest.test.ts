import { getNextQuestWeekStart, getQuestWeekStart } from './quest'
import { laWallClockMsPastMidnight } from './streak-snapshot'
import { DAY_MS, HOUR_MS } from './util/time'

const weekStartIso = (iso: string) =>
  new Date(getQuestWeekStart(new Date(iso))).toISOString()

const laWeekday = (ms: number) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    weekday: 'short',
  }).format(new Date(ms))

describe('getQuestWeekStart', () => {
  it('returns Monday midnight Pacific for every day of an ordinary week', () => {
    for (const iso of [
      '2026-11-02T08:00:00Z', // Mon 00:00 PST, the boundary itself
      '2026-11-04T20:00:00Z', // Wed
      '2026-11-08T12:00:00Z', // Sun morning
      '2026-11-09T07:59:59Z', // Sun 23:59:59 PST
    ])
      expect(weekStartIso(iso)).toBe('2026-11-02T08:00:00.000Z')
  })

  it('keeps Sunday in the week that started the Monday before', () => {
    // Sun 2026-10-25 05:53 PDT
    expect(weekStartIso('2026-10-25T12:53:22Z')).toBe(
      '2026-10-19T07:00:00.000Z'
    )
  })

  it('handles the week DST ends (Sun 2026-11-01)', () => {
    // Sun 08:11 PST, after the 2am fall-back: still the PDT week
    expect(weekStartIso('2026-11-01T16:11:01Z')).toBe(
      '2026-10-26T07:00:00.000Z'
    )
    // Sun 23:09 PST, the hour the old dayjs math moved into the next week
    expect(weekStartIso('2026-11-02T07:09:46Z')).toBe(
      '2026-10-26T07:00:00.000Z'
    )
    // Mon 05:13 PST: the new week starts at 08:00Z, not 07:00Z
    expect(weekStartIso('2026-11-02T13:13:40Z')).toBe(
      '2026-11-02T08:00:00.000Z'
    )
    expect(weekStartIso('2026-11-02T07:59:59.999Z')).toBe(
      '2026-10-26T07:00:00.000Z'
    )
  })

  it('handles the week DST starts (Sun 2027-03-14)', () => {
    // Sun 05:00 PDT, after the 2am spring-forward: still the PST week
    expect(weekStartIso('2027-03-14T12:00:00Z')).toBe(
      '2027-03-08T08:00:00.000Z'
    )
    // Mon 00:00 PDT is 07:00Z
    expect(weekStartIso('2027-03-15T07:00:00Z')).toBe(
      '2027-03-15T07:00:00.000Z'
    )
    expect(weekStartIso('2027-03-15T06:59:59.999Z')).toBe(
      '2027-03-08T08:00:00.000Z'
    )
  })

  it('ends the week at the next Monday midnight, across DST', () => {
    const next = (iso: string) =>
      new Date(getNextQuestWeekStart(Date.parse(iso))).toISOString()
    expect(next('2026-10-19T07:00:00Z')).toBe('2026-10-26T07:00:00.000Z')
    // DST ends inside this week: it runs 7 days + 1 hour
    expect(next('2026-10-26T07:00:00Z')).toBe('2026-11-02T08:00:00.000Z')
    // DST starts inside this week: it runs 7 days - 1 hour
    expect(next('2027-03-08T08:00:00Z')).toBe('2027-03-15T07:00:00.000Z')
  })

  it('is always a Monday midnight at or before now, under a week (+1h) back', () => {
    const ranges: [string, string][] = [
      ['2026-10-19T00:00:00Z', '2026-11-16T00:00:00Z'],
      ['2027-03-01T00:00:00Z', '2027-03-29T00:00:00Z'],
    ]
    for (const [from, to] of ranges) {
      for (let t = Date.parse(from); t < Date.parse(to); t += HOUR_MS / 2) {
        const start = getQuestWeekStart(new Date(t))
        expect(laWeekday(start)).toBe('Mon')
        expect(laWallClockMsPastMidnight(new Date(start))).toBe(0)
        expect(start).toBeLessThanOrEqual(t)
        // The DST-end week is 7 days + 1 hour long.
        expect(t - start).toBeLessThan(7 * DAY_MS + HOUR_MS)
        expect(getNextQuestWeekStart(start)).toBeGreaterThan(t)
      }
    }
  })
})
