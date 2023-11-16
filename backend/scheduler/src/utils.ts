import * as admin from 'firebase-admin'
import { getLocalEnv, initAdmin } from 'shared/init-admin'
import { getServiceAccountCredentials, loadSecretsToEnv } from 'common/secrets'

// log levels GCP's log explorer recognizes
export const LEVELS = ['DEBUG', 'INFO', 'WARNING', 'ERROR'] as const
type GCPLogLevel = typeof LEVELS[number]

type GCPLogOutput = {
  severity: GCPLogLevel
  message?: string
  details: any[]
}

export async function initGoogleCredentialsAndSecrets() {
  try {
    await loadSecretsToEnv()
    admin.initializeApp()
    admin.app()
    log.info('Loaded secrets using GCP service account access.')
    return {
      isLocal: false,
      projectId: admin.app().options.projectId,
      env: admin.app().options.projectId == 'mantic-markets' ? 'prod' : 'dev',
    }
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
    return {
      isLocal: true,
      projectId: credentials.project_id,
      env: credentials.project_id == 'mantic-markets' ? 'prod' : 'dev',
    }
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
