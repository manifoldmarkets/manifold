import * as admin from 'firebase-admin'
import { getLocalEnv } from 'shared/init-admin'
import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'
import { GCPLogLevel } from 'shared/utils'

type GCPLogOutput = {
  severity: GCPLogLevel
  message?: string
  details: any[]
}
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
export function log(severity: GCPLogLevel, message: any, details?: object) {
  const output = { severity, message: message ?? null, ...(details ?? {}) }
  console.log(JSON.stringify(output))
}

log.debug = (message: any, details?: object) => log('DEBUG', message, details)
log.info = (message: any, details?: object) => log('INFO', message, details)
log.warn = (message: any, details?: object) => log('WARNING', message, details)
log.error = (message: any, details?: object) => log('ERROR', message, details)
