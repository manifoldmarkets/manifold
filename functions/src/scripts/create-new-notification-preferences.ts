import * as admin from 'firebase-admin'

import { initAdmin } from './script-init'
import { getAllPrivateUsers, isProd } from 'functions/src/utils'
import { getDefaultNotificationPreferences } from 'common/user-notification-preferences'
initAdmin()

const firestore = admin.firestore()

async function main() {
  const privateUsers = await getAllPrivateUsers()
  const disableEmails = !isProd()
  await Promise.all(
    privateUsers.map((privateUser) => {
      if (!privateUser.id) return Promise.resolve()
      return firestore
        .collection('private-users')
        .doc(privateUser.id)
        .update({
          notificationPreferences: getDefaultNotificationPreferences(
            privateUser.id,
            privateUser,
            disableEmails
          ),
        })
    })
  )
}

if (require.main === module) main().then(() => process.exit())
