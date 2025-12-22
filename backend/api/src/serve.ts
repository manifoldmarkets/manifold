import * as admin from 'firebase-admin'
import { getLocalEnv, initAdmin } from 'shared/init-admin'
import { loadSecretsToEnv, getServiceAccountCredentials } from 'common/secrets'
import { LOCAL_DEV, log } from 'shared/utils'
import { METRIC_WRITER } from 'shared/monitoring/metric-writer'
import { initCaches } from 'shared/init-caches'
import { listen as webSocketListen } from 'shared/websockets/server'

// LOCAL_ONLY mode: Skip Firebase entirely, use local Supabase with env vars
const LOCAL_ONLY = process.env.LOCAL_ONLY === 'true'

log('Api server starting up...')

if (LOCAL_ONLY) {
  log('Running in LOCAL_ONLY mode - skipping Firebase initialization')
  // Create a minimal mock for Firebase admin to prevent crashes
  // when code tries to access admin.auth(), admin.firestore(), etc.
} else if (LOCAL_DEV) {
  initAdmin()
} else {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT
  admin.initializeApp({
    projectId,
    storageBucket: `${projectId}.appspot.com`,
  })
}

if (!LOCAL_ONLY) {
  METRIC_WRITER.start()
}

import { app } from './app'

const credentials = LOCAL_ONLY
  ? undefined  // LOCAL_ONLY: secrets come from env vars, not GCP
  : LOCAL_DEV
  ? getServiceAccountCredentials(getLocalEnv())
  : // No explicit credentials needed for deployed service.
    undefined

const DB_RESPONSE_TIMEOUT = 30_000

const startupProcess = async () => {
  if (LOCAL_ONLY) {
    log('LOCAL_ONLY: Using secrets from environment variables')
    // Secrets should be set in .env.local or exported before running
    // Required: SUPABASE_KEY, SUPABASE_PASSWORD, API_SECRET
  } else {
    await loadSecretsToEnv(credentials)
  }
  log('Secrets loaded.')

  log('Starting server <> postgres timeout')
  const timeoutId = setTimeout(() => {
    log.error(
      `Server hasn't heard from postgres in ${DB_RESPONSE_TIMEOUT}ms. Exiting.`
    )
    throw new Error('Server startup timed out')
  }, DB_RESPONSE_TIMEOUT)

  await initCaches(timeoutId)
  log('Caches loaded.')

  const PORT = process.env.PORT ?? 8088
  const httpServer = app.listen(PORT, () => {
    log.info(`Serving API on port ${PORT}.`)
  })

  if (!process.env.READ_ONLY) {
    webSocketListen(httpServer, '/ws')
    log.info('Web socket server listening on /ws')
  }

  log('Server started successfully')
}
startupProcess()
