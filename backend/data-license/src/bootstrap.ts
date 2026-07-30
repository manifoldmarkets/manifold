// ---------------------------------------------------------------------------
// bootstrap.ts — optional local secret loading.
//
// In the cloud, SUPABASE_PASSWORD / R2 creds arrive via the job's env + Secret
// Manager, so this is a no-op. For local dev convenience (opt-in with
// LOAD_SECRETS=true) it pulls secrets into process.env the same way every other
// backend script does — via the dev/prod service-account key referenced by
// GOOGLE_APPLICATION_CREDENTIALS_{DEV,PROD}. Mirrors backend/scheduler initSecrets.
// ---------------------------------------------------------------------------

import { loadSecretsToEnv, getServiceAccountCredentials } from 'common/secrets'

export async function bootstrapSecrets(): Promise<void> {
  if (process.env.SUPABASE_PASSWORD) return // already supplied
  if (process.env.LOAD_SECRETS !== 'true') return // opt-in, local only

  const env = (process.env.EXPORT_ENV ?? 'DEV') as 'DEV' | 'PROD'
  // Deterministic: if a local service-account key is provided, use it (don't let
  // ambient ADC silently resolve the wrong project). Otherwise use ADC (deployed).
  const hasLocalKey =
    !!process.env[`GOOGLE_APPLICATION_CREDENTIALS_${env}`] ||
    !!process.env[`${env}_FIREBASE_SERVICE_ACCOUNT_KEY`]
  await loadSecretsToEnv(hasLocalKey ? getServiceAccountCredentials(env) : undefined)
}
