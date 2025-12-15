import { ENV } from 'common/envs/constants'
import { getSecrets, getServiceAccountCredentials } from 'common/secrets'
import { createClient } from 'common/supabase/utils'
import { getSupabaseInstanceId } from './db'

// LOCAL_ONLY mode: Skip GCP, use local Supabase with env vars
const LOCAL_ONLY = process.env.LOCAL_ONLY === 'true'

// the vercel names for these secrets
let key =
  ENV == 'PROD'
    ? process.env.PROD_ADMIN_SUPABASE_KEY
    : process.env.DEV_ADMIN_SUPABASE_KEY

export async function initSupabaseAdmin() {
  if (key == null) {
    if (LOCAL_ONLY) {
      // Use SUPABASE_KEY from environment variables
      key = process.env.SUPABASE_KEY
      if (!key) {
        throw new Error('LOCAL_ONLY mode requires SUPABASE_KEY environment variable')
      }
      console.log('LOCAL_ONLY: Using Supabase key from environment variables')
    } else {
      console.warn(
        'Loading Supabase key from GCP. (Should happen only locally, never in production!)'
      )
      const creds = getServiceAccountCredentials(ENV)
      const result = await getSecrets(creds, 'SUPABASE_KEY')
      key = result['SUPABASE_KEY']
    }
  }
  return createClient(getSupabaseInstanceId(), key)
}
