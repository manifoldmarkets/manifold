const LOCAL_ONLY = process.env.LOCAL_ONLY === 'true'

if (!LOCAL_ONLY) {
  // Normal mode: initialize Firebase and GCP services
  const admin = require('firebase-admin')
  const { getLocalEnv, initAdmin } = require('shared/init-admin')
  const { LOCAL_DEV, log: normalLog } = require('shared/utils')

  normalLog('Api server starting up...')

  if (LOCAL_DEV) {
    initAdmin()
  } else {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT
    admin.initializeApp({
      projectId,
      storageBucket: `${projectId}.appspot.com`,
    })
  }

  const { METRIC_WRITER } = require('shared/monitoring/metric-writer')
  METRIC_WRITER.start()
}

import { log } from 'shared/utils'
import { listen as webSocketListen } from 'shared/websockets/server'

if (LOCAL_ONLY) {
  log('Api server starting up in LOCAL_ONLY mode...')
}

import { app } from './app'

const DB_RESPONSE_TIMEOUT = 30_000

const startupProcess = async () => {
  if (LOCAL_ONLY) {
    log('LOCAL_ONLY mode: skipping Secret Manager, using env vars directly.')
  } else {
    const { loadSecretsToEnv, getServiceAccountCredentials } =
      require('common/secrets')
    const { getLocalEnv } = require('shared/init-admin')
    const { LOCAL_DEV } = require('shared/utils')
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
    const { initCaches } = require('shared/init-caches')
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
