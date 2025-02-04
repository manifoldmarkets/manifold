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
