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

  it('stops at a week with fewer than 6 days of data', () => {
    const points = days('2026-10-01', Array(21).fill(2)).filter(
      (p) => p.x !== '2026-10-03' && p.x !== '2026-10-05'
    )
    // The oldest week (Oct 1-7) is missing 2 days, so only 2 weeks count.
    expect(weeklyMeans(points, '2026-10-21')).toHaveLength(2)
  })

  it('leaves out a partial week at the start', () => {
    expect(
      weeklyMeans(days('2026-10-01', Array(10).fill(1)), '2026-10-10')
    ).toHaveLength(1)
  })
})

describe('getStatSignal', () => {
  it('flags the lowest week since the last one as low', () => {
    // 2 low weeks, then 27 at 10, then 0.8: lowest since the second low week.
    const signal = getStatSignal(weeksOf([1, 0.5, ...Array(27).fill(10), 0.8]))
    expect(signal).toMatchObject({ kind: 'low', weeks: 27, sinceStart: false })
    expect(signal && 'since' in signal && signal.since).toBe('2026-01-14')
  })

  it('says when an extreme reaches back to the start of the data', () => {
    const signal = getStatSignal(weeksOf([...Array(27).fill(5), 9]))
    expect(signal).toMatchObject({ kind: 'high', weeks: 27, sinceStart: true })
    expect(signal && 'since' in signal && signal.since).toBe('2026-01-01')
  })

  it('does not call a short run an extreme', () => {
    // A clear high, but it beats only 9 weeks: not half a year.
    expect(
      getStatSignal(weeksOf([20, ...Array(9).fill(10), 14]))?.kind
    ).not.toBe('high')
    // Beats only 3 weeks, and the move is ordinary: no signal.
    expect(getStatSignal(weeksOf([10, 12, 8, 11, 9, 10, 9.5, 10.5]))).toBe(
      undefined
    )
  })

  it('does not call a barely-new extreme on a wobbly stat news', () => {
    // Weeks wobble between 10 and 11; 9.9 is a 30-week low by a hair.
    const means = [...Array(30)].map((_, i) => (i % 2 ? 11 : 10))
    expect(getStatSignal(weeksOf([...means, 9.9]))).toBe(undefined)
  })

  it('needs enough history to know what is usual', () => {
    expect(getStatSignal(weeksOf([10, 10, 10, 1]))).toBe(undefined)
  })

  it('flags a move several times the usual weekly move', () => {
    // Weeks wobble by about 1; this week drops by 6, without a new low.
    const means = [10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 10, 11, 4, 11, 5]
    expect(getStatSignal(weeksOf(means))).toMatchObject({ kind: 'drop' })
  })

  it('flags a run of weekly rises', () => {
    const means = [10, 12, 9, 11, 10, 12, 9, 11, 10, 10.5, 10.6, 10.7, 10.8]
    expect(getStatSignal(weeksOf(means))).toEqual({ kind: 'rising', weeks: 4 })
  })

  it('needs two weeks', () => {
    expect(getStatSignal(weeksOf([5]))).toBe(undefined)
  })
})
