import { DAY_MS, HOUR_MS, MINUTE_MS } from 'common/util/time'
import { log } from 'shared/monitoring/log'
import { msUntilNextUtcHour, scheduleDailyAtUtcHour } from './daily-schedule'

jest.mock('shared/monitoring/log', () => ({ log: { error: jest.fn() } }))

const at = (hour: number, minute = 0, ms = 0) =>
  Date.UTC(2026, 8, 11, hour, minute, 0, ms)

describe('msUntilNextUtcHour', () => {
  it('counts forward to later the same day', () => {
    expect(msUntilNextUtcHour(8, at(7))).toBe(HOUR_MS)
    expect(msUntilNextUtcHour(8, at(7, 59, 999))).toBe(MINUTE_MS - 999)
  })

  it('treats an exact hit as the next day', () => {
    expect(msUntilNextUtcHour(8, at(8))).toBe(DAY_MS)
  })

  it('rolls over to tomorrow once the hour has passed', () => {
    expect(msUntilNextUtcHour(8, at(8, 0, 1))).toBe(DAY_MS - 1)
    expect(msUntilNextUtcHour(8, at(23))).toBe(9 * HOUR_MS)
  })

  it('handles midnight UTC', () => {
    expect(msUntilNextUtcHour(0, at(23, 30))).toBe(30 * MINUTE_MS)
    expect(msUntilNextUtcHour(0, at(0))).toBe(DAY_MS)
  })
})

describe('scheduleDailyAtUtcHour', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(at(7, 30))
    jest.mocked(log.error).mockClear()
  })
  afterEach(() => {
    jest.useRealTimers()
  })

  it('runs once at the target hour each day', () => {
    const fn = jest.fn(async () => {})
    scheduleDailyAtUtcHour(8, 'test job', fn)

    jest.advanceTimersByTime(30 * MINUTE_MS - 1)
    expect(fn).not.toHaveBeenCalled()
    jest.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(1)

    jest.advanceTimersByTime(DAY_MS - 1)
    expect(fn).toHaveBeenCalledTimes(1)
    jest.advanceTimersByTime(1)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('keeps the schedule after a failed run and logs the failure', async () => {
    const fn = jest.fn(async () => {
      throw new Error('db down')
    })
    scheduleDailyAtUtcHour(8, 'test job', fn)

    jest.advanceTimersByTime(30 * MINUTE_MS)
    // Let the rejected promise's catch handler run.
    await Promise.resolve()
    await Promise.resolve()
    expect(log.error).toHaveBeenCalledWith('test job failed', {
      error: 'db down',
    })

    jest.advanceTimersByTime(DAY_MS)
    expect(fn).toHaveBeenCalledTimes(2)
  })
})
