import {
  FAST_TICK_ORACLE_BOUNDS,
  isOracleTickTimeout,
  oracleTickTimeoutsQuery,
} from './oracle-tick-bounds'

describe('FAST_TICK_ORACLE_BOUNDS', () => {
  it('allows exactly one attempt', () => {
    // Guards a specific regression: with the engine's default of 8 attempts,
    // the retry wrapper's exponential backoff can spend ~17s before giving up
    // — an order of magnitude past the deadline these bounds enforce, with
    // every tick behind it skipped by the in-flight guard.
    expect(FAST_TICK_ORACLE_BOUNDS.maxAttempts).toBe(1)
  })

  it('waits for the lock for less than one tick interval', () => {
    // The whole point is to hand the slot to the next tick, which carries a
    // fresher price. A lock wait at or beyond the tick cannot do that.
    const ORACLE_TICK_PERIOD_MS = 2_000
    expect(FAST_TICK_ORACLE_BOUNDS.lockTimeoutMs).toBeLessThan(
      ORACLE_TICK_PERIOD_MS
    )
  })

  it('bounds a statement above the lock wait', () => {
    // Waiting on a lock is pure loss; executing liquidation and ADL work is
    // not. The statement backstop must not fire before the lock timeout has.
    expect(FAST_TICK_ORACLE_BOUNDS.statementTimeoutMs).toBeGreaterThan(
      FAST_TICK_ORACLE_BOUNDS.lockTimeoutMs
    )
  })
})

describe('isOracleTickTimeout', () => {
  it('recognises the codes a bounded single-attempt tick induces', () => {
    expect(isOracleTickTimeout({ code: '55P03' })).toBe(true) // lock_timeout
    expect(isOracleTickTimeout({ code: '57014' })).toBe(true) // statement_timeout
    // Serialization failure means the same thing here as the other two —
    // someone else is writing. The pg error handler already documents it as
    // ordinary contention; with one attempt it surfaces rather than being
    // retried away, and it must not then be reported twice as an error.
    expect(isOracleTickTimeout({ code: '40001' })).toBe(true)
  })

  it('does not classify unrelated database failures as expected', () => {
    expect(isOracleTickTimeout({ code: '40P01' })).toBe(false) // deadlock
    expect(isOracleTickTimeout({ code: '23505' })).toBe(false) // unique violation
    expect(isOracleTickTimeout({ code: '42P01' })).toBe(false) // undefined table
  })

  it('is defensive about non-error shapes', () => {
    expect(isOracleTickTimeout(null)).toBe(false)
    expect(isOracleTickTimeout(undefined)).toBe(false)
    expect(isOracleTickTimeout('55P03')).toBe(false)
    expect(isOracleTickTimeout({})).toBe(false)
    expect(isOracleTickTimeout(new Error('lock timeout'))).toBe(false)
  })
})

describe('oracleTickTimeoutsQuery', () => {
  it('emits both SET LOCAL statements', () => {
    expect(oracleTickTimeoutsQuery(1_000, 4_000)).toBe(
      'set local lock_timeout = 1000; set local statement_timeout = 4000'
    )
  })

  it('emits only digits, since SET LOCAL cannot be parameterised', () => {
    // The values are interpolated into SQL, so anything that is not an
    // integer must not survive to the statement.
    const sql = oracleTickTimeoutsQuery(1_000.9, 4_000.9)
    expect(sql).toBe(
      'set local lock_timeout = 1000; set local statement_timeout = 4000'
    )
    expect(sql).toMatch(
      /^set local lock_timeout = \d+; set local statement_timeout = \d+$/
    )
  })

  it('refuses durations that would disable the bound', () => {
    // `SET LOCAL lock_timeout = 0` means "wait forever" in Postgres — the
    // exact behaviour these bounds exist to prevent — so zero and negatives
    // must fail loudly rather than silently restore an unbounded wait.
    expect(() => oracleTickTimeoutsQuery(0, 4_000)).toThrow()
    expect(() => oracleTickTimeoutsQuery(1_000, 0)).toThrow()
    expect(() => oracleTickTimeoutsQuery(-1, 4_000)).toThrow()
    expect(() => oracleTickTimeoutsQuery(Number.NaN, 4_000)).toThrow()
    expect(() => oracleTickTimeoutsQuery(1_000, Number.NaN)).toThrow()
    expect(() => oracleTickTimeoutsQuery(0.4, 4_000)).toThrow()
  })

  it('produces a usable statement from the fast-tick bounds', () => {
    expect(
      oracleTickTimeoutsQuery(
        FAST_TICK_ORACLE_BOUNDS.lockTimeoutMs,
        FAST_TICK_ORACLE_BOUNDS.statementTimeoutMs
      )
    ).toBe('set local lock_timeout = 1000; set local statement_timeout = 4000')
  })
})
