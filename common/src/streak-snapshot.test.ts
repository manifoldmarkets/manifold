import {
  pacificStartOfDayMs,
  reflectsDailyReset,
  type StreakResetFacts,
} from './streak-snapshot'

// A moment inside a known Pacific day, and the two day boundaries around it.
const at = (iso: string) => new Date(iso)
// 2026-08-30 00:00:02 PDT — two seconds past a rollover, the window the widget's
// alarm fires in and the one the backend job races.
const JUST_PAST_MIDNIGHT = at('2026-08-30T07:00:02Z')
const TODAY_START = pacificStartOfDayMs(JUST_PAST_MIDNIGHT)
const YESTERDAY_START = pacificStartOfDayMs(new Date(TODAY_START - 1))

const row = (o: Partial<StreakResetFacts>): StreakResetFacts => ({
  streak: 5,
  lastBetTime: 0,
  lastStreakFreezeTime: 0,
  ...o,
})

describe('pacificStartOfDayMs', () => {
  it('lands on LA midnight', () => {
    expect(new Date(TODAY_START).toISOString()).toBe('2026-08-30T07:00:00.000Z')
  })

  it('is idempotent — the start of a day is its own day start', () => {
    expect(pacificStartOfDayMs(new Date(TODAY_START))).toBe(TODAY_START)
  })

  it('gives a 23h day at the spring-forward transition', () => {
    // 2026-03-08 is the US DST spring transition.
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
})

describe('reflectsDailyReset', () => {
  it('REFUSES the pre-reset shape: live streak, missed the day that ended, no freeze', () => {
    // This is the exact row the API returns in the seconds before the backend's
    // midnight job runs. Persisting it is what poisons the cache for a whole day.
    const preReset = row({
      streak: 5,
      lastBetTime: YESTERDAY_START - 1, // last bet before the day that just ended
      lastStreakFreezeTime: 0,
    })
    expect(reflectsDailyReset(preReset, JUST_PAST_MIDNIGHT)).toBe(false)
  })

  it('accepts once a freeze has been consumed today', () => {
    expect(
      reflectsDailyReset(
        row({
          lastBetTime: YESTERDAY_START - 1,
          lastStreakFreezeTime: TODAY_START,
        }),
        JUST_PAST_MIDNIGHT
      )
    ).toBe(true)
  })

  it('accepts once the streak has been zeroed', () => {
    expect(
      reflectsDailyReset(
        row({ streak: 0, lastBetTime: YESTERDAY_START - 1 }),
        JUST_PAST_MIDNIGHT
      )
    ).toBe(true)
  })

  it('accepts when they bet during the day that just ended — no reset was due', () => {
    expect(
      reflectsDailyReset(
        row({ lastBetTime: YESTERDAY_START }),
        JUST_PAST_MIDNIGHT
      )
    ).toBe(true)
    expect(
      reflectsDailyReset(
        row({ lastBetTime: TODAY_START - 1 }),
        JUST_PAST_MIDNIGHT
      )
    ).toBe(true)
  })

  it('accepts when they have already bet today', () => {
    expect(
      reflectsDailyReset(
        row({ lastBetTime: TODAY_START + 1 }),
        JUST_PAST_MIDNIGHT
      )
    ).toBe(true)
  })

  it('treats a freeze from YESTERDAY as no evidence', () => {
    // A freeze consumed at the previous rollover says nothing about this one.
    expect(
      reflectsDailyReset(
        row({
          lastBetTime: YESTERDAY_START - 1,
          lastStreakFreezeTime: YESTERDAY_START,
        }),
        JUST_PAST_MIDNIGHT
      )
    ).toBe(false)
  })

  it('rejects a missing row rather than accepting it', () => {
    expect(reflectsDailyReset(null, JUST_PAST_MIDNIGHT)).toBe(false)
    expect(reflectsDailyReset(undefined, JUST_PAST_MIDNIGHT)).toBe(false)
  })

  it('handles a negative or absent streak as nothing-to-reset', () => {
    expect(reflectsDailyReset(row({ streak: -1 }), JUST_PAST_MIDNIGHT)).toBe(
      true
    )
    expect(
      reflectsDailyReset(
        { streak: NaN, lastBetTime: 0, lastStreakFreezeTime: 0 },
        JUST_PAST_MIDNIGHT
      )
    ).toBe(true)
  })

  it('mid-day, a live streak with a bet that day is accepted', () => {
    const midday = at('2026-08-30T20:00:00Z') // ~13:00 PDT
    const dayStart = pacificStartOfDayMs(midday)
    expect(
      reflectsDailyReset(row({ lastBetTime: dayStart + 3600_000 }), midday)
    ).toBe(true)
  })

  it('mid-day, a live streak that missed yesterday and has no freeze is still refused', () => {
    // The backend job is late or failed. Refusing keeps the stale snapshot, whose
    // local prediction is right, and retries — rather than caching a lie.
    const midday = at('2026-08-30T20:00:00Z')
    const dayStart = pacificStartOfDayMs(midday)
    const prevStart = pacificStartOfDayMs(new Date(dayStart - 1))
    expect(
      reflectsDailyReset(row({ lastBetTime: prevStart - 1 }), midday)
    ).toBe(false)
  })
})
