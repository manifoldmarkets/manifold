import {
  hasSaneStreakFields,
  mayPersistStreakSnapshot,
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

  it('REFUSES a bet in the day that just ended — the backend cutoff is rolling', () => {
    // reset-betting-streaks compares lastBetTime against now() - interval '1 day',
    // evaluated whenever the job runs. A bet just after yesterday's midnight is
    // still reset by a job running just after today's, so "bet yesterday" is not
    // proof of anything.
    expect(
      reflectsDailyReset(
        row({ lastBetTime: YESTERDAY_START }),
        JUST_PAST_MIDNIGHT
      )
    ).toBe(false)
    expect(
      reflectsDailyReset(
        row({ lastBetTime: YESTERDAY_START + 5000 }),
        JUST_PAST_MIDNIGHT
      )
    ).toBe(false)
    // Even a bet a millisecond before today's start proves nothing.
    expect(
      reflectsDailyReset(
        row({ lastBetTime: TODAY_START - 1 }),
        JUST_PAST_MIDNIGHT
      )
    ).toBe(false)
  })

  it('accepts a bet exactly at the start of today', () => {
    expect(
      reflectsDailyReset(row({ lastBetTime: TODAY_START }), JUST_PAST_MIDNIGHT)
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

  it('treats a non-positive streak as nothing-to-reset, but garbage as unusable', () => {
    // A negative streak is a real (if odd) number: there is no live streak, so no
    // reset was due. NaN is not — it would make every comparison below false and
    // masquerade as the pre-reset shape forever, so it is refused outright.
    expect(reflectsDailyReset(row({ streak: -1 }), JUST_PAST_MIDNIGHT)).toBe(
      true
    )
    expect(
      reflectsDailyReset(
        { streak: NaN, lastBetTime: 0, lastStreakFreezeTime: 0 },
        JUST_PAST_MIDNIGHT
      )
    ).toBe(false)
  })

  it('is unaffected by a 23h or 25h DST day, because it never spans one', () => {
    // The rule only ever compares against TODAY's start, so the shorter/longer
    // previous day cannot shift the cutoff underneath it.
    const dstDay = at('2026-11-01T20:00:00Z')
    const dayStart = pacificStartOfDayMs(dstDay)
    expect(reflectsDailyReset(row({ lastBetTime: dayStart }), dstDay)).toBe(
      true
    )
    expect(reflectsDailyReset(row({ lastBetTime: dayStart - 1 }), dstDay)).toBe(
      false
    )
  })

  it('mid-day, a live streak with a bet that day is accepted', () => {
    const midday = at('2026-08-30T20:00:00Z') // ~13:00 PDT
    const dayStart = pacificStartOfDayMs(midday)
    expect(
      reflectsDailyReset(row({ lastBetTime: dayStart + 3600_000 }), midday)
    ).toBe(true)
  })

  it('mid-day, a live streak that has not bet today and has no freeze is refused', () => {
    // The backend job may be late or may have failed. Refusing keeps the stale
    // snapshot, whose local prediction is right, and retries — rather than
    // caching a lie.
    const midday = at('2026-08-30T20:00:00Z')
    const dayStart = pacificStartOfDayMs(midday)
    expect(reflectsDailyReset(row({ lastBetTime: dayStart - 1 }), midday)).toBe(
      false
    )
  })
})

describe('hasSaneStreakFields', () => {
  it('rejects non-finite fields, which would defeat every comparison', () => {
    // NaN >= x is false, so a garbage row would masquerade as the pre-reset shape
    // forever rather than being caught.
    for (const bad of [
      { streak: NaN },
      { streak: Infinity },
      { lastBetTime: NaN },
      { lastStreakFreezeTime: NaN },
      { lastBetTime: -1 },
      { lastStreakFreezeTime: -1 },
    ])
      expect(hasSaneStreakFields(row(bad as Partial<StreakResetFacts>))).toBe(
        false
      )
  })

  it('accepts an ordinary row and a zeroed one', () => {
    expect(hasSaneStreakFields(row({}))).toBe(true)
    expect(
      hasSaneStreakFields({
        streak: 0,
        lastBetTime: 0,
        lastStreakFreezeTime: 0,
      })
    ).toBe(true)
  })

  it('rejects nothing at all', () => {
    expect(hasSaneStreakFields(null)).toBe(false)
    expect(hasSaneStreakFields(undefined)).toBe(false)
  })
})

describe('mayPersistStreakSnapshot', () => {
  it('is the single gate every writer uses: sane fields AND a proven reset', () => {
    const proven = row({ lastBetTime: TODAY_START })
    expect(mayPersistStreakSnapshot(proven, JUST_PAST_MIDNIGHT)).toBe(true)
    // sane, but the reset is unproven
    expect(
      mayPersistStreakSnapshot(
        row({ lastBetTime: YESTERDAY_START }),
        JUST_PAST_MIDNIGHT
      )
    ).toBe(false)
    // reset would be provable, but the fields are garbage
    expect(
      mayPersistStreakSnapshot(
        { streak: NaN, lastBetTime: TODAY_START, lastStreakFreezeTime: 0 },
        JUST_PAST_MIDNIGHT
      )
    ).toBe(false)
    expect(mayPersistStreakSnapshot(null, JUST_PAST_MIDNIGHT)).toBe(false)
  })
})
