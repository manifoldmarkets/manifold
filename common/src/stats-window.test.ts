import {
  addDays,
  getCompareOffset,
  getComparePoints,
  getStatsWindow,
  countDays,
  hasComparableCoverage,
  shiftWindow,
  sliceWindow,
  summarizePoints,
  toDayNumber,
} from './stats-window'

const series = (from: string, ys: number[]) =>
  ys.map((y, i) => ({ x: addDays(from, i), y }))

describe('day arithmetic', () => {
  it('adds days across month, year and DST boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02') // US DST ends
    expect(addDays('2026-03-08', -1)).toBe('2026-03-07') // US DST starts
    expect(addDays('2027-01-01', -1)).toBe('2026-12-31')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })

  it('rejects malformed days', () => {
    expect(toDayNumber('2026-10-1')).toBeNaN()
    expect(toDayNumber('Oct 1')).toBeNaN()
  })
})

describe('windows', () => {
  it('ends the range on the last day, inclusive', () => {
    expect(getStatsWindow('2026-10-25', '7d')).toEqual({
      from: '2026-10-19',
      to: '2026-10-25',
      days: 7,
    })
    expect(getStatsWindow('2026-10-25', 'all')).toEqual({
      from: undefined,
      to: '2026-10-25',
      days: undefined,
    })
  })

  it('compares with the previous period or 52 weeks back', () => {
    const w = getStatsWindow('2026-10-25', '30d')
    expect(getCompareOffset(w, 'previous')).toBe(30)
    expect(getCompareOffset(w, 'year')).toBe(364)
    expect(getCompareOffset(w, 'none')).toBeUndefined()
    expect(
      getCompareOffset(getStatsWindow('2026-10-25', 'all'), 'year')
    ).toBeUndefined()
    // 52 weeks keeps the weekday: 2026-10-25 and 2025-10-26 are Sundays.
    expect(shiftWindow(w, 364).to).toBe('2025-10-26')
  })

  it('slices a window and moves comparison points onto it', () => {
    const points = series('2026-10-01', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    const w = getStatsWindow('2026-10-10', '7d')
    expect(sliceWindow(points, w).map((p) => p.y)).toEqual([
      4, 5, 6, 7, 8, 9, 10,
    ])
    // The previous 7 days are 09-27..10-03, which hold 10-01..10-03.
    expect(getComparePoints(points, w, 7)).toEqual([
      { x: '2026-10-08', y: 1, sourceX: '2026-10-01' },
      { x: '2026-10-09', y: 2, sourceX: '2026-10-02' },
      { x: '2026-10-10', y: 3, sourceX: '2026-10-03' },
    ])
  })
})

describe('summaries', () => {
  it('totals or averages finite values only', () => {
    const pts = [{ y: 2 }, { y: NaN }, { y: 4 }]
    expect(summarizePoints(pts, 'sum')).toBe(6)
    expect(summarizePoints(pts, 'mean')).toBe(3)
    expect(summarizePoints([], 'mean')).toBeUndefined()
  })

  it('needs 80% of the calendar days in both windows to compare', () => {
    expect(hasComparableCoverage(30, 24, 30)).toBe(true)
    expect(hasComparableCoverage(30, 23, 30)).toBe(false)
    // A nearly empty current window doesn't compare against a full one.
    expect(hasComparableCoverage(1, 7, 7)).toBe(false)
    expect(hasComparableCoverage(6, 6, 7)).toBe(true)
    expect(hasComparableCoverage(0, 0, 0)).toBe(false)
  })

  it('counts calendar days inclusively', () => {
    expect(countDays('2026-10-01', '2026-10-07')).toBe(7)
    expect(countDays('2026-10-07', '2026-10-07')).toBe(1)
    expect(countDays('2026-10-08', '2026-10-07')).toBe(0)
  })
})
