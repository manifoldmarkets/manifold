import {
  SupabaseTransaction,
  createSupabaseDirectClient,
  SupabaseDirectClient,
  SERIAL_MODE,
} from './supabase/init'
import { log } from 'shared/monitoring/log'

export type TransactionRetryOptions = {
  /**
   * Classifies a failure the caller anticipates and handles itself, so it is
   * logged at WARN rather than ERROR.
   *
   * Exists because a caller that deliberately bounds its own transaction (see
   * the fast oracle tick's lock/statement timeouts) cannot otherwise stop this
   * helper announcing the expected outcome as an error — the outer catch runs
   * too late, so the ERROR line is already emitted and the telemetry already
   * polluted. Scope it narrowly: pass a predicate for the specific codes the
   * caller induced, never a blanket "ignore cancellations".
   */
  isExpectedError?: (error: unknown) => boolean
}

export const runTransactionWithRetries = async <T>(
  callback: (trans: SupabaseTransaction) => Promise<T>,
  maxAttempts = 3,
  options?: TransactionRetryOptions
) => {
  const pg = createSupabaseDirectClient()
  return transactWithRetries(pg, maxAttempts, callback, options)
}

async function transactWithRetries<T>(
  pg: SupabaseDirectClient,
  maxAttempts = 5,
  fn: (t: SupabaseTransaction) => Promise<T>,
  options?: TransactionRetryOptions
): Promise<T> {
  let attempt = 0
  while (true) {
    try {
      attempt++
      // A single-attempt caller has no retry story to narrate, and on a 2s
      // cadence this line would otherwise repeat forever for no information.
      if (maxAttempts > 1) log(`Attempt ${attempt} of ${maxAttempts}`)
      return await pg.tx({ mode: SERIAL_MODE }, fn)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      const code =
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        typeof error.code === 'string'
          ? error.code
          : undefined
      const isRetryable =
        code === '40001' || // serialization_failure
        code === '40P01' // deadlock_detected

      if (!isRetryable || attempt >= maxAttempts) {
        const line = `Attempt ${attempt} of ${maxAttempts} failed: ${message}`
        if (options?.isExpectedError?.(error)) log.warn(line)
        else log.error(line)
        throw error
      }
      log.warn(
        `Attempt ${attempt} of ${maxAttempts} hit retryable PostgreSQL ${code}: ${message}`
      )

      // Exponential backoff with jitter: without jitter, transactions that
      // aborted together retry together and re-collide in lockstep.
      const delay =
        Math.min(100 * Math.pow(2, attempt - 1), 5000) * (0.5 + Math.random())
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}
