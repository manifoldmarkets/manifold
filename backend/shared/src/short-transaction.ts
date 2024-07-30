import {
  SupabaseTransaction,
  createSupabaseDirectClient,
} from './supabase/init'
import { DEFAULT_QUEUE_TIME_LIMIT } from 'shared/helpers/fn-queue'

export const runShortTrans = async <T>(
  callback: (trans: SupabaseTransaction) => Promise<T>
) => {
  const pg = createSupabaseDirectClient()
  return await pg.timeout(DEFAULT_QUEUE_TIME_LIMIT / 2, callback, false)
}
