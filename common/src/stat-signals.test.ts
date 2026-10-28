import { getStatSignal, weeklyMeans, WeekMean } from './stat-signals'
import { addDays } from './stats-window'

// Daily points from `from`, one per value.
const days = (from: string, ys: number[]) =>
  ys.map((y, i) => ({ x: addDays(from, i), y }))

// Weeks newest first from weekly means listed oldest first.
const weeksOf = (means: number[]): WeekMean[] =>
  means
    .map((mean, i) => ({
      start: addDays('2026-01-01', i * 7),
      end: addDays('2026-01-01', i * 7 + 6),
      mean,
    }))
    .reverse()

describe('weeklyMeans', () => {
  it('averages whole weeks back from the last day, newest first', () => {
    const ys = [...Array(7).fill(1), ...Array(7).fill(3)]
    const weeks = weeklyMeans(days('2026-10-01', ys), '2026-10-14')
    expect(weeks).toEqual([
      { start: '2026-10-08', end: '2026-10-14', mean: 3 },
      { start: '2026-10-01', end: '2026-10-07', mean: 1 },
    ])
  })

  it('stops at a week missing a day', () => {
    const points = days('2026-10-01', Array(21).fill(2)).filter(
      (p) => p.x !== '2026-10-03'
    )
    // The oldest week (Oct 1-7) is missing a day, so only 2 weeks count.
    expect(weeklyMeans(points, '2026-10-21')).toHaveLength(2)
  })

  it('leaves out a partial week at the start', () => {
    expect(
      weeklyMeans(days('2026-10-01', Array(10).fill(1)), '2026-10-10')
    ).toHaveLength(1)
  })
})

// weeksOf's data starts 2026-01-01.
const START = '2026-01-01'
const signalOf = (means: number[], dataStart = START) =>
  getStatSignal(weeksOf(means), dataStart)

describe('getStatSignal', () => {
  it('flags the lowest week since the last one as low', () => {
    // 2 low weeks, then 27 at 10, then 0.8: lowest since the second low week.
    expect(signalOf([1, 0.5, ...Array(27).fill(10), 0.8])).toEqual({
      kind: 'low',
      weeksBeaten: 27,
      since: '2026-01-14',
      basis: 'week',
    })
  })

  it('says when an extreme reaches back to the start of the data', () => {
    expect(signalOf([...Array(27).fill(5), 9])).toEqual({
      kind: 'high',
      weeksBeaten: 27,
      since: START,
      basis: 'start',
    })
  })

  it('does not call the earliest whole week the start of the data', () => {
    // The data begins 10 days before the first whole week (a gap or a partial
    // week), so this is only the highest back to that week.
    expect(signalOf([...Array(27).fill(5), 9], '2025-12-22')).toMatchObject({
      kind: 'high',
      since: START,
      basis: 'earliest',
    })
  })

  it('does not call a short run an extreme', () => {
    // A clear high, but it beats only 9 weeks: not half a year.
    expect(signalOf([20, ...Array(9).fill(10), 14])?.kind).not.toBe('high')
    // Beats only 3 weeks, and the move is ordinary: no signal.
    expect(signalOf([10, 12, 8, 11, 9, 10, 9.5, 10.5])).toBe(undefined)
  })

  it('does not call a barely-new extreme on a wobbly stat news', () => {
    // Weeks wobble between 10 and 11; 9.9 is a 30-week low by a hair.
    const means = [...Array(30)].map((_, i) => (i % 2 ? 11 : 10))
    expect(signalOf([...means, 9.9])).toBe(undefined)
  })

  it('treats float noise as equal', () => {
    // Seven 0.73s average to 0.7299999999999999; six to 0.73.
    const means = Array(27).fill(
      [0.73, 0.73, 0.73, 0.73, 0.73, 0.73, 0.73].reduce((a, b) => a + b) / 7
    )
    expect(signalOf([...means, 0.73])).toBe(undefined)
  })

  it('needs enough history to know what is usual', () => {
    expect(signalOf([10, 10, 10, 1])).toBe(undefined)
  })

  it('flags a move several times the usual weekly move', () => {
    // Weeks wobble by about 1; this week drops by 6, without a new low.
    const means = [10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 4, 11, 5]
    expect(signalOf(means)).toMatchObject({ kind: 'drop', baselineWeeks: 12 })
  })

  it('says how many weeks set the usual move', () => {
    // Only 6 earlier moves to go on.
    expect(signalOf([10, 11, 10, 11, 10, 11, 10, 20])).toMatchObject({
      kind: 'jump',
      baselineWeeks: 6,
    })
  })

  it('flags a run of weekly rises', () => {
    const means = [10, 12, 9, 11, 10, 12, 9, 11, 10, 10.5, 10.6, 10.7, 10.8]
    expect(signalOf(means)).toEqual({ kind: 'rising', weeks: 4 })
  })

  it('needs two weeks', () => {
    expect(signalOf([5])).toBe(undefined)
  })
})
