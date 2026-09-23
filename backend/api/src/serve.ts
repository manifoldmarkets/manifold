import * as admin from 'firebase-admin'
import { getLocalEnv, initAdmin } from 'shared/init-admin'
import { loadSecretsToEnv, getServiceAccountCredentials } from 'common/secrets'
import { LOCAL_DEV, LOCAL_ONLY, log } from 'shared/utils'
import { METRIC_WRITER } from 'shared/monitoring/metric-writer'
import { initCaches, scheduleDailyCacheRefresh } from 'shared/init-caches'
import { listen as webSocketListen } from 'shared/websockets/server'
import { app } from './app'
import { markCachesLoaded } from './healthz'

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

  // Answer liveness during cache init so a process restart doesn't trigger a
  // VM repair. deploy-rollout.cjs keeps the old VM until every LB backend
  // reports the replacement ready; MIG liveness alone cannot gate a rollout.
  const PORT = process.env.PORT ?? 8088
  const httpServer = app.listen(PORT, () => {
    log.info(`Serving API on port ${PORT}.`)
  })

  if (!process.env.READ_ONLY) {
    webSocketListen(httpServer, '/ws')
    log.info('Web socket server listening on /ws')
  }

  if (LOCAL_ONLY) {
    // Skip cache initialization in local mode
    log('LOCAL_ONLY mode: skipping cache initialization.')
  } else {
    await initCaches()
    log('Caches loaded.')
    // PM2 only ever restarted the main process; the read replicas keep their
    // startup cache until the next deploy, so leave their db load unchanged.
    if (!process.env.READ_ONLY) scheduleDailyCacheRefresh()
  }
  markCachesLoaded()

  log('Server started successfully')
}
startupProcess().catch((error) => {
  log.error('API startup failed', { error })
  // Let PM2 retry. Readiness has never been marked healthy, and the deployment
  // helper retains the old VM when the replacement cannot initialize.
  process.exit(1)
})
