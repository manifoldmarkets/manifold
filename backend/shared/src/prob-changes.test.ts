import { DAY_MS, HOUR_MS, MONTH_MS, WEEK_MS } from 'common/util/time'
import { computeProbChanges, MonthSource } from './prob-changes'

// Included in the shared CI suite. To run just these:
//   yarn --cwd backend/shared test --testPathPattern prob-changes
const now = Date.parse('2026-11-11T12:00:00Z')

const changes = (
  overrides: Partial<Parameters<typeof computeProbChanges>[0]> = {}
) =>
  computeProbChanges({
    now,
    prob: 0.7,
    poolProb: 0.7,
    resolutionTime: undefined,
    dayAgoProb: 0.65,
    weekAgoProb: 0.5,
    month: { kind: 'loaded', monthAgoProb: 0.4 },
    ...overrides,
  })

describe('computeProbChanges', () => {
  it('is the current probability minus the one at the start of each window', () => {
    const { day, week, month } = changes()
    expect(day).toBeCloseTo(0.05, 12)
    expect(week).toBeCloseTo(0.2, 12)
    expect(month).toBeCloseTo(0.3, 12)
  })

  it('uses the pool probability where there is no bet history', () => {
    expect(
      changes({
        dayAgoProb: undefined,
        weekAgoProb: undefined,
        month: { kind: 'loaded', monthAgoProb: undefined },
      })
    ).toEqual({ day: 0, week: 0, month: 0 })
  })

  it('measures a resolved market from its resolution value', () => {
    // Resolved YES an hour ago from a 70% pool that was at 40% a month back.
    const { day, month } = changes({
      prob: 1,
      poolProb: 0.7,
      resolutionTime: now - HOUR_MS,
    })
    expect(day).toBeCloseTo(0.35, 12)
    expect(month).toBeCloseTo(0.6, 12)
  })

  it('reports no change over a window that opened after the market resolved', () => {
    const resolved = { prob: 1, poolProb: 0.7 }
    expect(
      changes({ ...resolved, resolutionTime: now - DAY_MS })
    ).toMatchObject({ day: 0 })
    expect(
      changes({ ...resolved, resolutionTime: now - WEEK_MS })
    ).toMatchObject({ day: 0, week: 0 })
    expect(changes({ ...resolved, resolutionTime: now - MONTH_MS })).toEqual({
      day: 0,
      week: 0,
      month: 0,
    })
    // One millisecond inside the window still counts.
    expect(
      changes({ ...resolved, resolutionTime: now - MONTH_MS + 1 }).month
    ).toBeCloseTo(0.6, 12)
    // A kept month change is zeroed the same way.
    expect(
      changes({
        ...resolved,
        resolutionTime: now - MONTH_MS,
        month: { kind: 'kept', storedMonthChange: 0.6 },
      }).month
    ).toBe(0)
  })

  it('keeps the stored month change when the month-ago probability was not loaded', () => {
    expect(
      changes({ month: { kind: 'kept', storedMonthChange: 0.3 } }).month
    ).toBe(0.3)
    expect(
      changes({ month: { kind: 'kept', storedMonthChange: -0.12 } }).month
    ).toBe(-0.12)
    expect(
      changes({ month: { kind: 'kept', storedMonthChange: undefined } }).month
    ).toBe(0)
  })

  it('does not flip the month change on repeated frequent runs', () => {
    // Seen on prod 2026-11-04: an answer at 100% with a stored month change of
    // 0.200 read 0.800 after the next run and 0.200 after the one after that,
    // because the stored change was subtracted as if it were the old
    // probability.
    let storedMonthChange = 0.2
    for (let run = 0; run < 5; run++) {
      storedMonthChange = changes({
        prob: 1,
        poolProb: 1,
        month: { kind: 'kept', storedMonthChange },
      }).month
      expect(storedMonthChange).toBe(0.2)
    }
  })

  it('follows the month-ago probability across mixed full and frequent runs', () => {
    // A deterministic walk: each step is either a full run (which looks the
    // month-ago probability up) or a frequent run (which keeps what is
    // stored). The stored change must always equal the change as of the last
    // full run.
    let seed = 7
    const random = () => {
      seed = (seed * 16807) % 2147483647
      return seed / 2147483647
    }
    let stored = 0
    let expected = 0
    for (let step = 0; step < 500; step++) {
      const prob = random()
      const monthAgoProb = random()
      const fullRun = random() < 0.4
      const month: MonthSource = fullRun
        ? { kind: 'loaded', monthAgoProb }
        : { kind: 'kept', storedMonthChange: stored }
      if (fullRun) expected = prob - monthAgoProb
      stored = changes({ prob, poolProb: prob, month }).month
      expect(stored).toBeCloseTo(expected, 12)
      expect(Math.abs(stored)).toBeLessThanOrEqual(1)
    }
  })

  it('never returns a non-finite change', () => {
    const broken = changes({
      prob: NaN,
      poolProb: NaN,
      dayAgoProb: Infinity,
      weekAgoProb: NaN,
      month: { kind: 'kept', storedMonthChange: NaN },
    })
    expect(broken).toEqual({ day: 0, week: 0, month: 0 })
    expect(
      changes({ month: { kind: 'loaded', monthAgoProb: NaN } }).month
    ).toBe(0)
    // A broken historical value alone falls back to the pool probability.
    expect(changes({ dayAgoProb: NaN }).day).toBe(0)
  })
})
