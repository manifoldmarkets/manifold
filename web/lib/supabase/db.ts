import { createClient } from 'common/supabase/utils'
import { ENV_CONFIG } from 'common/envs/constants'

if (!ENV_CONFIG.supabaseInstanceId || !ENV_CONFIG.supabaseAnonKey) {
  throw new Error("No Supabase config present; Supabase stuff won't work.")
}

export const db = createClient(
  ENV_CONFIG.supabaseInstanceId,
  ENV_CONFIG.supabaseAnonKey
)
