import {
  getStreakDayEnd,
  getStreakDayStart,
  getStreakDayToJudge,
  isStreakEligibleBetAmount,
} from './streak'
import { HOUR_MS } from './util/time'
import { removeUndefinedProps } from './util/object'

const ms = (iso: string) => new Date(iso).getTime()
const iso = (t: number) => new Date(t).toISOString()

// 2026 US daylight saving: PDT runs Mar 8 – Nov 1. Pacific midnight is
// 08:00Z under PST and 07:00Z under PDT.
describe('getStreakDayStart', () => {
  it('returns Pacific midnight, not UTC midnight', () => {
    expect(iso(getStreakDayStart(ms('2026-07-25T07:00:09Z')))).toBe(
      '2026-07-25T07:00:00.000Z'
    )
  })

  it('keeps late-evening Pacific times on the same day', () => {
    // 23:59 PDT on Jul 25 is already Jul 26 in UTC.
    expect(iso(getStreakDayStart(ms('2026-07-26T06:59:00Z')))).toBe(
      '2026-07-25T07:00:00.000Z'
    )
  })

  it('is exact on the midnight boundary itself', () => {
    const midnight = ms('2026-07-25T07:00:00Z')
    expect(getStreakDayStart(midnight)).toBe(midnight)
    expect(getStreakDayStart(midnight - 1)).toBe(ms('2026-07-24T07:00:00Z'))
  })

  it('uses PST midnight on the spring-forward day', () => {
    // Mar 8 2026 begins at 00:00 PST (08:00Z); the clocks jump at 2 AM.
    expect(iso(getStreakDayStart(ms('2026-03-08T20:00:00Z')))).toBe(
      '2026-03-08T08:00:00.000Z'
    )
    // An instant before the jump resolves to the same day.
    expect(iso(getStreakDayStart(ms('2026-03-08T09:00:00Z')))).toBe(
      '2026-03-08T08:00:00.000Z'
    )
  })

  it('resolves both passes of the repeated hour on the fall-back day', () => {
    // 01:30 PDT and 01:30 PST are distinct instants on the same Pacific day.
    expect(iso(getStreakDayStart(ms('2026-11-01T08:30:00Z')))).toBe(
      '2026-11-01T07:00:00.000Z'
    )
    expect(iso(getStreakDayStart(ms('2026-11-01T09:30:00Z')))).toBe(
      '2026-11-01T07:00:00.000Z'
    )
  })
})

describe('getStreakDayEnd', () => {
  it('gives a 24 hour day normally', () => {
    const at = ms('2026-07-25T18:00:00Z')
    expect(getStreakDayEnd(at) - getStreakDayStart(at)).toBe(24 * HOUR_MS)
  })

  it('gives a 23 hour day when the clocks spring forward', () => {
    const at = ms('2026-03-08T20:00:00Z')
    expect(iso(getStreakDayEnd(at))).toBe('2026-03-09T07:00:00.000Z')
    expect(getStreakDayEnd(at) - getStreakDayStart(at)).toBe(23 * HOUR_MS)
  })

  it('gives a 25 hour day when the clocks fall back', () => {
    const at = ms('2026-11-01T20:00:00Z')
    expect(iso(getStreakDayEnd(at))).toBe('2026-11-02T08:00:00.000Z')
    expect(getStreakDayEnd(at) - getStreakDayStart(at)).toBe(25 * HOUR_MS)
  })
})

describe('getStreakDayToJudge', () => {
  it('judges the day that just closed', () => {
    const { start, end } = getStreakDayToJudge(ms('2026-07-26T07:01:03Z'))
    expect(iso(start)).toBe('2026-07-25T07:00:00.000Z')
    expect(iso(end)).toBe('2026-07-26T07:00:00.000Z')
  })

  it('reaches the same verdict however late the job runs', () => {
    const punctual = getStreakDayToJudge(ms('2026-07-26T07:00:00Z'))
    const late = getStreakDayToJudge(ms('2026-07-26T11:45:00Z'))
    expect(late).toEqual(punctual)
  })

  it('spans the short day correctly the morning after springing forward', () => {
    const { start, end } = getStreakDayToJudge(ms('2026-03-09T07:00:30Z'))
    expect(iso(start)).toBe('2026-03-08T08:00:00.000Z')
    expect(iso(end)).toBe('2026-03-09T07:00:00.000Z')
    expect(end - start).toBe(23 * HOUR_MS)
  })

  it('spans the long day correctly the morning after falling back', () => {
    const { start, end } = getStreakDayToJudge(ms('2026-11-02T08:00:30Z'))
    expect(iso(start)).toBe('2026-11-01T07:00:00.000Z')
    expect(iso(end)).toBe('2026-11-02T08:00:00.000Z')
    expect(end - start).toBe(25 * HOUR_MS)
  })

  // Regression: user Eliza placed her only bet of Jul 25 2026 at 00:00:09 PT
  // and the reset job ran at 00:01:03 PT the next night. The old rolling
  // `now() - interval '1 day'` cutoff landed 54s after her bet and took a
  // streak freeze for a day she had not missed.
  it('covers a bet placed seconds after midnight', () => {
    const bet = ms('2026-07-25T07:00:09Z')
    const jobRun = ms('2026-07-26T07:01:03Z')

    const { start, end } = getStreakDayToJudge(jobRun)
    expect(bet).toBeGreaterThanOrEqual(start)
    expect(bet).toBeLessThan(end)
  })
})

describe('isStreakEligibleBetAmount', () => {
  it('counts executed bets and sells, not unfilled limit orders', () => {
    expect(isStreakEligibleBetAmount(25)).toBe(true)
    expect(isStreakEligibleBetAmount(-40)).toBe(true) // sell
    expect(isStreakEligibleBetAmount(0)).toBe(false) // unfilled limit order
  })

  // The marker was once written as `amount !== 0 ? true : undefined`, which
  // removeUndefinedProps stripped from the row. The reset job falls back to
  // `amount` when the marker is missing, and a passive fill rewrites
  // `amount` — so an order the user never executed became a day of activity.
  // This guards the rule itself; pinning the place-bet call sites needs the
  // backend test harness the repo doesn't have yet.
  it('always stores a boolean, so the marker survives removeUndefinedProps', () => {
    for (const amount of [25, -40, 0]) {
      const stored = removeUndefinedProps({
        amount,
        streakEligible: isStreakEligibleBetAmount(amount),
      })
      expect(stored).toHaveProperty('streakEligible')
      expect(typeof stored.streakEligible).toBe('boolean')
    }
  })
})
