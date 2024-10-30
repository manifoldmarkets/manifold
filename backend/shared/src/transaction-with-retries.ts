import {
  SupabaseTransaction,
  createSupabaseDirectClient,
  SupabaseDirectClient,
  SERIAL_MODE,
} from './supabase/init'
import { log } from 'shared/monitoring/log'

export const runTransactionWithRetries = async <T>(
  callback: (trans: SupabaseTransaction) => Promise<T>
) => {
  const pg = createSupabaseDirectClient()
  return transactionWithRetries(pg, 3, callback)
}

async function transactionWithRetries<T>(
  pg: SupabaseDirectClient,
  maxAttempts = 5,
  fn: (t: SupabaseTransaction) => Promise<T>
): Promise<T> {
  let attempt = 0
  while (true) {
    try {
      attempt++
      log(`Attempt ${attempt} of ${maxAttempts}`)
      return await pg.tx({ mode: SERIAL_MODE }, fn)
    } catch (error: any) {
      const isRetryable =
        error.code === '40001' || // serialization_failure
        error.code === '40P01' // deadlock_detected

      if (!isRetryable || attempt >= maxAttempts) {
        throw error
      }

      // Exponential backoff
      const delay = Math.min(100 * Math.pow(2, attempt - 1), 5000)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}
