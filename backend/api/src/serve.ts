import * as admin from 'firebase-admin'
import { getLocalEnv, initAdmin } from 'shared/init-admin'
import { loadSecretsToEnv, getServiceAccountCredentials } from 'common/secrets'
import { log } from 'shared/utils'
import { METRIC_WRITER } from 'shared/monitoring/metric-writer'
import { initCaches } from 'shared/init-caches'

const LOCAL_DEV = process.env.GOOGLE_CLOUD_PROJECT == null
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

import { app } from './app'

const credentials = LOCAL_DEV
  ? getServiceAccountCredentials(getLocalEnv())
  : // No explicit credentials needed for deployed service.
    undefined
loadSecretsToEnv(credentials).then(() =>
  initCaches().then(() => {
    const PORT = process.env.PORT ?? 8088
    app.listen(PORT, () => {
      log.info(`Serving API on port ${PORT}.`)
    })
  })
)
