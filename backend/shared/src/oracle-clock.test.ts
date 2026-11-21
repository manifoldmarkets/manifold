import { databaseOracleClock } from './oracle-clock'
import type { SupabaseDirectClient } from './supabase/init'

const pgWith = (one: () => Promise<unknown>) =>
  ({ one } as unknown as SupabaseDirectClient)

describe('database oracle clock', () => {
  it('reads whole milliseconds from the database clock', async () => {
    const one = jest.fn(async () => ({ ms: 1_800_000_000_123 }))
    await expect(databaseOracleClock(pgWith(one))()).resolves.toBe(
      1_800_000_000_123
    )
    expect(one).toHaveBeenCalledWith(
      expect.stringContaining('clock_timestamp()')
    )
  })

  it.each([1.5, 0, NaN])('refuses the reading %s', async (ms) => {
    await expect(
      databaseOracleClock(pgWith(async () => ({ ms })))()
    ).rejects.toThrow(/Invalid database clock/)
  })

  it('fails a read that hangs instead of holding the poll', async () => {
    jest.useFakeTimers()
    try {
      const reading = databaseOracleClock(pgWith(() => new Promise(() => {})))()
      jest.advanceTimersByTime(1_000)
      await expect(reading).rejects.toThrow(/took over 1000ms/)
    } finally {
      jest.useRealTimers()
    }
  })
})
