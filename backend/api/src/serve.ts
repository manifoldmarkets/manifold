import * as admin from 'firebase-admin'
import { initAdmin, getServiceAccountCredentials } from 'shared/init-admin'
import { loadSecretsToEnv } from 'shared/secrets'

const LOCAL_DEV = process.env.GOOGLE_CLOUD_PROJECT == null
if (LOCAL_DEV) {
  initAdmin()
} else {
  admin.initializeApp()
}

import { app } from './app'

// No explicit credentials needed for deployed service.
const credentials = LOCAL_DEV ? getServiceAccountCredentials() : undefined
loadSecretsToEnv(credentials).then(() => {
  const PORT = process.env.PORT ?? 8088
  app.listen(PORT, () => {
    console.log(`Serving API on port ${PORT}.`)
  })
})
