import * as admin from 'firebase-admin'
import { getLocalEnv } from 'shared/init-admin'
import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'
import { log } from 'shared/utils'

// LOCAL_ONLY mode: Skip Firebase/GCP, use local Supabase with env vars
const LOCAL_ONLY = process.env.LOCAL_ONLY === 'true'

export function initFirebase() {
  if (LOCAL_ONLY) {
    log.info('LOCAL_ONLY mode - skipping Firebase initialization')
    return
  }
  try {
    admin.initializeApp()
    log.info('Initialized firebase using GCP service account access.')
  } catch {
    const env = getLocalEnv()
    const credentials = getServiceAccountCredentials(env)
    admin.initializeApp({
      projectId: credentials.project_id,
      credential: admin.credential.cert(credentials),
      storageBucket: `${credentials.project_id}.appspot.com`,
    })
    log.info(
      `Initialized firebase using local credentials for ${credentials.project_id}.`
    )
  }
}

export async function initSecrets() {
  if (LOCAL_ONLY) {
    log.info('LOCAL_ONLY mode - using secrets from environment variables')
    return
  }
  try {
    await loadSecretsToEnv()
    log.info('Loaded secrets using GCP service account access.')
  } catch {
    const env = getLocalEnv()
    const credentials = getServiceAccountCredentials(env)
    await loadSecretsToEnv(credentials)
    log.info(
      `Loaded secrets using local credentials for ${credentials.project_id}.`
    )
  }
}
