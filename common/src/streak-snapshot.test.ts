import {
  laWallClockMsPastMidnight,
  pacificStartOfDayMs,
} from './streak-snapshot'

const at = (iso: string) => new Date(iso)

describe('pacificStartOfDayMs', () => {
  it('lands on LA midnight', () => {
    // 2026-08-30 00:00:02 PDT — the window the widget's rollover alarm fires in.
    const justPastMidnight = at('2026-08-30T07:00:02Z')
    expect(new Date(pacificStartOfDayMs(justPastMidnight)).toISOString()).toBe(
      '2026-08-30T07:00:00.000Z'
    )
  })

  it('is idempotent — the start of a day is its own day start', () => {
    const start = pacificStartOfDayMs(at('2026-08-30T07:00:02Z'))
    expect(pacificStartOfDayMs(new Date(start))).toBe(start)
  })

  it('resolves the same boundary from anywhere inside the day', () => {
    const start = pacificStartOfDayMs(at('2026-08-30T07:00:02Z'))
    for (const iso of [
      '2026-08-30T07:00:00Z', // exactly midnight PT
      '2026-08-30T12:00:00Z', // morning PT
      '2026-08-31T06:59:59Z', // one second before the next rollover
    ])
      expect(pacificStartOfDayMs(at(iso))).toBe(start)
  })

  it('gives a 23h day at the spring-forward transition', () => {
    // 2026-03-08 is the US DST spring transition; a flat 24h subtraction would
    // land an hour off here.
    const during = at('2026-03-08T20:00:00Z')
    const start = pacificStartOfDayMs(during)
    const nextStart = pacificStartOfDayMs(new Date(start + 26 * 3600_000))
    expect((nextStart - start) / 3600_000).toBe(23)
  })

  it('gives a 25h day at the fall-back transition', () => {
    const during = at('2026-11-01T20:00:00Z')
    const start = pacificStartOfDayMs(during)
    const nextStart = pacificStartOfDayMs(new Date(start + 26 * 3600_000))
    expect((nextStart - start) / 3600_000).toBe(25)
  })

  it('the previous day start is reachable from one ms before today', () => {
    // How callers derive "the day that just ended", DST included.
    const start = pacificStartOfDayMs(at('2026-11-02T20:00:00Z'))
    const prev = pacificStartOfDayMs(new Date(start - 1))
    expect((start - prev) / 3600_000).toBe(25)
  })
})

describe('laWallClockMsPastMidnight', () => {
  it('is zero exactly at LA midnight', () => {
    expect(laWallClockMsPastMidnight(at('2026-08-30T07:00:00Z'))).toBe(0)
  })

  it('counts wall-clock ms, including sub-second', () => {
    // 07:00:02.250Z is 00:00:02.250 PDT.
    expect(laWallClockMsPastMidnight(at('2026-08-30T07:00:02.250Z'))).toBe(2250)
  })
})
