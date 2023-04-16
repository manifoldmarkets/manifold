import { createClient } from 'common/supabase/utils'
import { ENV, ENV_CONFIG } from 'common/envs/constants'

let currentToken: string | undefined

export function initSupabaseClient(permission: 'admin' | 'client') {
  // Init should explicitly fail if requested key is not present
  const key =
    permission == 'admin' && ENV == 'DEV'
      ? process.env.DEV_ADMIN_SUPABASE_KEY
      : permission == 'admin' && ENV == 'PROD'
      ? process.env.PROD_ADMIN_SUPABASE_KEY
      : ENV_CONFIG.supabaseAnonKey
  if (!ENV_CONFIG.supabaseInstanceId || !key) {
    throw new Error(
      "Supabase key not found. Supabase stuff won't work. Requested: " +
        permission
    )
  }
  return createClient(ENV_CONFIG.supabaseInstanceId, key)
}

export function updateSupabaseAuth(token?: string) {
  if (currentToken != token) {
    currentToken = token
    if (token == null) {
      delete (db as any).rest.headers['Authorization']
      ;(db as any).realtime.setAuth(null)
    } else {
      ;(db as any).rest.headers['Authorization'] = `Bearer ${token}`
      ;(db as any).realtime.setAuth(token)
    }
  }
}

export const db = initSupabaseClient('client')
export const adminDb = initSupabaseClient('admin')
