import { createClient } from 'common/supabase/utils'
import { ENV_CONFIG } from 'common/envs/constants'

let currentToken: string | undefined

export function getSupabaseInstanceId() {
  return ENV_CONFIG.supabaseInstanceId
}

export function initSupabaseClient() {
  // LOCAL_ONLY mode: use local Supabase URL and key from env
  const localUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const localKey =
    process.env.NEXT_PUBLIC_SUPABASE_KEY || process.env.SUPABASE_KEY
  if (localUrl && localKey) {
    return createClient(localUrl, localKey)
  }

  const instanceId = getSupabaseInstanceId()
  return createClient(instanceId, ENV_CONFIG.supabaseAnonKey)
}

export function updateSupabaseAuth(token?: string) {
  if (currentToken != token) {
    currentToken = token
    if (token == null) {
      delete db['rest'].headers['Authorization']
      db['realtime'].setAuth(null)
    } else {
      db['rest'].headers['Authorization'] = `Bearer ${token}`
      db['realtime'].setAuth(token)
    }
  }
}

export const db = initSupabaseClient()
