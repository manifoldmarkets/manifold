import {
  SERIAL_MODE,
  SupabaseTransaction,
  createShortTimeoutDirectClient,
} from './supabase/init'

// significantly less evil!
export const runShortTrans = async <T>(
  callback: (trans: SupabaseTransaction) => Promise<T>
) => {
  const pg = createShortTimeoutDirectClient()
  return await pg.tx({ mode: SERIAL_MODE }, callback)
}
