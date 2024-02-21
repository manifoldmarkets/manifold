import * as admin from 'firebase-admin'
import { getLocalEnv, initAdmin } from 'shared/init-admin'
import { loadSecretsToEnv, getServiceAccountCredentials } from 'common/secrets'
import { log } from 'shared/log'

const LOCAL_DEV = process.env.GOOGLE_CLOUD_PROJECT == null
if (LOCAL_DEV) {
  initAdmin()
} else {
  admin.initializeApp()
}

import { app } from './app'

const credentials = LOCAL_DEV
  ? getServiceAccountCredentials(getLocalEnv())
  : // No explicit credentials needed for deployed service.
    undefined
loadSecretsToEnv(credentials).then(() => {
  const PORT = process.env.PORT ?? 8088
  app.listen(PORT, () => {
    log.info(`Serving API on port ${PORT}.`)
  })
})
