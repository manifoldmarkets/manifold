import type { SupabaseDirectClient } from './supabase/init'

// Pending perp orders are eligible for observations stamped after
// perp_orders.created_time, which the database clock sets. A publisher whose
// clock led the database could present a price it sampled before an order as
// that order's next observation, so the fast tick stamps with the database
// clock, read just before each request: never later than the request, on the
// same clock as the orders.
export type OracleClock = () => Promise<number>

// For callers that only judge freshness (readiness checks, tests).
export const localOracleClock: OracleClock = async () => Date.now()

// A hung read must fail its poll, not hold a feed (or the shared MNX
// snapshot) in flight.
const CLOCK_READ_TIMEOUT_MS = 1_000

export const databaseOracleClock =
  (pg: SupabaseDirectClient): OracleClock =>
  async () => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(
              `Database clock read took over ${CLOCK_READ_TIMEOUT_MS}ms`
            )
          ),
        CLOCK_READ_TIMEOUT_MS
      )
    })
    try {
      const { ms } = await Promise.race([
        pg.one<{ ms: number }>(
          'select floor(extract(epoch from clock_timestamp()) * 1000)::float8 as ms'
        ),
        timeout,
      ])
      // Whole milliseconds: a published point is re-read by its exact stamp.
      if (!Number.isSafeInteger(ms) || ms <= 0)
        throw new Error(`Invalid database clock reading ${ms}`)
      return ms
    } finally {
      clearTimeout(timer)
    }
  }
