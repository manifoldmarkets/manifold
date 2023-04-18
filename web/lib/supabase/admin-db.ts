import { createClient } from 'common/supabase/utils'
import { ENV, ENV_CONFIG } from 'common/envs/constants'
import {
  getSecret,
  getServiceAccountCredentials,
  loadSecretsToEnv,
} from 'common/secrets'

export async function initSupabaseAdmin() {
  await loadSecretsToEnv(getServiceAccountCredentials(ENV))
  return createClient(
    ENV_CONFIG.supabaseInstanceId,
    getSecret('SUPABASE_PASSWORD')
  )
}
