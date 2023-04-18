import { createClient } from 'common/supabase/utils'
import { ENV, ENV_CONFIG } from 'common/envs/constants'
import {
  getSecret,
  getServiceAccountCredentials,
  loadSecretsToEnv,
} from 'common/secrets'

export async function initSupabaseAdmin() {
  let key
  try {
    await loadSecretsToEnv(getServiceAccountCredentials(ENV))
    key = getSecret('SUPABASE_KEY')
  } catch (e) {
    console.error(
      'Could not load google cloud secrets for Supabase admin client.',
      e
    )
    key =
      (ENV === 'PROD'
        ? process.env.PROD_ADMIN_SUPABASE_KEY
        : process.env.DEV_ADMIN_SUPABASE_KEY) ?? ''
  }
  return createClient(ENV_CONFIG.supabaseInstanceId, key)
}
