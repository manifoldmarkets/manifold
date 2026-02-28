import { ENV } from 'common/envs/constants'
import { getSecrets, getServiceAccountCredentials } from 'common/secrets'
import { createClient } from 'common/supabase/utils'
import { getSupabaseInstanceId } from './db'

// the vercel names for these secrets
let key =
  ENV == 'PROD'
    ? process.env.PROD_ADMIN_SUPABASE_KEY
    : process.env.DEV_ADMIN_SUPABASE_KEY

export async function initSupabaseAdmin() {
  // LOCAL_ONLY mode: use local Supabase URL and admin key from env
  const localUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const localKey =
    process.env.DEV_ADMIN_SUPABASE_KEY || process.env.SUPABASE_KEY
  if (
    process.env.LOCAL_ONLY === 'true' ||
    process.env.NEXT_PUBLIC_LOCAL_ONLY === 'true'
  ) {
    if (localUrl && localKey) {
      return createClient(localUrl, localKey)
    }
  }

  if (key == null) {
    console.warn(
      'Loading Supabase key from GCP. (Should happen only locally, never in production!)'
    )
    const creds = getServiceAccountCredentials(ENV)
    const result = await getSecrets(creds, 'SUPABASE_KEY')
    key = result['SUPABASE_KEY']
  }
  return createClient(getSupabaseInstanceId(), key)
}
