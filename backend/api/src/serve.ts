import * as admin from 'firebase-admin'
import { initAdmin } from 'shared/init-admin'

const LOCAL_DEV = process.env.GOOGLE_CLOUD_PROJECT == null
if (LOCAL_DEV) {
  initAdmin()
} else {
  admin.initializeApp()
}

import { app } from './app'

const PORT = process.env.PORT ?? 8088
app.listen(PORT, () => {
  console.log(`Serving API on port ${PORT}.`)
})
