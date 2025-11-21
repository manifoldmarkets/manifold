// ============================================================================
// SUPABASE CLIENT INITIALIZATION
// ============================================================================
// Simplified Supabase client for Angola market
// Supports both legacy ENV_CONFIG and new Angola config
// ============================================================================

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from 'common/supabase/utils'
import { ENV_CONFIG } from 'common/envs/constants'
import { getAngolaConfig } from 'common/envs/angola'

// Use Angola config if available, fallback to ENV_CONFIG
const angolaConfig = getAngolaConfig()
const useAngolaConfig =
  angolaConfig.supabaseInstanceId !== 'YOUR_SUPABASE_INSTANCE_ID'

let currentToken: string | undefined

export function getSupabaseInstanceId() {
  return useAngolaConfig
    ? angolaConfig.supabaseInstanceId
    : ENV_CONFIG.supabaseInstanceId
}

export function getSupabaseAnonKey() {
  return useAngolaConfig
    ? angolaConfig.supabaseAnonKey
    : ENV_CONFIG.supabaseAnonKey
}

export function initSupabaseClient() {
  const instanceId = getSupabaseInstanceId()
  const anonKey = getSupabaseAnonKey()

  // Use the common createClient for compatibility
  return createClient(instanceId, anonKey)
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

// Get current auth token from session
export async function getAuthToken(): Promise<string | null> {
  try {
    const {
      data: { session },
    } = await db.auth.getSession()
    return session?.access_token ?? null
  } catch {
    return null
  }
}

// Auto-update auth headers when session changes
export function setupAuthListener() {
  db.auth.onAuthStateChange((event, session) => {
    updateSupabaseAuth(session?.access_token)
  })
}

export const db = initSupabaseClient()
