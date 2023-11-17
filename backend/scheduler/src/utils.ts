import * as admin from 'firebase-admin'
import { getLocalEnv } from 'shared/init-admin'
import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'
import { gLog as log } from 'shared/utils'

export async function initGoogleCredentialsAndSecrets() {
  try {
    await loadSecretsToEnv()
    admin.initializeApp()
    log.info('Loaded secrets using GCP service account access.')
  } catch {
    const env = getLocalEnv()
    const credentials = getServiceAccountCredentials(env)
    await loadSecretsToEnv(credentials)
    admin.initializeApp({
      projectId: credentials.project_id,
      credential: admin.credential.cert(credentials),
      storageBucket: `${credentials.project_id}.appspot.com`,
    })
    log.info(
      `Loaded secrets using local credentials for ${credentials.project_id}.`
    )
  }
}
