import { createClient } from 'common/supabase/utils'
import { ENV_CONFIG } from 'common/envs/constants'

function initSupabaseClient(jwt?: string) {
  if (!ENV_CONFIG.supabaseInstanceId || !ENV_CONFIG.supabaseAnonKey) {
    throw new Error("No Supabase config present; Supabase stuff won't work.")
  }
  if (jwt == null) {
    return createClient(
      ENV_CONFIG.supabaseInstanceId,
      ENV_CONFIG.supabaseAnonKey
    )
  } else {
    return createClient(
      ENV_CONFIG.supabaseInstanceId,
      ENV_CONFIG.supabaseAnonKey,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } }
    )
  }
}

export function updateSupabaseAuth(jwt?: string) {
  db = initSupabaseClient(jwt)
}

export let db = initSupabaseClient()
