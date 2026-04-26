import * as admin from 'firebase-admin'
import { getLocalEnv, initAdmin } from 'shared/init-admin'
import { loadSecretsToEnv, getServiceAccountCredentials } from 'common/secrets'
import { LOCAL_DEV, LOCAL_ONLY, log } from 'shared/utils'
import { METRIC_WRITER } from 'shared/monitoring/metric-writer'
import { initCaches } from 'shared/init-caches'
import { listen as webSocketListen } from 'shared/websockets/server'
import { app } from './app'

if (!LOCAL_ONLY) {
  // Normal mode: initialize Firebase and GCP services
  log('Api server starting up...')

  if (LOCAL_DEV) {
    initAdmin()
  } else {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT
    admin.initializeApp({
      projectId,
      storageBucket: `${projectId}.appspot.com`,
    })
  }

  METRIC_WRITER.start()
} else {
  log('Api server starting up in LOCAL_ONLY mode...')
}

const DB_RESPONSE_TIMEOUT = 30_000

const startupProcess = async () => {
  if (LOCAL_ONLY) {
    log('LOCAL_ONLY mode: skipping Secret Manager, using env vars directly.')
  } else {
    const credentials = LOCAL_DEV
      ? getServiceAccountCredentials(getLocalEnv())
      : undefined
    await loadSecretsToEnv(credentials)
    log('Secrets loaded.')
  }

  log('Starting server <> postgres timeout')
  const timeoutId = setTimeout(() => {
    log.error(
      `Server hasn't heard from postgres in ${DB_RESPONSE_TIMEOUT}ms. Exiting.`
    )
    throw new Error('Server startup timed out')
  }, DB_RESPONSE_TIMEOUT)

  if (LOCAL_ONLY) {
    // Skip cache initialization in local mode
    clearTimeout(timeoutId)
    log('LOCAL_ONLY mode: skipping cache initialization.')
  } else {
    await initCaches(timeoutId)
    log('Caches loaded.')
  }

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
